import { useEffect, useMemo, useRef, useState } from "react";
import { planDayService, toMonthDayKey, FIXED_GREAT_FEASTS } from "./lib/typikon.js";
import { parseZachaloCitation, resolveZachaloRanges, buildReadingText, booksNeededFor } from "./lib/readings.js";
import "./App.css";

// ===== Порядок служб богослужебных суток =====
// Все службы дня показываются одна за другой в уставном порядке:
// 9-й час и вечерня накануне вечером (с них начинаются церковные сутки),
// полунощница (если есть), утреня, 1-й, 3-й и 6-й часы, Литургия.
//
// Вечерня, которую план дня кладёт в services.vespers, обычно служится
// накануне вечером. Исключения — вечерни, совершаемые вечером (или днём)
// самого этого дня: Пасха и Светлая седмица, суббота Светлой седмицы
// (под Антипасху), сам день Антипасхи, Страстная седмица (вечерня с
// Литургией) и коленопреклонная вечерня Пятидесятницы. Их ставим после
// Литургии.
const SAME_DAY_VESPERS = /^vespers-(pascha|bright-|antipascha|great-|pentecost-kneeling)/;

// Строит последовательность служб дня по плану day.services.
// Элемент: { key, title, templateId, note } либо { key, title, missing: true }.
// labels — подписи из плана дня (Марковы главы и т. п.):
// { vespers: { title, note }, matins: {...}, hours: {...}, liturgy: {...} };
// vespersSameDay — вечерня совершается в сам день (после Литургии или с ней).
function buildServiceSequence(services, labels = {}, vespersSameDayFlag = false) {
  if (!services) return [];
  const seq = [];
  const hours = services.hours && typeof services.hours === "object" ? services.hours : null;
  const hourIds = hours ? ["1", "3", "6", "9"].map((h) => hours[h]).filter(Boolean) : [];
  // Пасхальные часы: один и тот же краткий чин вместо всех четырёх часов.
  const uniformHours = hourIds.length > 1 && hourIds.every((id) => id === hourIds[0]);
  const vespersSameDay = vespersSameDayFlag || (typeof services.vespers === "string" && SAME_DAY_VESPERS.test(services.vespers));

  const label = (key, title, note) => {
    const base = key.startsWith("hour") ? "hours" : key;
    return { title: labels[key]?.title || labels[base]?.title || title, note: labels[key]?.note ?? labels[base]?.note ?? note };
  };
  const add = (key, title, templateId, note) => {
    if (templateId) seq.push({ key, ...label(key, title, note), templateId });
  };
  const addOrMissing = (key, title, templateId, note) => {
    if (templateId) seq.push({ key, ...label(key, title, note), templateId });
    else seq.push({ key, ...label(key, title, note), missing: true });
  };

  // Царские часы (навечерие Богоявления): 1, 3, 6 и 9-й часы читаются
  // подряд утром, поэтому 9-й час не переносится на канун перед вечерней.
  const royalHours = !!services.royalHours && !!hours;

  if (!uniformHours && !royalHours) add("hour9", "Девя́тый час", hours?.["9"], labels.hour9?.note);
  if (!vespersSameDay) addOrMissing("vespers", "Вече́рня", services.vespers, "накану́не ве́чером");
  add("midnightOffice", "Полуно́щница", services.midnightOffice);
  addOrMissing("matins", "У́треня", services.matins);
  if (royalHours) {
    const royalNote = labels.hours?.note;
    [["1", "Ца́рский пе́рвый час"], ["3", "Ца́рский тре́тий час"], ["6", "Ца́рский шесто́й час"], ["9", "Ца́рский девя́тый час"]]
      .forEach(([h, title], i) => {
        if (hours[h]) seq.push({ key: `hour${h}`, title, note: i === 0 ? royalNote : undefined, templateId: hours[h] });
      });
  } else if (uniformHours) {
    add("hours", "Часы́ пасха́льные", hourIds[0], "вме́сто 1-го, 3-го, 6-го и 9-го часо́в");
  } else if (hours) {
    add("hour1", "Пе́рвый час", hours["1"]);
    add("hour3", "Тре́тий час", hours["3"]);
    add("hour6", "Шесто́й час", hours["6"]);
  } else {
    seq.push({ key: "hours", ...label("hours", "Часы́"), missing: true });
  }
  addOrMissing("liturgy", "Литурги́я", services.liturgy);
  if (vespersSameDay) add("vespers", "Вече́рня", services.vespers, "ве́чером в э́тот день");
  add("vespersKneeling", "Коленопреклоне́нная вече́рня", services.vespersKneeling, "ве́чером в э́тот день, по Литурги́и");
  return seq;
}

// Строки шаблона с only_if / only_if_not показываются, только если в
// источнике есть (или нет) указанный текст: "minea.vespers_slava" и т. п.
// Можно перечислить несколько путей массивом:
//   only_if: [...]      — нужны все перечисленные тексты;
//   only_if_any: [...]  — нужен хотя бы один;
//   only_if_not: [...]  — строка скрывается, если есть хотя бы один.
// Так из нескольких вариантов ключа (vespers_stichiry_3 / _6 / _8 …)
// показывается ровно первый найденный.
function hasVariable(path, sourcesByType) {
  const [type, key] = (path || "").split(".");
  return !!(sourcesByType?.[type]?.[key]);
}

function passesConditions(item, sourcesByType) {
  const list = (v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
  if (list(item.only_if).some((p) => !hasVariable(p, sourcesByType))) return false;
  const any = list(item.only_if_any);
  if (any.length && !any.some((p) => hasVariable(p, sourcesByType))) return false;
  if (list(item.only_if_not).some((p) => hasVariable(p, sourcesByType))) return false;
  return true;
}

// Формат даты для имени файла: "YYYY-MM-DD"
function toDocId(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Загрузка одного JSON-"документа" из статики /data/{collection}/{id}.json —
// замена Firestore-эквивалента getDoc(doc(db, collection, id)). Возвращает
// null, если файла нет, иначе — распарсенный JSON.
// Content-Type проверяем отдельно от res.ok: и dev-сервер Vite, и статический
// хостинг (SPA-рерайт "**" -> index.html) отвечают 200 text/html на любой
// несуществующий путь вместо честного 404 — без этой проверки отсутствующий
// день расценивался бы как найденный документ, и резервный расчёт службы по
// уставу (planDayService) не срабатывал бы почти ни для одной даты.
async function getDocData(collection, id) {
  const res = await fetch(`${import.meta.env.BASE_URL}data/${collection}/${id}.json`);
  if (!res.ok) return null;
  if (!(res.headers.get("content-type") || "").includes("json")) return null;
  return res.json();
}

// Человекочитаемая подпись дня
function humanLabel(date) {
  const days = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];
  const months = ["января", "февраля", "марта", "апреля", "мая", "июня",
                  "июля", "августа", "сентября", "октября", "ноября", "декабря"];
  return `${days[date.getDay()]}, ${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

// Сдвиг даты на n дней
function shiftDate(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

// Разбор строки "YYYY-MM-DD" (из URL или <input type="date">) в локальную
// Date. new Date() нормализует переполнение (месяц 13, 30 февраля), не
// отклоняя его — сверяем обратно, чтобы такой ввод не тихо открывал другой день.
function parseIsoDate(str) {
  const match = /^\d{4}-\d{2}-\d{2}$/.exec(str || "");
  if (!match) return null;
  const [y, m, d] = match[0].split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const valid = date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
  return valid ? date : null;
}

// Дата из ?date=YYYY-MM-DD в URL (ссылки с сайта на конкретный день службы).
function dateFromUrl() {
  return parseIsoDate(new URLSearchParams(location.search).get("date"));
}

// ===== Работа с localStorage =====
function loadSetting(key, fallback) {
  try {
    const value = localStorage.getItem(`kliros:${key}`);
    if (value === null) return fallback;
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function saveSetting(key, value) {
  try {
    localStorage.setItem(`kliros:${key}`, JSON.stringify(value));
  } catch {
    // ошибка записи игнорируется
  }
}

// Подстановка переменных {{namespace.key}} → реальный текст.
// sourcesByType — карта { oktoih: {...}, minea: {...} }: пространство имён
// плейсхолдера ({{oktoih.x}} / {{minea.x}}) определяет, откуда брать текст.
function substituteVariables(text, sourcesByType) {
  if (!text || typeof text !== 'string') return text;
  return text.replace(/\{\{([^}]+)\}\}/g, (match, variablePath) => {
    const [type, key] = variablePath.split('.');
    const source = sourcesByType && sourcesByType[type];
    if (source && source[key]) {
      return source[key];
    }
    return match;
  });
}

// Дни седмицы для "Тропарей дневных" (Date.getDay(): 0=вс..6=сб).
// Среда и пятница используют один и тот же (крестный) набор.
const ENTRANCE_DAY_KEYS = ["sun", "mon", "tue", "wed_fri", "thu", "wed_fri", "sat"];

const PREDSTATELSTVO_BOGORODICHEN =
  "Предста́тельство христиа́н непосты́дное, хода́тайство ко Творцу́ непрело́жное, не пре́зри гре́шных моле́ний гла́сы, но предвари́, я́ко Блага́я, на по́мощь нас, ве́рно зову́щих Ти: ускори́ на моли́тву и потщи́ся на умоле́ние, предста́тельствующи при́сно, Богоро́дице, чту́щих Тя.";

// Устав о тропарях и кондаках по входе на будничной Литургии (Типикон, гл. 52):
// зависит от дня седмицы, святого дня (Минея) и посвящения храма
// (Господский / Богородичный / святого). Без указанного храма (по умолчанию)
// даёт корректный упрощённый вариант: тропарь(и)/кондак(и) дня и святого,
// на "И ныне" — общий Богородичен "Предстательство христиан".
// Возвращает null, пока не загружены "тропари дневные" (liturgy-day-tropars).
function buildEntranceItems(weekdayIdx, minea, dayTropars, temple) {
  if (!dayTropars) return null;
  const dayKey = ENTRANCE_DAY_KEYS[weekdayIdx];
  const dayData = dayTropars[dayKey];
  if (!dayData) return null;
  const isCrossDay = dayKey === "wed_fri";
  const isSaturday = dayKey === "sat";

  const hasTemple = !!(temple && temple.type !== "none" && (temple.tropar || temple.kondak));
  const isLordTemple = hasTemple && temple.type === "lord";
  const isTheotokosTemple = hasTemple && temple.type === "theotokos";
  const isSaintTemple = hasTemple && temple.type === "saint";

  const saintTropar = minea?.tropar || null;
  const saintKondak = minea?.kondak || null;

  const tropars = [];
  const kondaks = [];

  if (!isCrossDay) {
    if ((isLordTemple || isTheotokosTemple) && temple.tropar) tropars.push(temple.tropar);
    if (dayKey === "thu") {
      if (dayData.tropar_apostles) tropars.push(dayData.tropar_apostles);
      if (dayData.tropar_nikolai) tropars.push(dayData.tropar_nikolai);
    } else if (dayData.tropar) {
      tropars.push(dayData.tropar);
    }
    if (isSaintTemple && temple.tropar) tropars.push(temple.tropar);
    if (saintTropar) tropars.push(saintTropar);

    if (dayKey === "thu") {
      if (dayData.kondak_apostles) kondaks.push(dayData.kondak_apostles);
    } else if (dayData.kondak) {
      kondaks.push(dayData.kondak);
    }
    if (isSaintTemple && temple.kondak) kondaks.push(temple.kondak);
    if (dayKey === "thu" && dayData.kondak_nikolai) kondaks.push(dayData.kondak_nikolai);
    if (saintKondak) kondaks.push(saintKondak);
  } else {
    // Среда/пятница — Кресту (тропарь храма Господского не поётся, т.к. первым
    // всегда идёт тропарь Кресту — Господский тропарь не может быть дважды).
    tropars.push(dayData.tropar);
    if ((isTheotokosTemple || isSaintTemple) && temple.tropar) tropars.push(temple.tropar);
    if (saintTropar) tropars.push(saintTropar);

    if (!isLordTemple) kondaks.push(dayData.kondak);
    if (isSaintTemple && temple.kondak) kondaks.push(temple.kondak);
    if (saintKondak) kondaks.push(saintKondak);
  }

  const zaupokoyKondak = isSaturday ? dayTropars.sat?.kondak_za_usopshikh : null;
  const inyneKondak =
    (isLordTemple || isTheotokosTemple) && temple.kondak ? temple.kondak : PREDSTATELSTVO_BOGORODICHEN;

  const items = [];
  tropars.forEach((text, i) => {
    if (i > 0 && i === tropars.length - 1) {
      items.push({ section: "Тропарь по входе", role: "Лик", text: "Сла́ва:" });
    }
    items.push({ section: "Тропарь по входе", role: "Лик", text });
  });

  kondaks.forEach((text, i) => {
    if (i > 0 && i === kondaks.length - 1 && !zaupokoyKondak) {
      items.push({ section: "Кондак", role: "Лик", text: "Сла́ва:" });
    }
    items.push({ section: "Кондак", role: "Лик", text });
  });
  if (zaupokoyKondak) {
    items.push({ section: "Кондак", role: "Лик", text: "Сла́ва:" });
    items.push({ section: "Кондак", role: "Лик", text: zaupokoyKondak });
  }
  items.push({ section: "Кондак", role: "Лик", text: "И ны́не:" });
  items.push({ section: "Кондак", role: "Лик", text: inyneKondak });

  return items;
}

// Подсветка найденного текста в результатах поиска
function highlightMatch(text, searchTerm) {
  if (!searchTerm) return text;
  const escaped = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  return text.replace(regex, '<mark>$1</mark>');
}

// Пояснение для дня, на который служба пока не составляется. Лучше честно
// сказать, почему службы нет, чем показать собранную не по уставу.
// ===== Начальная буква =====
// Каждый текст (стихира, тропарь, возглас, абзац с новой стихирой) начинается
// с большой красной буквы, как в богослужебных книгах. Подпись перед текстом
// («Стихи́ра 1:», «Мученичен:») остаётся обычной — красится первая буква
// самого песнопения. Ударение (U+0301) остаётся при букве.
const LABEL_WORDS = /^(псалом|стихир|мученичен|богородичен|крестобогородичен|троичен|тропар|ирмос|седален|кондак|икос|светилен|ексапостиларий|задостойник|глас|подобен|запев|стих)/;
function splitLabel(paragraph) {
  const m = paragraph.match(/^([^:.!?«»\n]{1,40}:)\s+(?=\S)/u);
  if (!m) return ["", paragraph];
  const plain = m[1].normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  return LABEL_WORDS.test(plain) ? [m[0], paragraph.slice(m[0].length)] : ["", paragraph];
}
function renderWithInitial(paragraph) {
  const [label, rest] = splitLabel(paragraph);
  const m = rest.match(/^([«"„([]*)(\p{L}\p{M}*)/u);
  if (!m) return paragraph;
  return (
    <>
      {label && <span className="text-label">{label}</span>}
      {m[1]}
      <span className="initial">{m[2]}</span>
      {rest.slice(m[0].length)}
    </>
  );
}
const NO_INITIAL_ROLES = new Set(["Предуведомление"]);

function emptyMessage(reason) {
  const fallback = (
    <>
      В базе пока нет данных для этой даты.
      <br />
      Попробуйте выбрать другой день.
    </>
  );
  if (!reason) return fallback;
  switch (reason.reason) {
    case "feast-period":
      return (
        <>
          {reason.feast}: предпразднство, праздник или попразднство.
          <br />
          В эти дни Октоих не поётся, а песнопения праздника в приложение ещё
          не внесены — служба пока не составляется. Пользуйтесь Минеей.
        </>
      );
    case "annunciation-forefeast":
    case "annunciation-afterfeast":
      return (
        <>
          {reason.reason === "annunciation-forefeast" ? "Предпразднство" : "Отдание"} Благовещения
          в Великий пост — служба соединяется с постной по Марковым главам
          Типикона (под {reason.reason === "annunciation-forefeast" ? "24" : "26"} марта).
          <br />
          Тексты постной службы в приложение ещё не внесены — пользуйтесь Триодью, Минеей и Типиконом.
        </>
      );
    case "triod-not-implemented":
      return (
        <>
          День Постной или Цветной Триоди — служба этого дня в приложение ещё
          не внесена.
          <br />
          Пользуйтесь Триодью и Минеей.
        </>
      );
    case "sretenie-triodion-coincidence":
      return (
        <>
          Сретение Господне совпадает с днём Триоди — служба составляется по
          особому указанию Типикона и в приложение ещё не внесена.
        </>
      );
    case "no-minea-data":
      return (
        <>
          Служба святому этого дня в приложение ещё не внесена.
          <br />
          Пользуйтесь Минеей.
        </>
      );
    default:
      return fallback;
  }
}

function App() {
  // ===== Состояние =====
  const [selectedDate, setSelectedDate] = useState(() => dateFromUrl() || new Date());
  const dateInputRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [day, setDay] = useState(null);
  // Почему для даты нет службы (результат planDayService с ok: false).
  const [emptyReason, setEmptyReason] = useState(null);
  const [templates, setTemplates] = useState({});
  const [variables, setVariables] = useState({});
  const [zachala, setZachala] = useState({ apostle: null, gospel: null });
  const [bibleBooks, setBibleBooks] = useState({});
  const [theme, setTheme] = useState(() => loadSetting("theme", "light"));
  const [fontSize, setFontSize] = useState(() => loadSetting("fontSize", 1.2));
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [showBookmarks, setShowBookmarks] = useState(false);
  // Служба, до которой докручена страница (подсветка в оглавлении).
  const [currentServiceKey, setCurrentServiceKey] = useState(null);
  const [templeType, setTempleType] = useState(() => loadSetting("templeType", "none"));
  const [templeTropar, setTempleTropar] = useState(() => loadSetting("templeTropar", ""));
  const [templeKondak, setTempleKondak] = useState(() => loadSetting("templeKondak", ""));
  const [showTemple, setShowTemple] = useState(false);

  // ===== Эффекты: применение темы и сохранение настроек =====
  useEffect(() => {
    document.body.dataset.theme = theme;
    saveSetting("theme", theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.style.setProperty("--prayer-size", fontSize + "rem");
    saveSetting("fontSize", fontSize);
  }, [fontSize]);

  useEffect(() => {
    saveSetting("templeType", templeType);
  }, [templeType]);

  useEffect(() => {
    saveSetting("templeTropar", templeTropar);
  }, [templeTropar]);

  useEffect(() => {
    saveSetting("templeKondak", templeKondak);
  }, [templeKondak]);

  // Тропари и кондаки дневные (устав о входе на Литургии) — общий справочник,
  // не зависит от даты, загружается один раз.
  useEffect(() => {
    getDocData("templates", "liturgy-day-tropars").then((data) => {
      if (data) {
        setTemplates((prev) => ({ ...prev, "liturgy-day-tropars": data }));
      }
    });
  }, []);

  // Богородичны отпустительные по гласам (общий справочник, не зависит от
  // даты) — выбираются по гласу тропаря святого (minea.tropar_glas), а не
  // по седмичному гласу Октоиха, см. sourcesByType ниже.
  useEffect(() => {
    getDocData("templates", "bogorodichny-otpustitelnye").then((data) => {
      if (data) {
        setTemplates((prev) => ({ ...prev, "bogorodichny-otpustitelnye": data }));
      }
    });
  }, []);

  // Таблица зачал (номер → главы/стихи) — общий справочник, не зависит от
  // даты. Сам текст чтения (public/data/bible/*) подгружается отдельно,
  // только для книг, реально нужных текущему дню (см. ниже).
  useEffect(() => {
    Promise.all([getDocData("zachala", "apostle"), getDocData("zachala", "gospel")]).then(
      ([apostle, gospel]) => {
        if (apostle && gospel) setZachala({ apostle, gospel });
      }
    );
  }, []);

  // ===== Загрузка дня + шаблонов + переменных =====
  useEffect(() => {
    async function loadDay() {
      setLoading(true);
      setError(null);
      setDay(null);
      setEmptyReason(null);

      try {
        const docId = toDocId(selectedDate);
        const snapshot = await getDocData("days", docId);

        let dayData = null;
        if (snapshot) {
          // Готовый (проверенный вручную) день имеет приоритет над расчётом.
          dayData = snapshot;
        } else {
          // Готового файла для этого дня нет — пробуем построить его на лету
          // по уставу (движок src/lib/typikon.js): двунадесятый непереходящий
          // праздник не требует данных Минеи, для рядового дня нужен ещё
          // файл minea/{ММ-ДД}, который не зависит от года.
          const mmdd = toMonthDayKey(selectedDate);
          let mineaMeta = null;
          if (!FIXED_GREAT_FEASTS[mmdd]) {
            const mineaData = await getDocData("minea", mmdd);
            if (mineaData) mineaMeta = mineaData._meta || null;
          }
          const result = planDayService(selectedDate, mineaMeta);
          if (result.ok) {
            dayData = { ...result.plan, computed: true };
          } else {
            setEmptyReason(result);
          }
        }

        if (!dayData) {
          setDay(null);
          setLoading(false);
          return;
        }

        setDay(dayData);

        const templateIds = new Set();

        if (dayData.services) {
          Object.values(dayData.services).forEach((templateValue) => {
            // Если это строка — обычная служба
            if (typeof templateValue === "string") {
              templateIds.add(templateValue);
            }
            // Если это объект (например, hours: { "1": "...", "3": "..." }) — собираем все шаблоны
            else if (typeof templateValue === "object" && templateValue !== null) {
              Object.values(templateValue).forEach((subTemplateId) => {
                if (typeof subTemplateId === "string") {
                  templateIds.add(subTemplateId);
                }
              });
            }
          });
        }

        // Источники переменных по пространствам имён: { oktoih: "...", minea: "..." }.
        // Старое поле variables.oktoih_source поддерживается как алиас sources.oktoih.
        const variableSources = { ...(dayData.variables?.sources || {}) };
        if (dayData.variables?.oktoih_source && !variableSources.oktoih) {
          variableSources.oktoih = dayData.variables.oktoih_source;
        }
        // minea хранится в отдельной папке /data/minea, остальные пространства
        // имён (сейчас только oktoih) — в той же папке "templates", что и шаблоны.
        const variableCollectionByType = { minea: "minea" };
        const variableEntries = Object.entries(variableSources)
          .filter(([, id]) => !!id)
          .map(([type, id]) => [variableCollectionByType[type] || "templates", id]);

        const templateIdsToLoad = [...templateIds].filter((id) => !templates[id]);
        const variableIdsToLoad = variableEntries.filter(([, id]) => !variables[id]);

        const promises = [];

        if (templateIdsToLoad.length > 0) {
          promises.push(
            ...templateIdsToLoad.map((id) =>
              getDocData("templates", id).then((data) => ({ type: 'template', id, data }))
            )
          );
        }

        if (variableIdsToLoad.length > 0) {
          promises.push(
            ...variableIdsToLoad.map(([collectionName, id]) =>
              getDocData(collectionName, id).then((data) => ({ type: 'variable', id, data }))
            )
          );
        }

        if (promises.length > 0) {
          const results = await Promise.all(promises);

          const fetchedTemplates = {};
          const fetchedVariables = {};

          results.forEach(({ type, id, data }) => {
            if (data) {
              if (type === 'template') fetchedTemplates[id] = data;
              else if (type === 'variable') fetchedVariables[id] = data;
            }
          });

          // Функциональная форма — чтобы не затереть данные, подгруженные
          // параллельно другим эффектом (например, "тропари дневные").
          if (Object.keys(fetchedTemplates).length > 0) {
            setTemplates((prev) => ({ ...prev, ...fetchedTemplates }));
          }
          if (Object.keys(fetchedVariables).length > 0) {
            setVariables((prev) => ({ ...prev, ...fetchedVariables }));
          }
        }
      } catch (e) {
        setError("Ошибка загрузки: " + e.message);
      } finally {
        setLoading(false);
      }
    }
    loadDay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  // Текст чтений (Апостол/Евангелие): ссылка на зачало в Минее
  // (liturgy_apostle_reading/liturgy_gospel_reading) даёт только номер —
  // по таблице зачал определяем, какие книги Библии нужны, и подгружаем
  // только их (а не весь корпус сразу).
  useEffect(() => {
    if (!zachala.apostle || !zachala.gospel) return;
    const mineaId = day?.variables?.sources?.minea;
    const minea = mineaId ? variables[mineaId] : null;
    if (!minea) return;

    const neededCodes = new Set();
    [
      [minea.liturgy_apostle_reading, "apostle", zachala.apostle],
      [minea.liturgy_gospel_reading, "gospel", zachala.gospel],
    ].forEach(([citation, kind, table]) => {
      const parsed = parseZachaloCitation(citation, kind);
      const ranges = resolveZachaloRanges(parsed, kind, table);
      booksNeededFor(ranges).forEach((code) => neededCodes.add(code));
    });

    const toLoad = [...neededCodes].filter((code) => !bibleBooks[code]);
    if (!toLoad.length) return;
    Promise.all(toLoad.map((code) => getDocData("bible", code).then((data) => [code, data]))).then(
      (pairs) => {
        const fetched = {};
        pairs.forEach(([code, data]) => { if (data) fetched[code] = data; });
        if (Object.keys(fetched).length) setBibleBooks((prev) => ({ ...prev, ...fetched }));
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, variables, zachala]);

  // ===== Производные значения =====
  const cycleTheme = () => {
    const next = { light: "dark", dark: "kliros-night", "kliros-night": "light" };
    setTheme(next[theme]);
  };

  const themeIcon = { light: "☀", dark: "☾", "kliros-night": "★" }[theme];

  // flatIndex сохраняется на каждом элементе, чтобы при рендере не искать
  // позицию повторным activeItems.indexOf(item) (O(n) на элемент → O(n²) на
  // весь список служб из сотен реплик).
  // items — реплики одной службы; offset — сквозной номер первой реплики
  // службы на странице (для поиска и прокрутки). Якоря разделов и песней
  // канона уникальны в пределах всей страницы.
  const groupBySection = (items, offset, serviceKey) => {
    const groups = [];
    let current = null;
    items.forEach((item, i) => {
      const flatIndex = offset + i;
      if (!current || current.section !== item.section) {
        current = {
          section: item.section,
          anchor: `sec-${serviceKey}-${groups.length}`,
          items: [],
          subBookmarks: [],
        };
        groups.push(current);
      }
      current.items.push({ item, flatIndex });

      // Если элемент — канон, собираем песни как подзакладки
      if (item.is_canon && item.canon && item.canon.structure) {
        item.canon.structure.forEach((ode, odeIdx) => {
          if (ode.title) {
            current.subBookmarks.push({
              title: ode.title,
              anchor: `ode-${flatIndex}-${odeIdx}`,
              partsCount: (ode.parts || []).length,
            });
          }
        });
      }
    });
    return groups;
  };

  // ===== Рендер канона =====
  // Рендер одной "части" канона (ирмос, тропарь, катавасия и т.д.)
  const renderCanonPart = (part, idx, canonVariables) => {
    let text = part.text || "";
    if (canonVariables) {
      const substituted = substituteVariables(text, canonVariables);
      text = substituted === text && part.fallback ? part.fallback : substituted;
    } else if (part.fallback) {
      text = part.fallback;
    }

    const typeClassMap = {
      irmos: "canon-irmos",
      tropar: "canon-tropar",
      bogorodichen: "canon-bogorodichen",
      katavasia: "canon-katavasia",
    };

    // Припев отображаем особо — курсивом, без заголовка-роли
    if (part.type === "refrain_heading") {
      return (
        <div key={idx} className="canon-refrain">
          <span className="canon-refrain-label">{part.label || "Припев:"}</span>{" "}
          <span className="canon-refrain-text">{text}</span>
        </div>
      );
    }

    const className = typeClassMap[part.type] || "canon-part";

    return (
      <div key={idx} className={`prayer ${className}`}>
        <span className="prayer-role">{part.label}</span>
        {(text || "").split(/\n\n+/).map((paragraph, pIdx) => (
          <p key={pIdx} className="prayer-text">{renderWithInitial(paragraph)}</p>
        ))}
      </div>
    );
  };

  // Рендер одной песни канона
  const renderCanonOde = (ode, canonVariables, anchor) => {
    return (
      <div key={ode.ode} className="canon-ode">
        <h4 className="canon-ode-title" id={anchor}>{ode.title}</h4>
        {ode.parts && ode.parts
          .filter((part) => passesConditions(part, canonVariables))
          .map((part, idx) => renderCanonPart(part, idx, canonVariables))}
      </div>
    );
  };

  // Рендер всего канона
  const renderCanon = (item, canonVariables, flatIndex) => {
    if (!item.canon || !item.canon.structure) return null;
    return (
      <div className="canon">
        {item.canon.title && (
          <div className="canon-subtitle">{item.canon.title}</div>
        )}
        {item.canon.structure.map((ode, odeIdx) => renderCanonOde(ode, canonVariables, `ode-${flatIndex}-${odeIdx}`))}
      </div>
    );
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const selected = new Date(selectedDate);
  selected.setHours(0, 0, 0, 0);
  const isToday = selected.getTime() === today.getTime();

  const dateLabel = day?.dateLabel || humanLabel(selectedDate);

  // ===== Службы дня: последовательность и реплики =====
  const serviceSequence = useMemo(
    () => buildServiceSequence(day?.services, day?.serviceLabels, day?.vespersSameDay),
    [day]
  );

  // Источники переменных по пространствам имён ({{oktoih.x}}, {{minea.x}}).
  // variables.oktoih_source — старое поле, поддерживается как алиас sources.oktoih.
  // Мемоизировано: пересчёт нужен только при смене дня или подгрузке
  // переменных, а не при каждом вводе в поиске/полях храма.
  const sourcesByType = useMemo(() => {
    const variableSources = { ...(day?.variables?.sources || {}) };
    if (day?.variables?.oktoih_source && !variableSources.oktoih) {
      variableSources.oktoih = day.variables.oktoih_source;
    }
    const result = {};
    Object.entries(variableSources).forEach(([type, id]) => {
      if (id && variables[id]) result[type] = variables[id];
    });
    // Признаки дня из плана (variables.flags), для условий only_if: "day.<флаг>".
    // Например, day.alleluia — на утрене «Аллилуиа» вместо «Бог Господь»
    // (будни Великого поста): на часах читается тропарь часа со стихами.
    result.day = { ...(day?.variables?.flags || {}) };
    // Богородичен отпустительный выбирается по гласу тропаря СВЯТОГО дня
    // (minea.tropar_glas), а не по седмичному гласу Октоиха: если он известен,
    // подменяем oktoih.tropar_bogorodichen_otpustitelny вычисленным значением.
    // Без minea.tropar_glas (пока не внесён для дня) — остаётся как было,
    // значение из файла Октоиха по умолчанию.
    const bogorodichnyTable = templates["bogorodichny-otpustitelnye"];
    const tropGlas = result.minea?.tropar_glas;
    if (bogorodichnyTable && tropGlas) {
      const weekday = selectedDate.getDay();
      const group = weekday === 1 ? "monday"
        : weekday === 2 || weekday === 4 ? "tue_thu"
        : weekday === 3 || weekday === 5 ? "wed_fri"
        : weekday === 6 ? "saturday"
        : null;
      const text = group && bogorodichnyTable[`glas${tropGlas}`]?.[group];
      if (text) {
        result.oktoih = { ...result.oktoih, tropar_bogorodichen_otpustitelny: text };
      }
    }
    return result;
  }, [day, variables, templates, selectedDate]);

  // Тропари/кондаки по входе на будничной Литургии — вычисляются по уставу
  // (день седмицы + Минея + настройка храма), а не берутся из шаблона.
  const dayTroparsTemplate = templates["liturgy-day-tropars"];
  const entranceItems = useMemo(
    () =>
      buildEntranceItems(selectedDate.getDay(), sourcesByType.minea, dayTroparsTemplate, {
        type: templeType,
        tropar: templeTropar.trim(),
        kondak: templeKondak.trim(),
      }),
    [selectedDate, sourcesByType.minea, dayTroparsTemplate, templeType, templeTropar, templeKondak]
  );

  // Реплики одного шаблона с подстановкой переменных.
  const buildItems = (template) => {
    if (!template?.items) return [];
    return template.items.flatMap((item) => {
      if (!passesConditions(item, sourcesByType)) return [];

      // Канон обрабатывается отдельно — не трогаем его поля
      if (item.is_canon) return [item];

      if (item.is_entrance_troparia) {
        if (entranceItems) return entranceItems;
        // Пока справочник тропарей дневных не загружен — показываем только святого дня
        const fallback = [];
        if (sourcesByType.minea?.tropar) {
          fallback.push({ section: "Тропарь по входе", role: "Лик", text: sourcesByType.minea.tropar });
        }
        if (sourcesByType.minea?.kondak) {
          fallback.push({ section: "Кондак", role: "Лик", text: sourcesByType.minea.kondak });
        }
        return fallback;
      }

      if (item.variable_type && sourcesByType[item.variable_type]) {
        const substitutedText = substituteVariables(item.text, sourcesByType);
        let finalText = substitutedText === item.text && item.fallback !== undefined
          ? item.fallback
          : substitutedText;

        // Апостол/Евангелие: Минея даёт только ссылку на зачало — дописываем
        // сам текст, если таблица зачал и нужная книга Библии уже загружены.
        if (item.variable_key === "liturgy_apostle_reading" || item.variable_key === "liturgy_gospel_reading") {
          const kind = item.variable_key === "liturgy_apostle_reading" ? "apostle" : "gospel";
          const citation = sourcesByType.minea?.[item.variable_key];
          const parsed = parseZachaloCitation(citation, kind);
          const ranges = resolveZachaloRanges(parsed, kind, kind === "gospel" ? zachala.gospel : zachala.apostle);
          const readingText = buildReadingText(ranges, (code) => bibleBooks[code]);
          if (readingText) finalText = `${finalText}\n\n${readingText}`;
        }

        if (!finalText) return [];
        return [{ ...item, text: finalText }];
      }
      return [item];
    });
  };

  // Все службы дня: у каждой свои реплики и разделы; сквозная нумерация
  // реплик (flatIndex) — общая на всю страницу, для поиска и прокрутки.
  const { renderedServices, allItems } = useMemo(() => {
    const out = [];
    const all = [];
    serviceSequence.forEach((svc) => {
      if (svc.missing) {
        out.push({ ...svc, groups: [] });
        return;
      }
      const template = templates[svc.templateId];
      const items = template ? buildItems(template) : null;
      const offset = all.length;
      if (items) items.forEach((item) => all.push({ ...item, serviceKey: svc.key, serviceTitle: svc.title }));
      out.push({
        ...svc,
        loaded: !!template,
        groups: items ? groupBySection(items, offset, svc.key) : [],
      });
    });
    return { renderedServices: out, allItems: all };
    // buildItems зависит от перечисленных ниже значений
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceSequence, templates, entranceItems, sourcesByType, zachala, bibleBooks]);

  const hasAnyContent = allItems.length > 0;

  // ===== Поиск — по всем службам дня =====
  const searchResults = (() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q || !allItems.length) return [];

    const results = [];
    allItems.forEach((item, index) => {
      // Пропускаем каноны из поиска (пока)
      if (item.is_canon) return;
      if (!item.text || !item.role || !item.section) return;
      const textMatch = item.text.toLowerCase().includes(q);
      const roleMatch = item.role.toLowerCase().includes(q);
      const sectionMatch = item.section.toLowerCase().includes(q);
      if (textMatch || roleMatch || sectionMatch) {
        results.push({
          ...item,
          index,
          highlightedText: highlightMatch(item.text, q),
        });
      }
    });
    return results;
  })();

  const flash = (el, cls) => {
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), 2000);
  };

  const scrollToItem = (index) => {
    const element = document.querySelector(`[data-item-index="${index}"]`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      flash(element, 'search-highlight');
    }
    setShowSearch(false);
    setSearchQuery("");
  };

  // ===== Закладки и оглавление =====
  const scrollToAnchor = (id, highlight = true) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (highlight) flash(el, 'section-highlight');
    }
    setShowBookmarks(false);
  };

  // Подсветка в оглавлении той службы, которая сейчас на экране.
  useEffect(() => {
    if (!("IntersectionObserver" in window)) return;
    const sections = document.querySelectorAll(".service-block");
    if (!sections.length) return;
    const visible = new Map();
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => visible.set(e.target.dataset.service, e.isIntersecting));
        const first = [...sections].find((s) => visible.get(s.dataset.service));
        if (first) setCurrentServiceKey(first.dataset.service);
      },
      { rootMargin: "-120px 0px -55% 0px" }
    );
    sections.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, [renderedServices]);

  // На узком экране оглавление прокручивается вбок — держим подсвеченную
  // кнопку в видимой части полосы.
  useEffect(() => {
    if (!currentServiceKey) return;
    const btn = document.querySelector(`.service-toc-btn[data-key="${currentServiceKey}"]`);
    const bar = btn?.parentElement;
    if (!btn || !bar) return;
    const left = btn.offsetLeft - (bar.clientWidth - btn.offsetWidth) / 2;
    bar.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
  }, [currentServiceKey]);

  // При смене даты — к началу страницы (подсветку оглавления обновит
  // IntersectionObserver выше, когда службы нового дня появятся на экране).
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [selectedDate]);

  // ===== Рендеринг =====
  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">Клирос</div>
        <div className="topbar-tools">
          <button className="icon-btn" onClick={() => setShowSearch(!showSearch)} title="Поиск">🔍</button>
          <button className="icon-btn" onClick={() => setShowTemple(!showTemple)} title="Храм (тропари и кондаки по входе)">🏛</button>
          <button className="icon-btn" onClick={() => setFontSize(Math.max(0.9, fontSize - 0.1))} title="Меньше">А−</button>
          <button className="icon-btn" onClick={() => setFontSize(Math.min(2.0, fontSize + 0.1))} title="Больше">А+</button>
          <button className="icon-btn" onClick={cycleTheme} title="Тема">{themeIcon}</button>
        </div>
      </div>

      <div className="date-nav">
        <button className="date-nav-btn" onClick={() => setSelectedDate(shiftDate(selectedDate, -1))}>
          ← Вчера
        </button>
        <button
          className={isToday ? "date-nav-btn today active" : "date-nav-btn today"}
          onClick={() => setSelectedDate(new Date())}
          title="Вернуться к сегодняшнему дню"
        >
          Сегодня
        </button>
        <button className="date-nav-btn" onClick={() => setSelectedDate(shiftDate(selectedDate, 1))}>
          Завтра →
        </button>
        <button
          className="date-nav-btn date-picker-btn"
          onClick={() => {
            const el = dateInputRef.current;
            if (!el) return;
            try {
              if (typeof el.showPicker === "function") {
                el.showPicker();
                return;
              }
            } catch {
              // Браузеры без полноценной поддержки showPicker (например,
              // вне доверенного пользовательского жеста) бросают
              // InvalidStateError — откатываемся на обычный клик по полю.
            }
            el.click();
          }}
          title="Выбрать любую дату"
        >
          📅 Календарь
        </button>
        <input
          ref={dateInputRef}
          type="date"
          className="date-picker-hidden"
          value={toDocId(selectedDate)}
          onChange={(e) => {
            const date = parseIsoDate(e.target.value);
            if (date) setSelectedDate(date);
          }}
          tabIndex={-1}
          aria-hidden="true"
        />
      </div>

      <div className="day-header">
        <div className="day-date">{dateLabel}</div>
        {loading ? (
          <div className="day-loading">Загрузка...</div>
        ) : error ? (
          <div className="day-loading error">{error}</div>
        ) : day ? (
          <>
            <h1 className="day-feast">{day.feastName}</h1>
            <div className="day-meta">
              {day.tone != null && <span>Глас {day.tone}</span>}
              {day.period && <span>{day.period}</span>}
              {day.fasting && <span>{day.fasting}</span>}
              {day.computed && (
                <span title="Служба построена автоматически по уставу соединения Октоиха и Минеи, не выверялась вручную">
                  ⚙ рассчитано по уставу
                </span>
              )}
            </div>
            {day.ustav && (
              <details className="day-ustav" open>
                <summary>{day.ustav.title || "Устав дня"}</summary>
                <ul>
                  {day.ustav.lines.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
                {day.ustav.sources && (
                  <div className="day-ustav-sources">Источники: {day.ustav.sources.join("; ")}</div>
                )}
              </details>
            )}
          </>
        ) : (
          <h1 className="day-feast day-missing">Служба этого дня ещё не добавлена</h1>
        )}
      </div>

      {showSearch && (
        <div className="search-panel">
          <div className="search-input-container">
            <input
              type="text"
              className="search-input"
              placeholder="Поиск по службам дня... (Аминь, Херувимская, Помилуй)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
            />
            <button
              className="search-close"
              onClick={() => {
                setShowSearch(false);
                setSearchQuery("");
              }}
              title="Закрыть поиск"
            >
              ✕
            </button>
          </div>

          {searchQuery && (
            <div className="search-results">
              {searchResults.length === 0 ? (
                <div className="search-no-results">
                  Ничего не найдено по запросу «{searchQuery}»
                </div>
              ) : (
                <>
                  <div className="search-results-header">
                    Найдено: {searchResults.length}
                  </div>
                  {searchResults.map((result, idx) => (
                    <div
                      key={idx}
                      className="search-result-item"
                      onClick={() => scrollToItem(result.index)}
                    >
                      <div className="search-result-meta">
                        <span className="search-result-section">{result.serviceTitle} · {result.section}</span>
                        <span className="search-result-role">{result.role}</span>
                      </div>
                      <div
                        className="search-result-text"
                        dangerouslySetInnerHTML={{ __html: result.highlightedText }}
                      />
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {showTemple && (
        <div className="search-panel temple-panel">
          <div className="temple-panel-header">
            <span>Тропарь и кондак храма (по входе на Литургии)</span>
            <button className="search-close" onClick={() => setShowTemple(false)} title="Закрыть">✕</button>
          </div>
          <div className="temple-panel-hint">
            Посвящение прихода не выводится из календаря — укажите его один раз, и тропарь/кондак храма
            будут вставляться на своё место по уставу (Типикон, гл. 52) вместе с тропарём дня седмицы
            и тропарём/кондаком святого дня. Действует на будничной Литургии.
          </div>
          <select
            className="temple-type-select"
            value={templeType}
            onChange={(e) => setTempleType(e.target.value)}
          >
            <option value="none">Храм не указан</option>
            <option value="lord">Господский (Спасителю, Господским праздникам)</option>
            <option value="theotokos">Богородичный</option>
            <option value="saint">Святого</option>
          </select>
          {templeType !== "none" && (
            <>
              <label className="temple-field-label">
                Тропарь храма
                <textarea
                  className="temple-textarea"
                  rows={3}
                  value={templeTropar}
                  onChange={(e) => setTempleTropar(e.target.value)}
                  placeholder="Текст тропаря престольного праздника"
                />
              </label>
              <label className="temple-field-label">
                Кондак храма
                <textarea
                  className="temple-textarea"
                  rows={3}
                  value={templeKondak}
                  onChange={(e) => setTempleKondak(e.target.value)}
                  placeholder="Текст кондака престольного праздника"
                />
              </label>
            </>
          )}
        </div>
      )}

{/* Оглавление: все службы дня, остаётся сверху при прокрутке */}
      {day && renderedServices.length > 0 && (
        <nav className="service-toc" aria-label="Службы дня">
          {renderedServices.map((svc) => (
            <button
              key={svc.key}
              data-key={svc.key}
              className={[
                "service-toc-btn",
                currentServiceKey === svc.key ? "active" : "",
                svc.missing ? "missing" : "",
              ].join(" ")}
              onClick={() => scrollToAnchor(`svc-${svc.key}`, false)}
            >
              {svc.title}
            </button>
          ))}
        </nav>
      )}

      <div className="service-body">
        {!day ? (
          <div className="empty-service">
            {emptyMessage(emptyReason)}
          </div>
        ) : (
          renderedServices.map((svc) => (
            <section
              key={svc.key}
              id={`svc-${svc.key}`}
              data-service={svc.key}
              className="service-block"
            >
              <h2 className="service-heading">{svc.title}</h2>
              {svc.note && <div className="service-when">{svc.note}</div>}
              {svc.missing ? (
                <div className="service-missing">
                  Для э́того дня в приложе́нии не́т.
                </div>
              ) : !svc.loaded ? (
                <div className="service-missing">Загрузка…</div>
              ) : svc.groups.length === 0 ? (
                <div className="service-missing">Те́кст э́той слу́жбы ещё не добавлен.</div>
              ) : (
                svc.groups.map((group) => (
                  <div key={group.anchor}>
                    <h3 className="section-title" id={group.anchor}>{group.section}</h3>
                    {group.items.map(({ item, flatIndex }) => {
                      // Если элемент — канон, рисуем особо
                      if (item.is_canon && item.canon) {
                        return (
                          <div key={flatIndex} data-item-index={flatIndex}>
                            {renderCanon(item, sourcesByType, flatIndex)}
                          </div>
                        );
                      }
                      // Обычная реплика
                      const prevItem = allItems[flatIndex - 1];
                      const showRole = !prevItem || prevItem.role !== item.role || prevItem.serviceKey !== item.serviceKey;
                      return (
                        <div key={flatIndex} className="prayer" data-item-index={flatIndex}>
                          {showRole && <span className="prayer-role">{item.role}</span>}
                          {(item.text || "").split(/\n\n+/).map((paragraph, pIdx) => (
                            <p key={pIdx} className="prayer-text">
                              {NO_INITIAL_ROLES.has(item.role) ? paragraph : renderWithInitial(paragraph)}
                            </p>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
            </section>
          ))
        )}
      </div>

      {/* Плавающая кнопка закладок */}
      {hasAnyContent && (
        <button
          className="bookmarks-fab"
          onClick={() => setShowBookmarks(!showBookmarks)}
          title="Закладки по службам дня"
          aria-label="Закладки"
        >
          {showBookmarks ? "✕" : "📑"}
        </button>
      )}

      {/* Панель закладок: службы → разделы → песни канона */}
      {showBookmarks && hasAnyContent && (
        <>
          <div className="bookmarks-backdrop" onClick={() => setShowBookmarks(false)} />
          <div className="bookmarks-panel">
            <div className="bookmarks-header">Закладки</div>
            <div className="bookmarks-list">
              {renderedServices.filter((svc) => svc.groups.length > 0).map((svc) => (
                <div key={svc.key} className="bookmark-service">
                  <button
                    className="bookmark-item bookmark-service-title"
                    onClick={() => scrollToAnchor(`svc-${svc.key}`, false)}
                  >
                    <span className="bookmark-title">{svc.title}</span>
                  </button>
                  {svc.groups.map((group) => (
                    <div key={group.anchor}>
                      <button
                        className="bookmark-item"
                        onClick={() => scrollToAnchor(group.anchor)}
                      >
                        <span className="bookmark-title">{group.section}</span>
                        <span className="bookmark-count">{group.items.length}</span>
                      </button>
                      {group.subBookmarks.length > 0 && (
                        <div className="bookmark-sublist">
                          {group.subBookmarks.map((sub) => (
                            <button
                              key={sub.anchor}
                              className="bookmark-item bookmark-subitem"
                              onClick={() => scrollToAnchor(sub.anchor)}
                            >
                              <span className="bookmark-title">{sub.title}</span>
                              <span className="bookmark-count">{sub.partsCount}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default App;