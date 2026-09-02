// scripts/verify-typikon.mjs — регрессионная проверка движка устава
// (src/lib/typikon.js) против рукописно составленных public/data/days/*.json,
// плюс проверка, что для другого года (другой день недели/глас) движок
// не падает и даёт согласованный результат.
//
// Запуск: node scripts/verify-typikon.mjs

import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import { planDayService, toMonthDayKey } from "../src/lib/typikon.js";
import { paschaOffset, describeTriodionDay } from "../src/lib/triodion.js";
import { computePascha } from "../src/lib/paschalion.js";

const DAYS_DIR = "./public/data/days";
const MINEA_DIR = "./public/data/minea";

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

// Стабильная сериализация с сортировкой ключей объектов — чтобы сравнение
// не зависело от порядка полей (JSON.stringify сохраняет порядок вставки).
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = stable(value[key]);
        return acc;
      }, {});
  }
  return value;
}

function deepEqual(a, b) {
  return JSON.stringify(stable(a)) === JSON.stringify(stable(b));
}

let failures = 0;
let checked = 0;

console.log("── Сверка движка с рукописными data/days/*.json (2026) ──\n");

const dayFiles = readdirSync(DAYS_DIR).filter((f) => f.endsWith(".json"));

for (const file of dayFiles) {
  const docId = file.replace(/\.json$/, ""); // "2026-10-05"
  const [y, m, d] = docId.split("-").map(Number);
  if (!y || !m || !d) continue;

  const expected = loadJson(join(DAYS_DIR, file));
  const date = new Date(y, m - 1, d);
  const mmdd = toMonthDayKey(date);

  let mineaMeta = null;
  const mineaPath = join(MINEA_DIR, `${mmdd}.json`);
  if (existsSync(mineaPath)) {
    mineaMeta = loadJson(mineaPath)._meta;
  }

  const result = planDayService(date, mineaMeta);

  if (expected.tone === null) {
    // Праздник с полностью самостоятельным последованием (двунадесятый).
    if (!result.ok) {
      console.log(`✗ ${docId}: движок не смог построить план (${result.reason}), а день — праздничный`);
      failures++;
      continue;
    }
    const plan = result.plan;
    const okFeast =
      plan.feastName === expected.feastName &&
      deepEqual(plan.services, expected.services) &&
      plan.tone === null;
    if (!okFeast) {
      console.log(`✗ ${docId}: несовпадение по празднику`);
      console.log("  ожидалось:", JSON.stringify({ feastName: expected.feastName, services: expected.services }));
      console.log("  получено: ", JSON.stringify({ feastName: plan.feastName, services: plan.services }));
      failures++;
    } else {
      checked++;
    }
    continue;
  }

  // Обычный рядовой день (соединение Октоиха и Минеи).
  if (!result.ok) {
    console.log(`✗ ${docId}: движок отказался строить план (${result.reason})`);
    failures++;
    continue;
  }

  const plan = result.plan;
  const mismatches = [];
  if (plan.tone !== expected.tone) mismatches.push(`tone: ${plan.tone} !== ${expected.tone}`);
  if (plan.rank !== expected.rank) mismatches.push(`rank: ${plan.rank} !== ${expected.rank}`);
  if (!deepEqual(plan.services, expected.services)) {
    mismatches.push(`services: ${JSON.stringify(plan.services)} !== ${JSON.stringify(expected.services)}`);
  }
  if (!deepEqual(plan.variables, expected.variables)) {
    mismatches.push(`variables: ${JSON.stringify(plan.variables)} !== ${JSON.stringify(expected.variables)}`);
  }
  if (plan.dateLabel !== expected.dateLabel) {
    mismatches.push(`dateLabel: ${plan.dateLabel} !== ${expected.dateLabel}`);
  }

  if (mismatches.length > 0) {
    console.log(`✗ ${docId} (${expected.feastName}):`);
    mismatches.forEach((m) => console.log(`    ${m}`));
    failures++;
  } else {
    checked++;
  }
}

console.log(`\nПроверено дней: ${checked}, расхождений: ${failures}`);

// ── Проверка обобщения на другой год ──
// Берём тот же день/месяц Минеи, но год с другим выравниванием дней
// недели и другой Пасхалией, и убеждаемся, что движок:
//  1) не падает;
//  2) даёт внутренне согласованный результат (день недели в имени файла
//     Октоиха соответствует Date.getDay() для ЭТОГО года, а не 2026-го).
console.log("\n── Проверка обобщения на другой год (2031) ──\n");

const WEEKDAY_KEY_BY_JS_DAY = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
let otherYearFailures = 0;
let otherYearChecked = 0;

for (const file of readdirSync(MINEA_DIR).filter((f) => f.endsWith(".json"))) {
  const mmdd = file.replace(/\.json$/, "");
  const [mm, dd] = mmdd.split("-").map(Number);
  const date2031 = new Date(2031, mm - 1, dd);
  const mineaMeta = loadJson(join(MINEA_DIR, file))._meta;

  let result;
  try {
    result = planDayService(date2031, mineaMeta);
  } catch (e) {
    console.log(`✗ ${mmdd}/2031: движок упал: ${e.message}`);
    otherYearFailures++;
    continue;
  }

  if (!result.ok) {
    // Допустимо (например, если для этого MM-DD задан особый oktoih-feast
    // override, а год/день недели не совпадают, — это не проверяется
    // здесь), но не должно быть unknown-rank для валидных данных Минеи.
    if (result.reason === "unknown-rank") {
      console.log(`✗ ${mmdd}/2031: неизвестный ранг для валидной Минеи`);
      otherYearFailures++;
    }
    continue;
  }

  const plan = result.plan;
  const isSunday = date2031.getDay() === 0;
  if (!isSunday && plan.variables?.sources?.oktoih && !FEAST_OVERRIDE(mmdd)) {
    const expectedWeekdayKey = WEEKDAY_KEY_BY_JS_DAY[date2031.getDay()];
    if (!plan.variables.sources.oktoih.endsWith(`-${expectedWeekdayKey}`)) {
      console.log(`✗ ${mmdd}/2031: источник Октоиха "${plan.variables.sources.oktoih}" не соответствует дню недели (${expectedWeekdayKey})`);
      otherYearFailures++;
      continue;
    }
  }
  otherYearChecked++;
}

function FEAST_OVERRIDE(mmdd) {
  return mmdd === "09-11";
}

console.log(`Проверено (2031): ${otherYearChecked}, ошибок: ${otherYearFailures}`);

// ── Триодь: обобщение на другой год ──
// Пасха 2031 приходится на другую дату (13 апреля), чем Пасха 2026
// (12 апреля) — набор гражданских чисел под каждым переходящим днём другой,
// но их положение относительно Пасхи (offset) и глас должны совпасть с тем
// же правилом.
console.log("\n── Триодь: обобщение на другой год (2031) ──\n");

let triodFailures = 0;
let triodChecked = 0;

// computePascha возвращает Date в UTC-полночь; чтобы избежать сдвига
// календарного числа при чтении локальных геттеров (getDay/getFullYear) в
// часовых поясах западнее UTC, сразу пересобираем её как локальную дату —
// так же, как это делает остальной код проекта (new Date(y, m-1, d)).
const paschaUTC2031 = computePascha(2031);
const pascha2031 = new Date(
  paschaUTC2031.getUTCFullYear(),
  paschaUTC2031.getUTCMonth(),
  paschaUTC2031.getUTCDate()
);

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

const PENTECOSTARION_SUNDAY_OFFSETS = [0, 7, 14, 21, 28, 35, 42, 49, 56, 63];
for (const offset of PENTECOSTARION_SUNDAY_OFFSETS) {
  const date = addDays(pascha2031, offset);

  let result;
  try {
    result = planDayService(date, null);
  } catch (e) {
    console.log(`✗ offset ${offset}/2031: движок упал: ${e.message}`);
    triodFailures++;
    continue;
  }

  if (!result.ok) {
    console.log(`✗ offset ${offset}/2031: движок отказался строить план (${result.reason})`);
    triodFailures++;
    continue;
  }

  if (date.getDay() !== 0) {
    console.log(`✗ offset ${offset}/2031: дата ${date.toDateString()} — не воскресенье`);
    triodFailures++;
    continue;
  }

  const expectedOffset = paschaOffset(date);
  if (expectedOffset !== offset) {
    console.log(`✗ offset ${offset}/2031: paschaOffset пересчитал как ${expectedOffset}`);
    triodFailures++;
    continue;
  }

  triodChecked++;
}

// Границы цикла: за день до Недели о мытаре и фарисее и за день после Недели
// всех русских святых Триодь уже не должна ничего утверждать (describeTriodionDay
// -> null) — эти дни целиком в ведении рядового устава typikon.js. А сами
// крайние даты цикла (offset -70 и 63), наоборот, должны быть описаны.
const BOUNDARY_CASES = [
  { label: "до начала (offset -71)", offset: -71, expectNull: true },
  { label: "после конца (offset 64)", offset: 64, expectNull: true },
  { label: "начало цикла (offset -70)", offset: -70, expectNull: false },
  { label: "конец цикла (offset 63)", offset: 63, expectNull: false },
];
for (const { label, offset, expectNull } of BOUNDARY_CASES) {
  const date = addDays(pascha2031, offset);
  const described = describeTriodionDay(date);
  const isNull = described == null;
  if (isNull !== expectNull) {
    console.log(`✗ граница цикла, ${label}: describeTriodionDay ${isNull ? "вернул null" : "не вернул null"}`);
    triodFailures++;
  } else {
    triodChecked++;
  }
}

console.log(`Проверено (offset-точек): ${triodChecked}, ошибок: ${triodFailures}`);

const totalFailures = failures + otherYearFailures + triodFailures;
if (totalFailures > 0) {
  console.log(`\n❌ Итого расхождений: ${totalFailures}`);
  process.exit(1);
} else {
  console.log(`\n✅ Все проверки пройдены.`);
}
