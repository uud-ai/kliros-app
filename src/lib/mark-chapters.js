// Марковы главы — указания Типикона на случай, когда неподвижный праздник
// Минеи совпадает с переходящим днём Триоди. Здесь — Благовещение
// Пресвятой Богородицы (25 марта ст. ст. = 7 апреля н. ст.), главный и
// самый подробный их раздел: при юлианской Пасхалии праздник всегда
// приходится на время от четверга 3-й седмицы Великого поста до среды
// Светлой седмицы (смещение от Пасхи −31…+3), то есть каждый год — случай
// Марковой главы.
//
// Правила (вид Литургии, соединение с вечерней, начало бдения, часы,
// утреня) — по Типикону (25 марта и Марковы главы под 24–26 марта),
// в изложении:
//   • еп. Гермоген (Шиманский). Литургика. Учебное пособие для духовных
//     семинарий, разд. 4 — azbyka.ru/otechnik/Germogen_Shimanskij/liturgika/4;
//   • «Благовещение Пресвятой Богородицы. Богослужение. Типикон» —
//     blagoveshenie.paskha.ru/Bogosluzhenie/Tipikon/;
//   • Богослужебные указания на 7 апреля 2026 г. (Благовещение в Великий
//     вторник) — azbyka.ru/bogosluzhebnye-ukazaniya?date=2026-04-07.
// Где эти источники молчат, правило помечено «по общему правилу» и
// требует сверки с самим Типиконом.
//
// Тексты Триоди, которые в эти дни соединяются с праздником (трипеснцы,
// стихиры, паремии), в приложение пока не внесены — показываются
// песнопения праздника, а порядок соединения описан в «Уставе дня».

import { paschaOffset } from "./triodion.js";
import { formatDateLabel } from "./typikon.js";

const FEAST = "Благове́щение Пресвяты́я Богоро́дицы";
const SOURCES = [
  "Типикон, 25 марта и Марковы главы (24–26 марта)",
  "еп. Гермоген (Шиманский). Литургика, разд. 4",
  "blagoveshenie.paskha.ru — «Богослужение. Типикон»",
];

const LENT_SUNDAY_NAMES = {
  "-28": "Неде́ля 3-я Вели́кого поста́, Крестопокло́нная",
  "-21": "Неде́ля 4-я Вели́кого поста́, прп. Иоа́нна Ле́ствичника",
  "-14": "Неде́ля 5-я Вели́кого поста́, прп. Мари́и Еги́петской",
};
const WEEKDAY_NAMES = ["", "понеде́льник", "вто́рник", "среда́", "четверг", "пя́тница", "суббо́та"];

// Название и разряд дня Триоди, на который пришёлся праздник.
function triodionDay(offset) {
  const special = {
    "-15": { kind: "lent-saturday", name: "Суббо́та Ака́фиста (Похвала́ Пресвято́й Богоро́дицы)" },
    "-8": { kind: "lent-saturday", name: "Ла́зарева суббо́та" },
    "-7": { kind: "palm-sunday", name: "Неде́ля ва́ий" },
    "-6": { kind: "great-mon", name: "Вели́кий Понеде́льник" },
    "-5": { kind: "great-tue", name: "Вели́кий Вто́рник" },
    "-4": { kind: "great-wed", name: "Вели́кая Среда́" },
    "-3": { kind: "great-thu", name: "Вели́кий Четве́рг" },
    "-2": { kind: "great-fri", name: "Вели́кая Пя́тница" },
    "-1": { kind: "great-sat", name: "Вели́кая Суббо́та" },
    "0": { kind: "pascha", name: "Па́сха (Кириопа́сха)" },
    "1": { kind: "bright", name: "Све́тлый понеде́льник" },
    "2": { kind: "bright", name: "Све́тлый вто́рник" },
    "3": { kind: "bright", name: "Све́тлая среда́" },
  }[String(offset)];
  if (special) return special;
  if (LENT_SUNDAY_NAMES[offset]) return { kind: "lent-sunday", name: LENT_SUNDAY_NAMES[offset] };
  // Будни и субботы 3–6-й седмиц: −35 — Неделя 3-я (Крестопоклонная).
  const week = 3 + Math.floor((offset + 35) / 7);
  const dow = ((offset % 7) + 7) % 7; // 0 = воскресенье
  const name = `${WEEKDAY_NAMES[dow][0].toUpperCase()}${WEEKDAY_NAMES[dow].slice(1)} ${week}-й седми́цы Вели́кого поста́`;
  return { kind: dow === 6 ? "lent-saturday" : "lent-weekday", name, dow };
}

const BASIL = new Set(["lent-sunday", "great-thu", "great-sat"]);
const LENTEN_HOURS = new Set(["lent-weekday", "great-mon", "great-tue", "great-wed"]);
const VESPERS_WITH_LITURGY = new Set([...LENTEN_HOURS, "great-thu", "great-fri", "great-sat"]);

function eveService(day) {
  switch (day.kind) {
    case "lent-sunday":
    case "palm-sunday":
    case "bright":
      return "great-vespers";
    case "lent-weekday":
      return day.dow === 1 ? "great-vespers" : "great-compline";
    case "great-mon":
      return "great-vespers-general";
    case "lent-saturday":
    case "great-tue":
    case "great-wed":
    case "great-thu":
      return "great-compline";
    case "great-fri":
    case "great-sat":
      return "matins";
    case "pascha":
      return "pascha";
    default:
      return null;
  }
}

const EVE_LINE = {
  "great-vespers": "Бде́ние накану́не начина́ется вели́кой вече́рней.",
  "great-vespers-general": "Бде́ние накану́не — по о́бщему пра́вилу для понеде́льника — начина́ется вели́кой вече́рней (сверить с Типико́ном).",
  "great-compline": "Вече́рня 24 ма́рта соверша́ется днём (сама́ по себе́ или с Литурги́ей Преждеосвяще́нных Даро́в); бде́ние ве́чером начина́ется вели́ким пове́черием с ли́тией — на ли́тии и стихо́вне стихи́ры пра́здника.",
  matins: "Вече́рня соверша́ется отде́льно накану́не (в Вели́кий Четве́рг — с Литурги́ей свт. Васи́лия Вели́кого, в Вели́кую Пя́тницу — особо); бде́ние начина́ется у́треней.",
  pascha: "Пасха́льная полу́нощница и у́треня; тропа́рь Благове́щения — на ли́тии, на «Бог Госпо́дь» и в конце́.",
};

function matinsLine(day) {
  switch (day.kind) {
    case "palm-sunday":
      return "Утреня: по полиеле́е — велича́ние Благове́щения, но проки́мен и Ева́нгелие — Неде́ли ва́ий.";
    case "great-fri":
      return "Утреня Страстей (12 Ева́нгелий): по 7-м Ева́нгелии — полиеле́й, велича́ние, стихи́ры, проки́мен и Ева́нгелие пра́здника; кано́н пра́здника соединя́ется с трипе́снцем Вели́кой Пя́тницы.";
    case "pascha":
      return "Утреня пасха́льная: кано́н пра́здника соединя́ется с пасха́льным; Ева́нгелие Благове́щения — по 6-й пе́сни; полиеле́я и велича́ния нет.";
    case "bright":
      return "Утреня пасха́льная, с кано́ном пра́здника (полиеле́я нет).";
    default:
      return "Утреня с полиеле́ем, велича́нием и Ева́нгелием пра́здника; кано́н пра́здника соединя́ется с кано́ном (трипе́снцем) Три́оди.";
  }
}

function doxologyLine(day) {
  if (day.kind === "bright" || day.kind === "pascha") return null;
  if (["lent-saturday", "lent-sunday", "palm-sunday"].includes(day.kind)) return "Вели́кое славосло́вие поётся.";
  return "Вели́кое славосло́вие чита́ется; утреня ока́нчивается ектени́ей «Поми́луй нас, Бо́же» и моли́твой прп. Ефре́ма Си́рина.";
}

function hoursLine(day) {
  if (day.kind === "great-fri") return "Ца́рские (Вели́кой Пя́тницы).";
  if (day.kind === "bright" || day.kind === "pascha") return "пасха́льные.";
  if (LENTEN_HOURS.has(day.kind)) return `постны́е, с тропарём и кондако́м пра́здника; вели́кие покло́ны ${day.kind === "lent-weekday" ? "то́лько на 1-м ча́се и изобрази́тельных" : "на ка́ждом ча́се"}.`;
  return "обы́чные (не постны́е), с тропарём и кондако́м пра́здника.";
}

function liturgyLine(day) {
  const kind = BASIL.has(day.kind) ? "свт. Васи́лия Вели́кого" : "свт. Иоа́нна Златоу́ста";
  const joined = VESPERS_WITH_LITURGY.has(day.kind);
  const where = joined ? ", соединённая с вече́рней (стихи́ры на «Го́споди, воззва́х» и паре́мии — Три́оди и пра́здника)" : "; вече́рня — ве́чером, отде́льно";
  return `Литурги́я ${kind}${where}. Литурги́я Преждеосвяще́нных Даро́в в день Благове́щения не соверша́ется.`;
}

function zadostoynikLine(day) {
  if (day.kind === "great-thu" || day.kind === "great-sat") return "Вме́сто «Досто́йно есть» — задо́стойник дня.";
  if (day.kind === "pascha" || day.kind === "bright") return null;
  return "Вме́сто «Досто́йно есть» — задо́стойник пра́здника.";
}

function fastingFor(day) {
  if (day.kind === "pascha" || day.kind === "bright") return "Разреше́ние на вся";
  if (day.kind === "great-fri" || day.kind === "great-sat") return "Разреше́ние вина́ и еле́я";
  return "Разреше́ние на ры́бу";
}

// Шаблоны, которые приложение может показать в этот день, и подписи к ним.
function servicesFor(day, offset) {
  const eve = eveService(day);
  const services = {};
  const labels = {};
  let vespersSameDay = false;

  if (day.kind === "pascha") {
    return {
      services: {
        midnightOffice: "midnight-office-pascha",
        matins: "matins-pascha",
        hours: { "1": "hours-pascha", "3": "hours-pascha", "6": "hours-pascha", "9": "hours-pascha" },
        liturgy: "liturgy-pascha",
        vespers: "vespers-pascha",
      },
      labels: { matins: { note: "с кано́ном Благове́щения (в приложе́нии — то́лько пасха́льный)" } },
      vespersSameDay: false,
    };
  }
  if (day.kind === "bright") {
    const suffix = { 1: "monday", 2: "tuesday", 3: "wednesday" }[offset];
    return {
      services: {
        vespers: "vespers-blagoveshchenie",
        matins: `matins-bright-${suffix}`,
        hours: { "1": "hours-pascha", "3": "hours-pascha", "6": "hours-pascha", "9": "hours-pascha" },
        liturgy: `liturgy-bright-${suffix}`,
      },
      labels: {
        vespers: { title: "Вели́кая вече́рня (накану́не) — пе́сни пра́здника", note: "соединя́ются с пасха́льными" },
        matins: { note: "с кано́ном Благове́щения (в приложе́нии — то́лько пасха́льный)" },
        liturgy: { note: "пасха́льная, с чте́ниями и песнопе́ниями Благове́щения" },
      },
      vespersSameDay: false,
    };
  }

  // Вечерня / повечерие накануне
  if (eve === "great-vespers" || eve === "great-vespers-general") {
    services.vespers = "vespers-blagoveshchenie";
  } else {
    // Накануне — великое повечерие с литией или сразу утреня; вечерня
    // праздника — в сам день: с Литургией или (в субботу) вечером.
    services.vespers = "vespers-blagoveshchenie";
    const joined = VESPERS_WITH_LITURGY.has(day.kind);
    labels.vespers = {
      title: "Вече́рня Благове́щения",
      note: joined ? "в сам день, соединённая с Литурги́ей" : "в сам день ве́чером, по Литурги́и",
    };
    vespersSameDay = true;
  }
  if (eve === "great-compline") {
    labels.vespers.note += "; стихи́ры ли́тии и стихо́вны — на вели́ком пове́черии накану́не";
  }

  // Утреня
  services.matins = {
    "palm-sunday": "matins-palm-sunday",
    "great-fri": "matins-great-friday",
    "great-sat": "matins-great-saturday",
  }[day.kind] || "matins-blagoveshchenie";
  if (services.matins !== "matins-blagoveshchenie") {
    labels.matins = { note: "накану́не ве́чером; с песнопе́ниями Благове́щения (в приложе́нии — то́лько Три́оди)" };
  }

  // Литургия
  services.liturgy = day.kind === "palm-sunday" ? "liturgy-palm-sunday" : "liturgy-blagoveshchenie";
  if (day.kind === "palm-sunday") {
    labels.liturgy = { note: "с чте́ниями и песнопе́ниями Благове́щения" };
  } else if (BASIL.has(day.kind)) {
    labels.liturgy = { title: "Литурги́я свт. Васи́лия Вели́кого", note: "в приложе́нии — песнопе́ния и чте́ния пра́здника; моли́твы — по чи́ну свт. Васи́лия" };
  } else if (VESPERS_WITH_LITURGY.has(day.kind) && !vespersSameDay) {
    labels.liturgy = { note: "соединённая с вече́рней" };
  }

  // Часы: в приложении есть только пасхальные; прочие показываются пометкой.
  labels.hours = { title: "Часы́", note: hoursLine(day) };

  return { services, labels, vespersSameDay };
}

export function planAnnunciation(date) {
  const offset = paschaOffset(date);
  if (offset < -31 || offset > 3) return null;
  const day = triodionDay(offset);
  const { services, labels, vespersSameDay } = servicesFor(day, offset);

  const ustav = [
    EVE_LINE[eveService(day)],
    matinsLine(day),
    doxologyLine(day),
    `Часы́ — ${hoursLine(day)}`,
    liturgyLine(day),
    zadostoynikLine(day),
    ["palm-sunday", "great-mon", "great-tue", "great-wed", "great-thu", "great-fri", "great-sat", "pascha", "bright"].includes(day.kind)
      ? "Предпра́зднства и попра́зднства в э́тот год нет — пра́здник соверша́ется оди́н день."
      : day.name.startsWith("Ла́зарева")
        ? "Попра́зднства в э́тот год нет."
        : "Предпра́зднство (6 апреля) и отда́ние (8 апреля) соверша́ются по Ма́рковым гла́вам Типико́на под 24 и 26 ма́рта.",
    "Тексты Три́оди э́того дня в приложе́ние пока́ не внесены́: показаны́ песнопе́ния пра́здника, а поря́док соедине́ния — здесь.",
  ].filter(Boolean);

  return {
    dateLabel: formatDateLabel(date),
    feastName: `${FEAST}. ${day.name}`,
    period: "Ма́рковы гла́вы",
    tone: null,
    fasting: fastingFor(day),
    services,
    ...(Object.keys(labels).length ? { serviceLabels: labels } : {}),
    ...(vespersSameDay ? { vespersSameDay: true } : {}),
    ustav: { title: `Ма́ркова глава́: Благове́щение — ${day.name}`, lines: ustav, sources: SOURCES },
  };
}

// Пред- и попразднство в Великий пост: служба по Марковым главам под 24 и
// 26 марта, тексты постной службы в приложение не внесены — честный отказ с
// точной причиной (в Страстную и Светлую седмицы этих дней нет вовсе).
export function annunciationNeighbour(date, mmdd) {
  if (mmdd !== "04-06" && mmdd !== "04-08") return null;
  const offset = paschaOffset(date);
  const feastOffset = offset + (mmdd === "04-06" ? 1 : -1);
  if (feastOffset < -31 || feastOffset > 3) return null;
  return { ok: false, reason: mmdd === "04-06" ? "annunciation-forefeast" : "annunciation-afterfeast" };
}
