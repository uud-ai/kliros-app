// scripts/generate-day.mjs — построить план службы дня (соединение Октоиха
// и Минеи по уставу) для произвольной даты, используя движок
// src/lib/typikon.js, вместо ручного составления data/days/*.json.
//
// Использование:
//   node scripts/generate-day.mjs 2026-10-05            — вывести план в stdout
//   node scripts/generate-day.mjs 2026-10-05 --write     — записать в public/data/days/2026-10-05.json
//   node scripts/generate-day.mjs 2026-09-10:2026-12-13 --write   — диапазон дат
//
// Работает для любого года: число/месяц определяют, какой файл Минеи
// использовать (public/data/minea/MM-DD.json), год влияет только на глас
// (Пасхалия) и день недели — оба вычисляются заново для каждой даты.

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { planDayService, toMonthDayKey, toDocId } from "../src/lib/typikon.js";

const MINEA_DIR = "./public/data/minea";
const DAYS_DIR = "./public/data/days";

function parseDate(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function eachDate(from, to) {
  const dates = [];
  const cur = new Date(from);
  while (cur.getTime() <= to.getTime()) {
    dates.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

function loadMineaMeta(date) {
  const mmdd = toMonthDayKey(date);
  const path = join(MINEA_DIR, `${mmdd}.json`);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"))._meta;
}

function main() {
  const args = process.argv.slice(2);
  const shouldWrite = args.includes("--write");
  const spec = args.find((a) => !a.startsWith("--"));

  if (!spec) {
    console.error("Использование: node scripts/generate-day.mjs <YYYY-MM-DD>[:<YYYY-MM-DD>] [--write]");
    process.exit(1);
  }

  const [fromStr, toStr] = spec.split(":");
  const from = parseDate(fromStr);
  const to = toStr ? parseDate(toStr) : from;

  let ok = 0;
  let failed = 0;

  for (const date of eachDate(from, to)) {
    const docId = toDocId(date);
    const mineaMeta = loadMineaMeta(date);
    const result = planDayService(date, mineaMeta);

    if (!result.ok) {
      console.error(`✗ ${docId}: ${result.reason}`);
      failed++;
      continue;
    }

    if (shouldWrite) {
      writeFileSync(
        join(DAYS_DIR, `${docId}.json`),
        JSON.stringify(result.plan, null, 2) + "\n",
        "utf8"
      );
      console.log(`✓ ${docId} → data/days/${docId}.json`);
    } else {
      console.log(`=== ${docId} ===`);
      console.log(JSON.stringify(result.plan, null, 2));
    }
    ok++;
  }

  console.log(`\nГотово: ${ok} построено, ${failed} пропущено.`);
  if (failed > 0) process.exit(1);
}

main();
