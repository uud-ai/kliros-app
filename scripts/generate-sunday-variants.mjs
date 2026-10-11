// Генерирует варианты воскресной службы со святым по знаку святого:
//   vespers-sunday-with-saint-{simple,six,vigil}.json
//   matins-sunday-with-saint-{simple,six,poly}.json
// из общих шаблонов vespers-sunday-with-saint.json / matins-sunday-with-saint.json.
//
// Распределение — по «Краткому уставу соединения церковных служб»
// (Настольная книга священнослужителя, служение воскресное):
//
//   знак святого          «Господи, воззвах»              каноны утрени
//                         воскр. / восточн. / святому     воскр. / крестовоскр. / Богородице / святому
//   без знака (simple)    3 / 4 / 3                       4 / 3 / 3 / 4
//   шестеричный,
//   славословный (six)    3 / 3 / 4                       4 / 2 / 2 / 6
//   полиелейный           3 / 3 / 4  (как six)            4 / — / 2 / 8   (poly)
//   бденный (vigil)       3 / 1 / 6                       4 / — / 2 / 8   (poly)
//
// На «Бог Господь» — тропарь воскресный дважды, «Слава» — святому, «И ныне» —
// Богородичен. На «Господи, воззвах» «Слава» — святому (если есть), «И ныне» —
// догматик гласа. На стиховне «Слава» — святому (если есть). На хвалитех,
// если у святого есть стихиры на «Хвалите», — воскресные 4 и святому 4;
// «Слава» — евангельская стихира.
//
// Строки с only_if / only_if_any / only_if_not показываются только при
// наличии (отсутствии) нужного текста в Минее — см. passesConditions в App.jsx.
//
// Запуск: node scripts/generate-sunday-variants.mjs

import { readFileSync, writeFileSync } from "fs";

const DIR = "./public/data/templates";
const read = (id) => JSON.parse(readFileSync(`${DIR}/${id}.json`, "utf8"));
const write = (id, data) => writeFileSync(`${DIR}/${id}.json`, JSON.stringify(data, null, 2) + "\n", "utf8");

const SOURCE = "Устав — «Краткий Устав соединения церковных служб», Настольная книга священнослужителя (служение воскресное); тексты — Октоих и Минея; скелет — Служебник, изд. Московской Патриархии";

// Варианты ключей Минеи для одних и тех же песнопений (данные заполнялись
// в разное время). Берётся первый найденный.
const SAINT_VESPERS_KEYS = ["vespers_stichiry_3", "vespers_stichiry_4", "vespers_stichiry_6", "vespers_stichiry_8", "vespers_stichiry_saint", "vespers_stichiry", "vespers_stikhiry"];
const SAINT_STIKHOVNA_SLAVA_KEYS = ["vespers_stikhovna_slava", "stikhovny_slava"];
const SAINT_LAUDS_KEYS = ["hvalitny_stichiry_4", "hvalitny_stichiry_3", "hvalitny_stichiry_6", "hvalitny_stichiry_8", "hvalitny_stichiry"];

const m = (k) => `minea.${k}`;

// Цепочка «первый найденный ключ»: по строке на ключ, каждая — только если
// этот ключ есть, а предыдущих нет.
function firstAvailable(keys, makeItem) {
  return keys.map((key, i) => ({
    ...makeItem(key),
    only_if: m(key),
    ...(i > 0 ? { only_if_not: keys.slice(0, i).map(m) } : {}),
  }));
}

function variable(section, role, ns, key, fallback, extra = {}) {
  return { section, role, text: `{{${ns}.${key}}}`, variable_type: ns, variable_key: key, fallback, ...extra };
}

const GLORY = "Сла́ва Отцу́, и Сы́ну, и Свято́му Ду́ху.";
const NOW = "И ны́не и при́сно, и во ве́ки веко́в. Ами́нь.";
const GLORY_NOW = "Сла́ва Отцу́, и Сы́ну, и Свято́му Ду́ху, и ны́не и при́сно, и во ве́ки веко́в. Ами́нь.";

function findIndex(items, pred, what) {
  const i = items.findIndex(pred);
  if (i < 0) throw new Error(`Не найдено: ${what}`);
  return i;
}

// ===== Вечерня =====
const VESPERS_VARIANTS = {
  simple: { anatolKey: "vespers_stikhiry_anatol_4", anatol: 4, saint: 3, title: "без знака" },
  six: { anatolKey: "vespers_stikhiry_anatol_3", anatol: 3, saint: 4, title: "шестеричный, славословный или полиелейный" },
  vigil: { anatolKey: "vespers_stikhiry_anatol_1", anatol: 1, saint: 6, title: "бденный" },
};

function buildVespers(base, variant, v) {
  const t = structuredClone(base);
  let items = t.items;
  const S = "Господи воззвах";

  // Стихиры на «Господи, воззвах»
  const iSun = findIndex(items, (it) => it.variable_key === "vespers_stikhiry" && it.variable_type === "oktoih", "воскресные стихиры");
  const iSaint = findIndex(items, (it) => it.variable_key === "vespers_stikhiry" && it.variable_type === "minea", "стихиры святому");
  const stichera = [
    variable(S, "Стихиры воскресные, на 3", "oktoih", "vespers_stikhiry_voskr_3", "Стихи́ры воскре́сны, гла́са дне́ (текст будет добавлен)."),
    variable(S, `Стихиры восточные (Анатолиевы), на ${v.anatol}`, "oktoih", v.anatolKey, "Стихи́ры восто́чны, гла́са дне́ (текст будет добавлен)."),
    ...firstAvailable(SAINT_VESPERS_KEYS, (key) => variable(S, `Стихиры святому, на ${v.saint}`, "minea", key, "")),
    { section: S, role: `Стихиры святому, на ${v.saint}`, text: "Стихи́ры свято́му — по Мине́и (текст в приложе́ние ещё не внесён).", only_if_not: SAINT_VESPERS_KEYS.map(m) },
  ];
  items.splice(iSun, iSaint - iSun + 1, ...stichera);

  // «Слава» — святому, если есть; иначе «Слава, и ныне» — догматик.
  const iGlory = findIndex(items, (it, i) => i > iSun && it.section === S && it.text === GLORY, "«Слава» на Господи воззвах");
  items[iGlory].only_if = m("vespers_slava");
  items[iGlory + 1] = { ...items[iGlory + 1], only_if: m("vespers_slava"), fallback: "" };
  items[iGlory + 2] = { ...items[iGlory + 2], only_if: m("vespers_slava") };
  items.splice(iGlory + 3, 0, { section: S, role: "Лик", text: GLORY_NOW, only_if_not: m("vespers_slava") });

  // Стиховна: «Слава» — святому, если есть.
  const iStSlava = findIndex(items, (it) => it.variable_key === "stikhovny_slava", "«Слава» на стиховне");
  const ST = items[iStSlava].section;
  items.splice(iStSlava - 1, 3,
    { section: ST, role: "Лик", text: GLORY, only_if_any: SAINT_STIKHOVNA_SLAVA_KEYS.map(m) },
    ...firstAvailable(SAINT_STIKHOVNA_SLAVA_KEYS, (key) => variable(ST, "Стихира на «Славу», святому", "minea", key, "")),
    { section: ST, role: "Лик", text: NOW, only_if_any: SAINT_STIKHOVNA_SLAVA_KEYS.map(m) },
    { section: ST, role: "Лик", text: GLORY_NOW, only_if_not: SAINT_STIKHOVNA_SLAVA_KEYS.map(m) },
  );

  t.items = items;
  t._meta = {
    ...t._meta,
    id: `vespers-sunday-with-saint-${variant}`,
    description: `Воскресная великая вечерня со святым (знак: ${v.title}) — совершается в субботу вечером. На «Господи, воззвах» стихиры воскресные 3, восточные ${v.anatol}, святому ${v.saint}; «Слава» — святому (если есть), «И ныне» — догматик гласа.`,
    source: SOURCE,
    note: `Сгенерировано scripts/generate-sunday-variants.mjs из vespers-sunday-with-saint.json — правки вносить туда и перегенерировать.${variant === "vigil" ? " Малая вечерня и лития (поётся, если святой — храмовый) в этот вариант пока не включены." : ""}`,
  };
  return t;
}

// ===== Утреня =====
const MATINS_VARIANTS = {
  simple: { kresto: true, title: "без знака", canons: "воскресный на 4, крестовоскресный на 3, Богородице на 3, святому на 4" },
  six: { kresto: true, title: "шестеричный или славословный", canons: "воскресный на 4, крестовоскресный на 2, Богородице на 2, святому на 6" },
  poly: { kresto: false, title: "полиелейный или бденный", canons: "воскресный на 4, Богородице на 2, святому на 8" },
};

const SAINT_REFRAIN = "Святы́й уго́дниче Бо́жий, моли́ Бо́га о нас.";

function buildMatins(base, variant, v) {
  const t = structuredClone(base);
  const items = t.items;

  // «Бог Господь»: тропарь воскресный дважды.
  const iTrop = findIndex(items, (it) => it.section === "Тропари по «Бог Господь»" && it.variable_key === "tropar_resurrectional", "тропарь по Бог Господь");
  items.splice(iTrop + 1, 0, { ...items[iTrop], role: "Лик (второй раз)" });

  // Канон
  const canonItem = items.find((it) => it.is_canon);
  canonItem.canon.title = `Каноны: ${v.canons}`;
  for (const ode of canonItem.canon.structure) {
    if (typeof ode.ode !== "number") continue;
    const n = ode.ode;
    let parts = ode.parts;
    if (!v.kresto) {
      parts = parts.filter((p) => !/крестовоскресн/i.test(p.label || "") && !(p.type === "refrain_heading" && /Кресту́/.test(p.text)));
    }
    // Убираем прежний (сокращённый) блок святого и ставим полный: тропари 1–4 той
    // песни, что есть в Минее, с припевом — перед катавасией.
    parts = parts.filter((p) => !(p.type === "refrain_heading" && p.text === SAINT_REFRAIN) && !/{{minea\./.test(p.text || ""));
    const tropKeys = [1, 2, 3, 4].map((k) => `canon_ode${n}_tropar_${k}`);
    const saintBlock = [
      { type: "refrain_heading", label: "Припев:", text: SAINT_REFRAIN, only_if_any: tropKeys.map(m) },
      ...tropKeys.map((key, k) => ({ type: "tropar", label: "Тропарь святому", text: `{{minea.${key}}}`, fallback: "", only_if: m(key), _k: k })),
    ].map(({ _k, ...p }) => p);
    // Канон святому поётся последним, поэтому песнь завершается его
    // Богородичном; если в Минее его нет — Богородичном Октоиха.
    const iBog = parts.findIndex((p) => p.type === "bogorodichen");
    const octoechosBog = iBog >= 0 ? parts.splice(iBog, 1)[0] : null;
    const bogKey = `canon_ode${n}_bogorodichen`;
    const closing = [
      { type: "bogorodichen", label: "Богородичен", text: `{{minea.${bogKey}}}`, fallback: "", only_if: m(bogKey) },
      ...(octoechosBog ? [{ ...octoechosBog, only_if_not: m(bogKey) }] : []),
    ];
    const iKat = parts.findIndex((p) => p.type === "katavasia");
    if (iKat >= 0) parts.splice(iKat, 0, ...saintBlock, ...closing);
    else parts.push(...saintBlock, ...closing);
    ode.parts = parts;
  }

  // Хвалитны: если у святого есть стихиры на «Хвалите» — воскресные 4 и
  // святому 4; иначе все воскресные (8). «Слава» — евангельская стихира.
  const iLauds = findIndex(items, (it) => it.variable_key === "khvalitny_stikhiry", "хвалитные стихиры");
  const LS = items[iLauds].section;
  items.splice(iLauds, 1,
    { ...items[iLauds], only_if_not: SAINT_LAUDS_KEYS.map(m) },
    variable(LS, "Стихиры воскресные, на 4", "oktoih", "khvalitny_stikhiry_voskr_4", "Стихи́ры воскре́сны на «Хвали́те» (текст будет добавлен).", { only_if_any: SAINT_LAUDS_KEYS.map(m) }),
    ...firstAvailable(SAINT_LAUDS_KEYS, (key) => variable(LS, "Стихиры святому, на 4", "minea", key, "")),
  );
  const iLaudsSlava = findIndex(items, (it) => it.variable_key === "hvalitny_slava" && it.variable_type === "minea", "Слава на хвалитех");
  items[iLaudsSlava] = variable(LS, "Стихира евангельская", "oktoih", "khvalitny_slava", "Стихи́ра ева́нгельская — по числу́ у́треннего Ева́нгелия.");

  t._meta = {
    ...t._meta,
    id: `matins-sunday-with-saint-${variant}`,
    description: `Воскресная утреня со святым (знак: ${v.title}). Тропарь воскресный на «Бог Господь» дважды; каноны: ${v.canons}; на хвалитех при стихирах святому — воскресные 4 и святому 4, «Слава» — евангельская.`,
    source: SOURCE,
    note: "Сгенерировано scripts/generate-sunday-variants.mjs из matins-sunday-with-saint.json — правки вносить туда и перегенерировать. Число тропарей в каждом каноне показано в заголовке («на 4» и т. п.); в данных Октоиха воскресные каноны даны сокращённо, тропари святому — сколько есть в Минее.",
  };
  return t;
}

const vespersBase = read("vespers-sunday-with-saint");
for (const [variant, v] of Object.entries(VESPERS_VARIANTS)) {
  write(`vespers-sunday-with-saint-${variant}`, buildVespers(vespersBase, variant, v));
  console.log(`✓ vespers-sunday-with-saint-${variant}`);
}
const matinsBase = read("matins-sunday-with-saint");
for (const [variant, v] of Object.entries(MATINS_VARIANTS)) {
  write(`matins-sunday-with-saint-${variant}`, buildMatins(matinsBase, variant, v));
  console.log(`✓ matins-sunday-with-saint-${variant}`);
}
