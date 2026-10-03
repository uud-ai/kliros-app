// Текст чтения дня (Апостол/Евангелие) на Литургии.
//
// data/minea/*.json даёт только ссылку на зачало — например,
// "Ева́нгелие от Луки́, зача́ло 24." (поле liturgy_gospel_reading). Этого
// недостаточно для вычитки на клиросе — нужен сам текст. Этот модуль
// разбирает такую ссылку, находит диапазон стихов по таблице зачал
// (public/data/zachala/{apostle,gospel}.json) и вырезает текст из корпуса
// синодального перевода (public/data/bible/{код книги}.json).
//
// Оба набора данных собраны один раз скриптом scripts/build-readings-data.mjs
// из общественного достояния/MIT источников — сеть при работе приложения не
// нужна. Таблица зачал — не весь богослужебный год (им задаётся лишь то, ЧТО
// за номер зачала означает чьё распределение по дням — это уже даёт
// data/minea), а соответствие "номер зачала → главы и стихи", которое не
// зависит от года и обычая соединения.
//
// Модуль работает одинаково в браузере и в Node, не имеет побочных эффектов:
// на вход — уже загруженные JSON (как typikon.js).

const EVANGELIST_GENITIVE_TO_KEY = {
  "матфея": "Matthew",
  "марка": "Mark",
  "луки": "Luke",
  "иоанна": "John",
};

// Снимает ударения (U+0301 и т.п.), чтобы регулярка не зависела от того,
// где в слове проставлен акцент.
function stripAccents(text) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Разбирает ссылку из Минеи на зачало.
 * @param {string} citation — например, "Ева́нгелие от Луки́, зача́ло 24."
 *   или "Апо́стол ко Евре́ем, зача́ло 318."
 * @param {"apostle" | "gospel"} kind
 * @returns {{ evangelist: string | null, zaNum: string } | null}
 */
export function parseZachaloCitation(citation, kind) {
  if (!citation) return null;
  const plain = stripAccents(citation).toLowerCase();

  const numMatch = plain.match(/зачало\s+([0-9]+[a-zа-я]*)/i);
  if (!numMatch) return null;
  const zaNum = numMatch[1];

  if (kind === "gospel") {
    const evMatch = plain.match(/от\s+(матфея|марка|луки|иоанна)/);
    const evangelist = evMatch ? EVANGELIST_GENITIVE_TO_KEY[evMatch[1]] : null;
    if (!evangelist) return null;
    return { evangelist, zaNum };
  }
  return { evangelist: null, zaNum };
}

// Отбрасывает буквенный суффикс зачала ("34ctr" → "34"): таблица
// paulkachur/orthodox_calendar и русская печатная нумерация расходятся в
// обозначении праздничных вариантов зачала, сам номер при этом совпадает.
function baseZaNum(zaNum) {
  const m = zaNum.match(/^[0-9]+/);
  return m ? m[0] : zaNum;
}

/**
 * @param {{evangelist, zaNum}} parsed — результат parseZachaloCitation
 * @param {"apostle"|"gospel"} kind
 * @param {object} zachalaTable — содержимое apostle.json или gospel.json
 * @returns {Array<{book,c1,v1,c2,v2}> | null}
 */
export function resolveZachaloRanges(parsed, kind, zachalaTable) {
  if (!parsed || !zachalaTable) return null;
  const table = kind === "gospel" ? zachalaTable[parsed.evangelist] : zachalaTable;
  if (!table) return null;
  return table[parsed.zaNum] || table[baseZaNum(parsed.zaNum)] || null;
}

/** Книги (коды zaVerses в нижнем регистре), нужные для диапазона ранее найденных зачал. */
export function booksNeededFor(ranges) {
  return [...new Set((ranges || []).map((r) => r.book.toLowerCase()))];
}

/**
 * Вырезает текст диапазона стихов из уже загруженной книги.
 * @param {object} bookData — public/data/bible/{код}.json ({глава: {стих: текст}})
 * @param {{c1,v1,c2,v2}} range
 */
function sliceRange(bookData, { c1, v1, c2, v2 }) {
  const verses = [];
  for (let c = c1; c <= c2; c++) {
    const chapter = bookData[String(c)];
    if (!chapter) continue;
    const vFrom = c === c1 ? v1 : 1;
    const vTo = c === c2 ? v2 : Math.max(...Object.keys(chapter).map(Number));
    for (let v = vFrom; v <= vTo; v++) {
      if (chapter[String(v)]) verses.push(chapter[String(v)]);
    }
  }
  return verses.join(" ");
}

/**
 * @param {Array<{book,c1,v1,c2,v2}>} ranges
 * @param {(code: string) => object | undefined} getBookData — code в нижнем регистре
 * @returns {string | null} — null, если текст хотя бы одного диапазона не загружен
 */
export function buildReadingText(ranges, getBookData) {
  if (!ranges || !ranges.length) return null;
  const parts = ranges.map((range) => {
    const bookData = getBookData(range.book.toLowerCase());
    if (!bookData) return null;
    return sliceRange(bookData, range);
  });
  if (parts.some((p) => !p)) return null;
  return parts.join(" … ");
}
