// Устав соединения службы святого (Минея) и службы дня (Октоих).
//
// Печатная Минея указывает для каждого святого фиксированного числа один из
// знаков праздника (см. Типикон, гл. 47 «Марковы главы» и общее учение о
// знаках): без знака, шестеричный, славословный, полиелейный, бденный —
// либо число вовсе не является рядовым (двунадесятый/храмовой праздник,
// службы которого при печати полностью замещают Октоих). От этого знака,
// а также от того, не совпадает ли число с воскресеньем, зависит НЕ текст
// святого и Октоиха (тексты уже готовы в data/minea и data/templates), а
// то, какой именно комплект типовых шаблонов взять и какой файл Октоиха
// подставить переменными — т.е. как их "сшить" в службу дня.
//
// Модуль работает одинаково в браузере (Vite) и в Node (скрипты генерации),
// не имеет побочных эффектов и не обращается к сети/Firestore — на вход
// принимает уже загруженные данные, на выход отдаёт декларативный план дня
// той же формы, что и рукописные файлы data/days/*.json.

import { computeGlas } from "./paschalion.js";
import { describeTriodionDay, paschaOffset, planPaschaService, planPentecostarionSunday, planLentenSundayService, planFixedProperService } from "./triodion.js";

// ===== Общие календарные утилиты =====

const WEEKDAY_NAMES = [
  "Воскресенье", "Понедельник", "Вторник", "Среда",
  "Четверг", "Пятница", "Суббота",
];

const MONTH_NAMES_NOMINATIVE = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

const MONTH_NAMES_GENITIVE = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

// Ключ Октоиха для будних дней недели (0=вс..6=сб). Воскресенье не имеет
// "будничного" файла Октоиха — у него самостоятельный, воскресный корпус
// текстов (oktoih-variables-glasN), поэтому для вс здесь null.
const WEEKDAY_OKTOIH_KEYS = [null, "mon", "tue", "wed", "thu", "fri", "sat"];

export function toMonthDayKey(date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${month}-${day}`;
}

export function toDocId(date) {
  const year = date.getFullYear();
  return `${year}-${toMonthDayKey(date)}`;
}

export function formatDateLabel(date) {
  return `${WEEKDAY_NAMES[date.getDay()]}, ${date.getDate()} ${MONTH_NAMES_GENITIVE[date.getMonth()]} ${date.getFullYear()}`;
}

export function periodLabel(date) {
  return `Минея. ${MONTH_NAMES_NOMINATIVE[date.getMonth()]}`;
}

// ===== Знаки праздника (ранги) =====
// Единственный источник истины — это НЕ рукописные data/days/*.json (там
// год 2026 конкретный), а Минея: rank в data/minea/MM-DD.json — свойство
// самого святого/праздника числа, не зависящее от того, на какой день
// недели число выпало в конкретном году. См. RANK_ORDER — это "рядовые"
// (соединяемые с Октоихом) ранги; всё, что выше — уже не соединение,
// а полное самостоятельное последование праздника (см. FIXED_GREAT_FEASTS).
export const RANK_ORDER = ["ferial", "six-verse", "doxology", "polyeleos", "vigil"];

function isKnownRank(rank) {
  return RANK_ORDER.includes(rank);
}

// ===== Комплекты шаблонов для будничного дня (не воскресенье) =====
// Ключ — ранг святого по Минее. Значение — id шаблонов вечерни/утрени/
// литургии и часов, которые уже содержат правильное типиконское
// соотношение стихир/тропарей/канонов Октоиха и Минеи для этого ранга
// (само соотношение "зашито" в data/templates/*, здесь мы лишь выбираем
// нужный комплект).
const FERIAL_SERVICE_SETS = {
  "ferial": {
    vespers: "vespers-ferial",
    matins: "matins-ferial",
    liturgy: "liturgy-ferial-six-verse",
    hours: hoursSet("ferial"),
  },
  "six-verse": {
    vespers: "vespers-ferial-six-verse",
    matins: "matins-ferial-six-verse",
    liturgy: "liturgy-ferial-six-verse",
    hours: hoursSet("ferial"),
  },
  "doxology": {
    vespers: "vespers-ferial-six-verse",
    matins: "matins-ferial-doxology",
    liturgy: "liturgy-ferial-polyeleos",
    hours: hoursSet("ferial"),
  },
  "polyeleos": {
    vespers: "vespers-ferial-polyeleos",
    matins: "matins-ferial-polyeleos",
    liturgy: "liturgy-ferial-polyeleos",
    hours: hoursSet("ferial"),
  },
  "vigil": {
    vespers: "vespers-vigil",
    matins: "matins-vigil",
    liturgy: "liturgy-ferial-polyeleos",
    hours: hoursSet("ferial"),
  },
};

// Комплекты для воскресенья. Шестеричный/славословный/полиелейный святой
// соединяются с воскресной службой по одной и той же схеме: полиелей на
// воскресной утрене поётся в любом случае (это свойство самого
// воскресенья, не святого), различие рангов сказывается только в объёме
// стихир/тропарей канона святому (уже внутри шаблона). Бденный святой,
// совпав с воскресеньем, — особый случай: на часах кондаки чередуются
// (глас/святой), поэтому у него отдельный комплект часов ("featured").
const SUNDAY_SERVICE_SETS = {
  plain: {
    vespers: "vespers-sunday",
    matins: "matins-sunday",
    liturgy: "liturgy-sunday",
    hours: hoursSet(null),
  },
  withSaint: {
    vespers: "vespers-sunday-with-saint",
    matins: "matins-sunday-with-saint",
    liturgy: "liturgy-sunday-with-variables",
    hours: hoursSet("sunday-with-saint"),
  },
  featured: {
    vespers: "vespers-sunday-with-saint",
    matins: "matins-sunday-with-saint",
    liturgy: "liturgy-sunday-with-variables",
    hours: hoursSet("sunday-featured"),
  },
};

function hoursSet(suffix) {
  const suf = suffix ? `-${suffix}` : "";
  return {
    "1": `hours-1${suf}`,
    "3": `hours-3${suf}`,
    "6": `hours-6${suf}`,
    "9": `hours-9${suf}`,
  };
}

// Ранги, соединяемые с воскресеньем по обычной схеме "with-saint".
const SUNDAY_ORDINARY_RANKS = new Set(["six-verse", "doxology", "polyeleos"]);

// ===== Особые переопределения источника Октоиха =====
// Изредка печатная Минея даёт для числа не общий будничный Октоих по
// гласу/дню недели, а особую (сокращённую или праздничную) подборку,
// специфичную именно для этого числа — например, 11 сентября
// (Усекновение главы Иоанна Предтечи), где вседневный Октоих почти не
// звучит. Такие числа перечисляются явно; для всех остальных используется
// обычный будничный Октоих по гласу и дню недели.
const OKTOIH_SOURCE_OVERRIDES = {
  "09-11": "oktoih-feast-09-11",
};

// ===== Двунадесятые/великие праздники с полностью самостоятельным
// последованием =====
// Для этих чисел Минея полностью замещает Октоих — рядовая служба дня не
// поётся вовсе, ни на будни, ни в воскресенье (см. прямое указание Минеи,
// приведённое в data/days/2026-09-27.json._meta для Воздвижения). Дата не
// зависит от Пасхалии (это непереходящие праздники) и не зависит от года,
// поэтому таблица ключается по "MM-DD" без года.
export const FIXED_GREAT_FEASTS = {
  "08-28": {
    slug: "uspenie",
    feastName: "Успе́ние Пресвяты́я Влады́чицы на́шея Богоро́дицы и Присноде́вы Мари́и",
  },
  "09-21": {
    slug: "rozhdestvo-bogoroditsy",
    feastName: "Рождество́ Пресвяты́я Влады́чицы на́шея Богоро́дицы и Присноде́вы Мари́и",
  },
  "09-27": {
    slug: "vozdvizhenie",
    feastName: "Воздви́жение Честна́го и Животворя́щаго Креста́ Госпо́дня",
    fasting: "Стро́гий пост",
  },
  "10-14": {
    slug: "pokrov",
    feastName: "Покро́в Пресвяты́я Влады́чицы на́шея Богоро́дицы и Присноде́вы Мари́и",
    fasting: "Разреше́ние на ры́бу",
  },
  "12-04": {
    slug: "vvedenie",
    feastName: "Введе́ние (Вход) во храм Пресвяты́я Влады́чицы на́шея Богоро́дицы и Присноде́вы Мари́и",
    fasting: "Разреше́ние на ры́бу",
  },
  // ===== Предпразднство Рождества Христова (5 дней, гражд. 2–6 января) =====
  // Октоих не поётся (см. рубрику Минеи под 20 декабря по ст. ст.); служба
  // соединяет предпразднство с памятью святого дня по общему параметризо-
  // ванному шаблону *-forefeast-nativity (см. data/minea/01-0N.json).
  "01-02": {
    slug: "forefeast-nativity",
    feastName: "Предпра́зднство Рождества́ Христо́ва. Сщмч. Игна́тий Богоно́сец",
    minea: "01-02",
  },
  "01-03": {
    slug: "forefeast-nativity",
    feastName: "Предпра́зднство Рождества́ Христо́ва. Свт. Петр, митр. Ки́евский и всея́ Росси́и",
    minea: "01-03",
  },
  "01-05": {
    slug: "forefeast-nativity",
    feastName: "Предпра́зднство Рождества́ Христо́ва. Свв. 10 му́чеников Кри́тских",
    minea: "01-05",
  },
  "01-06": {
    slug: "forefeast-nativity",
    feastName: "Предпра́зднство Рождества́ Христо́ва (Наве́черие). Прмц. Евге́ния",
    minea: "01-06",
  },
  "01-07": {
    slug: "rozhdestvo",
    feastName: "Рождество́ Го́спода Бо́га и Спа́са на́шего Иису́са Христа́",
  },
  // ===== Попразднство Рождества Христова (гражд. 8–13 января) =====
  // Живёт по тому же уставу, что и предпразднство (Октоих не поётся,
  // см. рубрику Минеи под 20 декабря по ст. ст.), поэтому переиспользуются
  // те же шаблоны *-forefeast-nativity (боилерплейт идентичен).
  "01-08": {
    slug: "forefeast-nativity",
    feastName: "Попра́зднство Рождества́ Христо́ва. Собо́р Пресвяты́я Богоро́дицы",
    minea: "01-08",
  },
  "01-09": {
    slug: "forefeast-nativity",
    feastName: "Попра́зднство Рождества́ Христо́ва. Ап. первому́ч. Стефа́н",
    minea: "01-09",
  },
  "01-10": {
    slug: "forefeast-nativity",
    feastName: "Попра́зднство Рождества́ Христо́ва. Свв. 20 000 му́чеников, в Никомиди́и сожже́нных",
    minea: "01-10",
  },
  "01-12": {
    slug: "forefeast-nativity",
    feastName: "Попра́зднство Рождества́ Христо́ва. Мчц. Ани́сия Солу́нская",
    minea: "01-12",
  },
  "01-13": {
    slug: "otdanie-rozhdestva",
    feastName: "Отда́ние пра́здника Рождества́ Христо́ва",
  },
  "01-14": {
    slug: "obrezanie-vasily",
    feastName: "Обре́зание Го́спода на́шего Иису́са Христа́. Свт. Васи́лий Вели́кий",
  },
  "01-15": {
    slug: "forefeast-theophany",
    feastName: "Предпра́зднство Богоявле́ния. Свт. Сильве́стр, па́па Ри́мский",
    minea: "01-15",
  },
  "01-16": {
    slug: "forefeast-theophany",
    feastName: "Предпра́зднство Богоявле́ния. Мч. Горди́й",
    minea: "01-16",
  },
  "01-17": {
    slug: "forefeast-theophany",
    feastName: "Предпра́зднство Богоявле́ния. Собо́р святы́х 70 апо́стол",
    minea: "01-17",
  },
  "01-18": {
    slug: "navechernie-bogoyavleniya",
    feastName: "Навече́рие Богоявле́ния (Креще́нский соче́льник). Сщмч. Феопе́мпт и мч. Фео́на",
  },
  "01-19": {
    slug: "bogoyavleniya",
    feastName: "Свято́е Богоявле́ние. Креще́ние Го́спода Бо́га и Спа́са на́шего Иису́са Христа́",
  },
  "01-20": {
    slug: "sobor-predtechi",
    feastName: "Собо́р Иоа́нна Предте́чи. Попра́зднство Богоявле́ния",
  },
  "01-21": {
    slug: "popraznstvo-theophany",
    feastName: "Попра́зднство Богоявле́ния. Прп. Гео́ргий Хозеви́т",
    minea: "01-21",
  },
  "01-22": {
    slug: "popraznstvo-theophany",
    feastName: "Попра́зднство Богоявле́ния. Свт. Фили́пп, митрополи́т Моско́вский",
    minea: "01-22",
  },
  "01-23": {
    slug: "popraznstvo-theophany",
    feastName: "Попра́зднство Богоявле́ния. Свт. Григо́рий, епи́скоп Ни́сский",
    minea: "01-23",
  },
  "01-24": {
    slug: "popraznstvo-theophany",
    feastName: "Попра́зднство Богоявле́ния. Прп. Феодо́сий Вели́кий",
    minea: "01-24",
  },
  "01-26": {
    slug: "popraznstvo-theophany",
    feastName: "Попра́зднство Богоявле́ния. Мчч. Ерми́л и Стратони́к",
    minea: "01-26",
  },
  "01-27": {
    slug: "otdanie-bogoyavleniya",
    feastName: "Отда́ние пра́здника Богоявле́ния",
  },
};

function planFixedGreatFeast(date, feast) {
  return {
    dateLabel: formatDateLabel(date),
    feastName: feast.feastName,
    period: periodLabel(date),
    tone: null,
    ...(feast.fasting ? { fasting: feast.fasting } : {}),
    services: {
      vespers: `vespers-${feast.slug}`,
      matins: `matins-${feast.slug}`,
      liturgy: `liturgy-${feast.slug}`,
    },
    ...(feast.minea ? { variables: { sources: { minea: feast.minea } } } : {}),
  };
}

// ===== Сретение Господне (15 февраля) =====
// Единственный непереходящий двунадесятый праздник, который часто попадает
// в подготовительные седмицы Триоди. Шаблоны есть для двух случаев:
// праздник вне Триоди (или в будний день седмиц мытаря и блудного сына,
// где Триодь на будни ничего не даёт) и совпадение с Неделей мясопустной.
// Остальные совпадения (с Неделей мытаря / блудного сына, мясопустной
// субботой, Сырной седмицей, Неделей сыропустной, началом поста) решаются
// особыми указаниями Типикона, которых в проекте пока нет, — для них
// честный отказ, а не догадка.
const SRETENIE = {
  feastName: "Сре́тение Го́спода Бо́га и Спа́са на́шего Иису́са Христа́",
};

function planSretenie(date) {
  const offset = paschaOffset(date);
  const inTriodion = offset >= -70 && offset <= -1;
  if (offset === -56) {
    return {
      ok: true,
      plan: {
        dateLabel: formatDateLabel(date),
        feastName: `${SRETENIE.feastName} (совпада́ет с Неде́лей мясопу́стной, о Стра́шном Суде́)`,
        period: `${periodLabel(date)} / По́стная Три́одь`,
        // Глас седмицы указывается, хотя воскресный Октоих в Господский
        // праздник не поётся (шаблоны этого дня не содержат Октоиха).
        tone: computeGlas(date),
        services: {
          vespers: "vespers-sretenie-myasopustnaya",
          matins: "matins-sretenie-myasopustnaya",
          liturgy: "liturgy-sretenie-myasopustnaya",
        },
      },
    };
  }
  const isSunday = date.getDay() === 0;
  if (inTriodion && (isSunday || offset >= -57)) {
    return { ok: false, reason: "sretenie-triodion-coincidence" };
  }
  return { ok: true, plan: planFixedGreatFeast(date, { slug: "sretenie", feastName: SRETENIE.feastName }) };
}

// ===== Пред- и попразднства двунадесятых праздников =====
// В эти дни Октоих на седмичных службах не поётся: служба составляется из
// песнопений праздника (Минея) и святого дня — см. «Употребление Октоиха
// в уставном богослужении» (azbyka.ru/oktoix) и Типикон. Песнопений
// праздника для этих дней в data/minea пока нет, поэтому собрать службу
// правильно нельзя; прежде движок подставлял будничный Октоих, что
// противоречит уставу. Теперь — честный отказ с понятной причиной.
// Рождество Христово и Богоявление сюда не входят: их пред- и попразднства
// уже собраны отдельными шаблонами (см. FIXED_GREAT_FEASTS).
// Воскресенья в эти периоды не отклоняются: в воскресенье воскресный Октоих
// поётся и в попразднство (не хватает лишь песнопений праздника — как и
// раньше). Исключение — сам день Преображения (feastDay): для него нет
// шаблонов, а Господский праздник в воскресенье отменяет воскресный Октоих.
// Даты — гражданские (новый стиль), включительно; отдание — последний день.
export const FEAST_PERIODS = [
  { from: "02-14", to: "02-22", feast: "Сре́тение Госпо́дне", skip: ["02-15"] },
  { from: "08-18", to: "08-26", feast: "Преображе́ние Госпо́дне", feastDay: "08-19" },
  { from: "08-27", to: "09-05", feast: "Успе́ние Пресвяты́я Богоро́дицы", skip: ["08-28"] },
  { from: "09-20", to: "09-25", feast: "Рождество́ Пресвяты́я Богоро́дицы", skip: ["09-21"] },
  { from: "09-26", to: "10-04", feast: "Воздви́жение Креста́ Госпо́дня", skip: ["09-27"] },
  { from: "12-03", to: "12-08", feast: "Введе́ние во храм Пресвяты́я Богоро́дицы", skip: ["12-04"] },
];

export function feastPeriodFor(mmdd) {
  return FEAST_PERIODS.find((p) => mmdd >= p.from && mmdd <= p.to && !(p.skip || []).includes(mmdd)) || null;
}

/**
 * Приводит значение rank из Минеи к одному из известных рядовых рангов.
 * Возвращает null, если ранг неизвестен/испорчен — в этом случае соединять
 * святого с Октоихом небезопасно (можно ошибиться со знаком праздника),
 * и вызывающий код должен явно сообщить об отсутствии данных, а не
 * угадывать.
 */
function normalizeRank(rawRank) {
  if (isKnownRank(rawRank)) return rawRank;
  return null;
}

/**
 * Основная функция устава: по дате и данным Минеи (объект _meta документа
 * data/minea/MM-DD.json — важны поля rank и saint) строит план службы дня
 * в формате, совпадающем с data/days/YYYY-MM-DD.json.
 *
 * @param {Date} date — гражданская дата (год важен только для гласа/дня
 *   недели; число и месяц определяют, какую Минею и какой особый праздник
 *   искать).
 * @param {{rank: string, saint: string} | null} mineaMeta — метаданные
 *   святого дня по Минее, либо null, если для этого числа ещё нет данных.
 * @returns {{ok: true, plan: object} | {ok: false, reason: string}}
 */
export function planDayService(date, mineaMeta) {
  const mmdd = toMonthDayKey(date);

  const feast = FIXED_GREAT_FEASTS[mmdd];
  if (feast) {
    return { ok: true, plan: planFixedGreatFeast(date, feast) };
  }
  if (mmdd === "02-15") {
    return planSretenie(date);
  }

  // Переходящий цикл Постной/Цветной Триоди (от Недели о мытаре и фарисее
  // до Недели всех русских святых) живёт по другому уставу — см.
  // src/lib/triodion.js. Он покрывает не только Светлую седмицу (где
  // computeGlas вернул бы null), но и весь Великий пост и Пентикостарий, для
  // которых обычное соединение по рангу Минеи либо вовсе неприменимо, либо
  // ещё не подкреплено готовыми шаблонами.
  const triodDay = describeTriodionDay(date);
  if (triodDay) {
    // Порядок важен: дни с полным собственным последованием (Пятидесятница,
    // недели Цветной Триоди, для которых есть шаблоны вечерни/утрени/
    // литургии) должны проверяться РАНЬШЕ заглушки planPentecostarionSunday —
    // иначе заглушка «воскресная литургия с Октоихом» перехватывала их,
    // и, например, Пятидесятница получала Октоих, которого в этот день нет.
    const plan = planPaschaService(date) || planFixedProperService(date) || planLentenSundayService(date) || planPentecostarionSunday(date);
    if (plan) return { ok: true, plan };
    return { ok: false, reason: "triod-not-implemented", triodDay };
  }

  const feastPeriod = feastPeriodFor(mmdd);
  if (feastPeriod && (date.getDay() !== 0 || feastPeriod.feastDay === mmdd)) {
    return { ok: false, reason: "feast-period", feast: feastPeriod.feast };
  }

  const glas = computeGlas(date);
  if (glas == null) {
    // Подстраховка: сюда попасть не должны (Светлая седмица уже покрыта
    // triodDay выше), но на случай расхождения границ — честный отказ, а не
    // ошибочное соединение с Минеей.
    return { ok: false, reason: "paschal-period" };
  }

  const isSunday = date.getDay() === 0;
  const rank = mineaMeta ? normalizeRank(mineaMeta.rank) : null;

  if (!mineaMeta) {
    if (!isSunday) {
      return { ok: false, reason: "no-minea-data" };
    }
    // Воскресенье без данных о святом по Минее: рядовая воскресная служба,
    // святой Минеи не соединяется (соединять нечего).
    return {
      ok: true,
      plan: {
        dateLabel: formatDateLabel(date),
        feastName: `Неде́ля, глас ${glas}`,
        period: periodLabel(date),
        tone: glas,
        rank: "sunday-plain",
        services: { ...SUNDAY_SERVICE_SETS.plain },
        variables: { glas, sources: { oktoih: `oktoih-variables-glas${glas}` } },
      },
    };
  }

  if (!rank) {
    return { ok: false, reason: "unknown-rank" };
  }

  if (isSunday) {
    if (rank === "ferial") {
      // "Без знака" — у святого нет ни стихир, ни канона; на воскресной
      // службе, где безраздельно господствует Октоих, ему нет места.
      return {
        ok: true,
        plan: {
          dateLabel: formatDateLabel(date),
          feastName: `Неде́ля, глас ${glas}`,
          period: periodLabel(date),
          tone: glas,
          rank: "sunday-plain",
          services: { ...SUNDAY_SERVICE_SETS.plain },
          variables: { glas, sources: { oktoih: `oktoih-variables-glas${glas}` } },
        },
      };
    }

    const serviceSet = rank === "vigil"
      ? SUNDAY_SERVICE_SETS.featured
      : SUNDAY_ORDINARY_RANKS.has(rank)
        ? SUNDAY_SERVICE_SETS.withSaint
        : null;

    if (!serviceSet) {
      return { ok: false, reason: "unsupported-rank-combination" };
    }

    return {
      ok: true,
      plan: {
        dateLabel: formatDateLabel(date),
        feastName: mineaMeta.saint,
        period: periodLabel(date),
        tone: glas,
        rank: "sunday-with-saint",
        services: { ...serviceSet },
        variables: {
          glas,
          sources: { oktoih: `oktoih-variables-glas${glas}`, minea: mmdd },
        },
      },
    };
  }

  // Будний день.
  const serviceSet = FERIAL_SERVICE_SETS[rank];
  if (!serviceSet) {
    return { ok: false, reason: "unsupported-rank-combination" };
  }

  const weekdayKey = WEEKDAY_OKTOIH_KEYS[date.getDay()];
  const oktoihSource = OKTOIH_SOURCE_OVERRIDES[mmdd] || `oktoih-weekday-glas${glas}-${weekdayKey}`;

  return {
    ok: true,
    plan: {
      dateLabel: formatDateLabel(date),
      feastName: mineaMeta.saint,
      period: periodLabel(date),
      tone: glas,
      rank,
      services: { ...serviceSet },
      variables: {
        glas,
        sources: { oktoih: oktoihSource, minea: mmdd },
      },
    },
  };
}
