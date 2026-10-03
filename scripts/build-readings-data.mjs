// scripts/build-readings-data.mjs — собрать данные для реальных чтений
// Апостола/Евангелия на Литургии: текст (синодальный перевод, общественное
// достояние) + таблицу зачал (номер зачала → главы/стихи).
//
// Источники (оба общественное достояние/MIT, скачиваются один раз в эту
// папку — сетевой доступ при работе приложения не требуется):
//   - текст: github.com/bibleonline/rst (USFM, синодальный перевод РБО)
//   - таблица зачал: github.com/paulkachur/orthodox_calendar (sql/zachalosKJ.sql, MIT)
//
// Зачало в data/minea/*.json (поля liturgy_apostle_reading/liturgy_gospel_reading)
// даёт только номер ("зачало 318") — этот скрипт готовит данные, по которым
// src/lib/readings.js находит диапазон стихов и вырезает из них текст.
//
// Использование: node scripts/build-readings-data.mjs

import { writeFileSync, mkdirSync } from "fs";

const BIBLE_DIR = "./public/data/bible";
const ZACHALA_DIR = "./public/data/zachala";

// Код зачал (zaBook/zaVerses в zachalosKJ.sql) → имя файла USFM в bibleonline/rst.
const BOOK_SOURCES = {
  Matt: "52-matthew", Mark: "53-mark", Luke: "54-luke", John: "55-john",
  Acts: "56-acts", James: "57-james", "1Peter": "58-1peter", "2Peter": "59-2peter",
  "1John": "60-1john", "2John": "61-2john", "3John": "62-3john", Jude: "63-jude",
  Rom: "64-romans", "1Cor": "65-1corinthians", "2Cor": "66-2corinthians",
  Gal: "67-galatians", Eph: "68-ephesians", Phil: "69-philippians", Col: "70-colossians",
  "1Thess": "71-1thessalonians", "2Thess": "72-2thessalonians",
  "1Tim": "73-1timothy", "2Tim": "74-2timothy", Titus: "75-titus",
  Philemon: "76-philemon", Heb: "77-hebrews",
};

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

// USFM → { "глава": { "стих": "текст" } }. Снимаем только разметку
// (\p, \add..\add*), сам текст не трогаем.
function parseUsfm(usfm) {
  const book = {};
  let chapter = null;
  for (const rawLine of usfm.split("\n")) {
    const cMatch = rawLine.match(/^\\c\s+(\d+)/);
    if (cMatch) {
      chapter = cMatch[1];
      book[chapter] = book[chapter] || {};
      continue;
    }
    const vMatch = rawLine.match(/\\v\s+(\d+)\s+(.*)$/);
    if (vMatch && chapter) {
      const text = vMatch[2]
        .replace(/\\\+?\w+\*?/g, "")
        .replace(/\s{2,}/g, " ")
        .trim();
      book[chapter][vMatch[1]] = text;
    }
  }
  return book;
}

async function buildBibleTexts() {
  mkdirSync(BIBLE_DIR, { recursive: true });
  for (const [code, usfmName] of Object.entries(BOOK_SOURCES)) {
    const url = `https://raw.githubusercontent.com/bibleonline/rst/master/usfm/rst66/${usfmName}.usfm`;
    const usfm = await fetchText(url);
    const book = parseUsfm(usfm);
    const outName = code.toLowerCase();
    writeFileSync(`${BIBLE_DIR}/${outName}.json`, JSON.stringify(book));
    console.log(`bible/${outName}.json: ${Object.keys(book).length} глав`);
  }
}

// "'a', 'b', ...'" → ["a","b",...]. Поля зачал не содержат одинарных кавычек.
function parseSqlRow(line) {
  const m = line.match(/^insert into zachalos values\(0, (.+)\);$/);
  if (!m) return null;
  const fields = [];
  const re = /'((?:[^'])*)'|(\d+)/g;
  let match;
  while ((match = re.exec(m[1]))) {
    fields.push(match[1] !== undefined ? match[1] : match[2]);
  }
  return fields;
}

// "Heb_7026_8002" → { book: "Heb", c1: 7, v1: 26, c2: 8, v2: 2 }
function parseVerseRange(segment) {
  const [book, start, end] = segment.split("_");
  const chapterOf = (s) => parseInt(s.slice(0, -3) || "0", 10);
  const verseOf = (s) => parseInt(s.slice(-3), 10);
  return { book, c1: chapterOf(start), v1: verseOf(start), c2: chapterOf(end), v2: verseOf(end) };
}

async function buildZachalaTables() {
  mkdirSync(ZACHALA_DIR, { recursive: true });
  const sql = await fetchText(
    "https://raw.githubusercontent.com/paulkachur/orthodox_calendar/master/sql/zachalosKJ.sql"
  );

  const gospel = { Matthew: {}, Mark: {}, Luke: {}, John: {} };
  const apostle = {};
  let skipped = 0;

  for (const rawLine of sql.split("\n")) {
    const line = rawLine.trimEnd();
    if (!line.startsWith("insert into zachalos values")) continue;
    const fields = parseSqlRow(line);
    if (!fields) { skipped++; continue; }
    const [zaNum, zaBook, , , , , , , zaVerses] = fields;
    if (!zaVerses) continue;
    const ranges = zaVerses.split("|").map(parseVerseRange);

    if (zaBook === "Apostol") apostle[zaNum] = ranges;
    else if (gospel[zaBook]) gospel[zaBook][zaNum] = ranges;
    // zaBook === "OT" (паремии) — не нужны для чтений Литургии, пропускаем.
  }

  writeFileSync(`${ZACHALA_DIR}/gospel.json`, JSON.stringify(gospel));
  writeFileSync(`${ZACHALA_DIR}/apostle.json`, JSON.stringify(apostle));
  console.log(
    `zachala/apostle.json: ${Object.keys(apostle).length} записей; ` +
    `gospel.json: Мф ${Object.keys(gospel.Matthew).length}, Мк ${Object.keys(gospel.Mark).length}, ` +
    `Лк ${Object.keys(gospel.Luke).length}, Ин ${Object.keys(gospel.John).length}` +
    (skipped ? ` (пропущено нераспарсенных строк: ${skipped})` : "")
  );
}

await buildBibleTexts();
await buildZachalaTables();
