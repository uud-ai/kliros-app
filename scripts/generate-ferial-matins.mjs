// Генерирует будничную утреню при святом «без знака» и шестеричном:
//   matins-ferial-simple.json      — простая служба (святой без знака)
//   matins-ferial-six-verse.json   — шестеричная служба
// из общего шаблона matins-ferial-base.json.
//
// Устав — «Краткий Устав соединения церковных служб» (Настольная книга
// священнослужителя), будничная служба; порядок — по Часослову (утреня
// повседневная):
//
//                           простая (без знака)            шестеричная
//   «Бог Господь»           тропарь святому дважды, «Слава, и ныне» — Богородичен (обе)
//   седален святому         только по 3-й песни             по кафизмам и по 3-й песни
//   каноны                  Октоиха 1-й с ирмосом на 6,     Октоиха 1-й на 4, 2-й на 4,
//                           2-й на 4, святому на 4          святому на 6
//   катавасия               ирмос канона святому по 3, 6, 8 и 9-й песням (обе)
//   хвалитны                стихир нет                      стихиры святому — если есть в Минее
//   славословие             читается (обе)
//   после славословия       ектения просительная, стиховны Октоиха, «Благо есть»,
//                           Трисвятое, тропарь святому, «Слава, и ныне» —
//                           Богородичен, ектения сугубая (обе)
//
// Строки с only_if / only_if_any / only_if_not показываются только при наличии
// (отсутствии) нужного текста — см. passesConditions в App.jsx.
//
// Запуск: node scripts/generate-ferial-matins.mjs

import { readFileSync, writeFileSync } from "fs";

const DIR = "./public/data/templates";
const read = (id) => JSON.parse(readFileSync(`${DIR}/${id}.json`, "utf8"));
const write = (id, data) => writeFileSync(`${DIR}/${id}.json`, JSON.stringify(data, null, 2) + "\n", "utf8");

const SOURCE = "Устав — «Краткий Устав соединения церковных служб», Настольная книга священнослужителя (будничная служба); порядок — Часослов (утреня повседневная); тексты — Октоих и Минея; скелет — Служебник, изд. Московской Патриархии";

const m = (k) => `minea.${k}`;
const o = (k) => `oktoih.${k}`;
const GLORY = "Сла́ва Отцу́, и Сы́ну, и Свято́му Ду́ху.";
const NOW = "И ны́не и при́сно, и во ве́ки веко́в. Ами́нь.";
const GLORY_NOW = "Сла́ва Отцу́, и Сы́ну, и Свято́му Ду́ху, и ны́не и при́сно, и во ве́ки веко́в. Ами́нь.";
const SAINT_REFRAIN = "Святы́й уго́дниче Бо́жий, моли́ Бо́га о нас.";
const SAINT_LAUDS_KEYS = ["hvalitny_stichiry_4", "hvalitny_stichiry_3", "hvalitny_stichiry_6", "hvalitny_stichiry_8", "hvalitny_stichiry"];

function firstAvailable(keys, ns, makeItem) {
  const p = (k) => `${ns}.${k}`;
  return keys.map((key, i) => ({
    ...makeItem(key),
    only_if: p(key),
    ...(i > 0 ? { only_if_not: keys.slice(0, i).map(p) } : {}),
  }));
}

function variable(section, role, ns, key, fallback, extra = {}) {
  return { section, role, text: `{{${ns}.${key}}}`, variable_type: ns, variable_key: key, fallback, ...extra };
}

function findIndex(items, pred, what) {
  const i = items.findIndex(pred);
  if (i < 0) throw new Error(`Не найдено: ${what}`);
  return i;
}

const VARIANTS = {
  simple: {
    title: "простая служба (святой без знака)",
    canons: "Октоиха первый с ирмосом на 6, второй на 4, святому на 4",
    saintSedalenAfterKathisma: false,
    lauds: false,
  },
  "six-verse": {
    title: "шестеричная служба",
    canons: "Октоиха первый с ирмосом на 4, второй на 4, святому на 6",
    saintSedalenAfterKathisma: true,
    lauds: true,
  },
};

// ===== Канон =====
const ODES = [1, 3, 4, 5, 6, 7, 8, 9];
const KATAVASIA_AFTER = new Set([3, 6, 8, 9]);
const PETITION = "Па́ки и па́ки ми́ром Го́споду помо́лимся. ... Заступи́, спаси́, поми́луй и сохрани́ нас, Бо́же, Твое́ю благода́тию.";

function octoechosCanon(prefix, n, label, withIrmos) {
  const k = (s) => `${prefix}_ode${n}_${s}`;
  return [
    ...(withIrmos ? [{ type: "irmos", label: `Ирмос (${label})`, text: `{{oktoih.${k("irmos")}}}`, fallback: "", only_if: o(k("irmos")) }] : []),
    // Припев к тропарям канона Октоиха (свой у каждого канона дня).
    { type: "refrain_heading", label: "Припев:", text: `{{oktoih.${prefix}_refrain}}`, fallback: "", only_if: [o(`${prefix}_refrain`), o(k("tropar_1"))] },
    { type: "tropar", label: `Тропарь (${label})`, text: `{{oktoih.${k("tropar_1")}}}`, fallback: "", only_if: o(k("tropar_1")) },
    { type: "tropar", label: `Тропарь (${label})`, text: `{{oktoih.${k("tropar_2")}}}`, fallback: "", only_if: o(k("tropar_2")) },
    { type: "tropar", label: `Тропарь (${label})`, text: `{{oktoih.${k("tropar_3")}}}`, fallback: "", only_if: o(k("tropar_3")) },
    { type: "tropar", label: `Тропарь (${label})`, text: `{{oktoih.${k("tropar_4")}}}`, fallback: "", only_if: o(k("tropar_4")) },
    { type: "bogorodichen", label: `Богородичен (${label})`, text: `{{oktoih.${k("bogorodichen")}}}`, fallback: "", only_if: o(k("bogorodichen")) },
  ];
}

function buildOde(n) {
  const octoechosKeys = ["canon_cross", "canon_theotokos"].flatMap((p) => [`${p}_ode${n}_irmos`, `${p}_ode${n}_tropar_1`]).map(o);
  const tropKeys = [1, 2, 3, 4].map((k) => `canon_ode${n}_tropar_${k}`);
  const bogKey = `canon_ode${n}_bogorodichen`;
  const irmosKey = `canon_ode${n}_irmos`;
  const parts = [
    { type: "refrain_heading", label: "Октоих:", text: `Тропари́ кано́нов Окто́иха ${n}-й пе́сни в приложе́ние ещё не внесены́ — пою́тся по Окто́иху.`, only_if_not: octoechosKeys },
    ...octoechosCanon("canon_cross", n, "первый канон Октоиха", true),
    ...octoechosCanon("canon_theotokos", n, "второй канон Октоиха", false),
    { type: "refrain_heading", label: "Припев:", text: SAINT_REFRAIN, only_if_any: tropKeys.map(m) },
    ...tropKeys.map((key) => ({ type: "tropar", label: "Тропарь святому", text: `{{minea.${key}}}`, fallback: "", only_if: m(key) })),
    { type: "refrain_heading", label: "Канон святому:", text: `Тропари́ кано́на свято́му ${n}-й пе́сни в приложе́ние ещё не внесены́ — пою́тся по Мине́и.`, only_if_not: tropKeys.map(m) },
    { type: "bogorodichen", label: "Богородичен", text: `{{minea.${bogKey}}}`, fallback: "", only_if: m(bogKey) },
  ];
  if (n === 8) {
    parts.push({ type: "tropar", label: "Лик", text: "Хва́лим, благослови́м, покланя́емся Го́сподеви, пою́ще и превознося́ще во вся ве́ки." });
  }
  if (KATAVASIA_AFTER.has(n)) {
    parts.push(
      { type: "katavasia", label: "Катавасия (ирмос канона святому)", text: `{{minea.${irmosKey}}}`, fallback: "", only_if: m(irmosKey) },
      { type: "katavasia", label: "Катавасия", text: `Катава́сия — ирмо́с ${n}-й пе́сни после́днего кано́на (свято́му).`, only_if_not: m(irmosKey) },
    );
  }
  return { ode: n, title: `Песнь ${n}`, parts };
}

function buildCanon(sundayBase) {
  const sundayCanon = sundayBase.items.find((it) => it.is_canon).canon;
  const before9 = structuredClone(sundayCanon.structure.find((s) => s.ode === "before_9"));
  const structure = [];
  for (const n of ODES) {
    if (n === 9) structure.push(before9);
    structure.push(buildOde(n));
    if (n === 3) {
      structure.push({
        ode: "after_3",
        title: "Малая ектения и седален по 3-й песни",
        parts: [
          { type: "tropar", label: "Диакон", text: PETITION },
          ...firstAvailable(["sedalen_after_ode3", "sedalen"], "minea", (key) => ({ type: "tropar", label: "Седален святому", text: `{{minea.${key}}}`, fallback: "" })),
          { type: "refrain_heading", label: "Седален:", text: "Седа́лен свято́му — по Мине́и (текст в приложе́ние ещё не внесён).", only_if_not: [m("sedalen_after_ode3"), m("sedalen")] },
          { type: "refrain_heading", label: GLORY_NOW },
          { type: "bogorodichen", label: "Богородичен", text: "{{minea.sedalen_after_ode3_bogorodichen}}", fallback: "", only_if: m("sedalen_after_ode3_bogorodichen") },
          { type: "bogorodichen", label: "Богородичен", text: "{{oktoih.sedalen_after_kafisma_3_bogorodichen}}", fallback: "Богоро́дичен седа́льна (текст будет добавлен).", only_if_not: m("sedalen_after_ode3_bogorodichen") },
        ],
      });
    }
    if (n === 6) {
      structure.push({
        ode: "after_6",
        title: "Малая ектения, кондак и икос по 6-й песни",
        parts: [
          { type: "tropar", label: "Диакон", text: PETITION },
          { type: "tropar", label: "Кондак святому", text: "{{minea.kondak}}", fallback: "", only_if: m("kondak") },
          { type: "tropar", label: "Икос", text: "{{minea.ikos}}", fallback: "", only_if: m("ikos") },
          { type: "refrain_heading", label: "Кондак:", text: "Кондака́ свято́му нет — поётся конда́к Окто́иха.", only_if_not: m("kondak") },
        ],
      });
    }
    if (n === 9) {
      structure.push({
        ode: "after_9",
        title: "По 9-й песни",
        parts: [
          { type: "tropar", label: "Лик", text: "Досто́йно есть я́ко вои́стинну блажи́ти Тя, Богоро́дицу, Присноблаже́нную и Пренепоро́чную и Ма́терь Бо́га на́шего. Честне́йшую Херуви́м и сла́внейшую без сравне́ния Серафи́м, без истле́ния Бо́га Сло́ва ро́ждшую, су́щую Богоро́дицу Тя велича́ем." },
          { type: "tropar", label: "Диакон", text: PETITION },
        ],
      });
    }
  }
  return structure;
}

// ===== Утреня целиком =====
function buildMatins(base, sundayBase, variant, v) {
  const t = structuredClone(base);
  let items = t.items;

  // «Бог Господь»: тропарь святому дважды.
  const iTrop = findIndex(items, (it) => it.section === "Тропарь по «Бог Господь»" && it.variable_key === "tropar", "тропарь по Бог Господь");
  items.splice(iTrop + 1, 0, { ...items[iTrop], role: "Лик (второй раз)" });

  // Седален святому по кафизмах — только на шестеричной.
  if (!v.saintSedalenAfterKathisma) {
    items = items.filter((it) => it.section !== "Седален святому");
  } else {
    items = items.map((it) => (it.section === "Седален святому" ? { ...it, only_if: m("sedalen") } : it));
  }

  // Канон
  const canonItem = items.find((it) => it.is_canon);
  canonItem.canon = { title: `Каноны: ${v.canons}; катавасия — ирмос канона святому`, structure: buildCanon(sundayBase) };

  // Светилен: Октоиха дня, «Слава» — святому (если есть), «И ныне» — Богородичен.
  const iSvet = findIndex(items, (it) => it.section === "Светилен", "светилен");
  const SV = "Светилен";
  items.splice(iSvet, 1,
    { section: SV, role: "Предуведомление", text: "Свети́лен Окто́иха дне; «Сла́ва» — свети́лен свято́му (е́сли есть), «И ны́не» — Богоро́дичен." },
    { section: SV, role: "Лик", text: GLORY, only_if: m("svetilen") },
    variable(SV, "Светилен святому", "minea", "svetilen", "", { only_if: m("svetilen") }),
    { section: SV, role: "Лик", text: NOW, only_if: m("svetilen") },
  );

  // Хвалитны: на простой службе стихир нет; на шестеричной — если есть в Минее.
  const iLaudsStart = items.findIndex((it) => it.section === "Стихиры на хвалитех");
  const iLaudsEnd = items.findLastIndex((it) => it.section === "Стихиры на хвалитех");
  const lauds = v.lauds
    ? [
        ...firstAvailable(SAINT_LAUDS_KEYS, "minea", (key) => variable("Стихиры на хвалитех", "Стихиры святому, на 4", "minea", key, "")),
        { section: "Стихиры на хвалитех", role: "Лик", text: GLORY, only_if: m("hvalitny_slava") },
        variable("Стихиры на хвалитех", "Стихира на «Славу»", "minea", "hvalitny_slava", "", { only_if: m("hvalitny_slava") }),
        { section: "Стихиры на хвалитех", role: "Лик", text: NOW, only_if_any: SAINT_LAUDS_KEYS.map(m) },
        ...firstAvailable(["hvalitny_bogorodichen", "hvalitny_i_nyne"], "minea", (key) => variable("Стихиры на хвалитех", "Богородичен", "minea", key, "")),
        { section: "Стихиры на хвалитех", role: "Богородичен", text: "Богоро́дичен — по Мине́и (текст в приложе́ние ещё не внесён).", only_if_any: SAINT_LAUDS_KEYS.map(m), only_if_not: [m("hvalitny_bogorodichen"), m("hvalitny_i_nyne")] },
      ]
    : [];
  items.splice(iLaudsStart, iLaudsEnd - iLaudsStart + 1,
    ...lauds,
    { section: "Славословие", role: "Иерей", text: "Тебе́ сла́ва подоба́ет, Го́споду Бо́гу на́шему, и Тебе́ сла́ву возсыла́ем, Отцу́, и Сы́ну, и Свято́му Ду́ху, ны́не и при́сно, и во ве́ки веко́в." },
    { section: "Славословие", role: "Лик", text: "Ами́нь." },
  );
  items = items.map((it) =>
    it.section === "Славословие" && it.role === "Предуведомление"
      ? { ...it, text: `На ${variant === "simple" ? "просто́й" : "шестери́чной"} слу́жбе вели́кое славосло́вие чита́ется, а не поётся. Пред ним: «Тебе́ сла́ва подоба́ет...»${v.lauds ? "" : "; стихи́р на хвали́тех нет"}.` }
      : it
  );

  // Порядок по Часослову: после славословия — ектения просительная и стиховны;
  // ектения сугубая — после тропаря в конце утрени.
  const sugubaya = items.filter((it) => it.section === "Ектения сугубая");
  items = items.filter((it) => it.section !== "Ектения сугубая");
  const iEndTrop = findIndex(items, (it) => it.section === "Завершение Утрени" && it.variable_key === "tropar", "тропарь в конце утрени");
  items.splice(iEndTrop + 1, 0,
    { section: "Завершение Утрени", role: "Лик", text: GLORY_NOW },
    variable("Завершение Утрени", "Богородичен", "oktoih", "tropar_bogorodichen_otpustitelny", "Богоро́дичен отпусти́тельный, по гла́су тропаря́ (текст будет добавлен)."),
    ...sugubaya,
  );

  t.items = items;
  t._meta = {
    ...t._meta,
    id: `matins-ferial-${variant}`,
    description: `Будничная утреня, ${v.title}. Тропарь святому на «Бог Господь» дважды; каноны: ${v.canons}; катавасия — ирмос канона святому; славословие читается.`,
    source: SOURCE,
    status: "generated",
    note: "Сгенерировано scripts/generate-ferial-matins.mjs из matins-ferial-base.json — правки вносить туда и перегенерировать. Песни канона показываются, когда тексты есть в данных: в седмичном Октоихе приложения пока внесены песни 1, 3 и 9; на месте недостающих — пометка. Число тропарей каждого канона — в заголовке («на 6», «на 4»).",
  };
  return t;
}

const base = read("matins-ferial-base");
const sundayBase = read("matins-sunday-with-saint");
for (const [variant, v] of Object.entries(VARIANTS)) {
  write(`matins-ferial-${variant}`, buildMatins(base, sundayBase, variant, v));
  console.log(`✓ matins-ferial-${variant}`);
}
