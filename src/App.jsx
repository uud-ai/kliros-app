import { useEffect, useRef, useState } from "react";
import { planDayService, toMonthDayKey, FIXED_GREAT_FEASTS } from "./lib/typikon.js";
import "./App.css";

const SERVICES = [
  { key: "midnightOffice", title: "Полуно́щница" },
  { key: "vespers", title: "Вече́рня" },
  { key: "matins", title: "У́треня" },
  { key: "liturgy", title: "Литурги́я" },
  { key: "hours", title: "Часы́" },
];

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
  const res = await fetch(`/data/${collection}/${id}.json`);
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

function App() {
  // ===== Состояние =====
  const [selectedDate, setSelectedDate] = useState(new Date(2026, 3, 26));
  const dateInputRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [day, setDay] = useState(null);
  const [templates, setTemplates] = useState({});
  const [variables, setVariables] = useState({});
  const [activeService, setActiveService] = useState(() => loadSetting("activeService", "liturgy"));
  const [theme, setTheme] = useState(() => loadSetting("theme", "light"));
  const [fontSize, setFontSize] = useState(() => loadSetting("fontSize", 1.2));
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [activeHour, setActiveHour] = useState(() => loadSetting("activeHour", "3"));
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
    saveSetting("activeService", activeService);
  }, [activeService]);

  useEffect(() => {
    saveSetting("activeHour", activeHour);
  }, [activeHour]);

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

  // ===== Загрузка дня + шаблонов + переменных =====
  useEffect(() => {
    async function loadDay() {
      setLoading(true);
      setError(null);
      setDay(null);

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

  // ===== Производные значения =====
  const cycleTheme = () => {
    const next = { light: "dark", dark: "kliros-night", "kliros-night": "light" };
    setTheme(next[theme]);
  };

  const themeIcon = { light: "☀", dark: "☾", "kliros-night": "★" }[theme];

  const groupBySection = (items) => {
    const groups = [];
    let current = null;
    items.forEach((item) => {
      if (!current || current.section !== item.section) {
        current = { section: item.section, items: [], subBookmarks: [] };
        groups.push(current);
      }
      current.items.push(item);

      // Если элемент — канон, собираем песни как подзакладки
      if (item.is_canon && item.canon && item.canon.structure) {
        item.canon.structure.forEach((ode) => {
          if (ode.title) {
            current.subBookmarks.push({
              title: ode.title,
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
          <p key={pIdx} className="prayer-text">{paragraph}</p>
        ))}
      </div>
    );
  };

  // Рендер одной песни канона
  const renderCanonOde = (ode, canonVariables) => {
    return (
      <div key={ode.ode} className="canon-ode">
        <h3 className="canon-ode-title">{ode.title}</h3>
        {ode.parts && ode.parts.map((part, idx) => renderCanonPart(part, idx, canonVariables))}
      </div>
    );
  };

  // Рендер всего канона
  const renderCanon = (item, canonVariables) => {
    if (!item.canon || !item.canon.structure) return null;
    return (
      <div className="canon">
        {item.canon.title && (
          <div className="canon-subtitle">{item.canon.title}</div>
        )}
        {item.canon.structure.map((ode) => renderCanonOde(ode, canonVariables))}
      </div>
    );
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const selected = new Date(selectedDate);
  selected.setHours(0, 0, 0, 0);
  const isToday = selected.getTime() === today.getTime();

  const dateLabel = day?.dateLabel || humanLabel(selectedDate);

  // Получаем активный шаблон (для часов — выбираем подшаблон по выбранному часу)
  let activeTemplateId = null;
  const serviceValue = day?.services?.[activeService];
  if (typeof serviceValue === "string") {
    activeTemplateId = serviceValue;
  } else if (activeService === "hours" && serviceValue && typeof serviceValue === "object") {
    activeTemplateId = serviceValue[activeHour];
  }
  const activeTemplate = activeTemplateId ? templates[activeTemplateId] : null;

  // Источники переменных по пространствам имён ({{oktoih.x}}, {{minea.x}}).
  // variables.oktoih_source — старое поле, поддерживается как алиас sources.oktoih.
  const variableSources = { ...(day?.variables?.sources || {}) };
  if (day?.variables?.oktoih_source && !variableSources.oktoih) {
    variableSources.oktoih = day.variables.oktoih_source;
  }
  const sourcesByType = {};
  Object.entries(variableSources).forEach(([type, id]) => {
    if (id && variables[id]) sourcesByType[type] = variables[id];
  });

  // Тропари/кондаки по входе на будничной Литургии — вычисляются по уставу
  // (день седмицы + Минея + настройка храма), а не берутся из шаблона.
  const temple = { type: templeType, tropar: templeTropar.trim(), kondak: templeKondak.trim() };
  const entranceItems = buildEntranceItems(
    selectedDate.getDay(),
    sourcesByType.minea,
    templates["liturgy-day-tropars"],
    temple
  );

  // Формируем массив реплик с подстановкой переменных
  let activeItems = [];
  if (activeTemplate?.items) {
    activeItems = activeTemplate.items.flatMap((item) => {
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
        const finalText = substitutedText === item.text && item.fallback
          ? item.fallback
          : substitutedText;
        return [{ ...item, text: finalText }];
      }
      return [item];
    });
  }

  const groups = groupBySection(activeItems);

  // ===== Поиск =====
  const searchResults = (() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q || !activeItems.length) return [];

    const results = [];
    activeItems.forEach((item, index) => {
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

  const scrollToItem = (index) => {
    const element = document.querySelector(`[data-item-index="${index}"]`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element.classList.add('search-highlight');
      setTimeout(() => element.classList.remove('search-highlight'), 2000);
    }
    setShowSearch(false);
    setSearchQuery("");
  };

  // ===== Закладки =====
  const scrollToSection = (sectionName) => {
    const elements = document.querySelectorAll('.section-title');
    for (const el of elements) {
      if (el.textContent === sectionName) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        el.classList.add('section-highlight');
        setTimeout(() => el.classList.remove('section-highlight'), 2000);
        break;
      }
    }
    setShowBookmarks(false);
  };

  // Прокрутка к конкретной песни канона
  const scrollToCanonOde = (odeTitle) => {
    const elements = document.querySelectorAll('.canon-ode-title');
    for (const el of elements) {
      if (el.textContent === odeTitle) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        el.classList.add('section-highlight');
        setTimeout(() => el.classList.remove('section-highlight'), 2000);
        break;
      }
    }
    setShowBookmarks(false);
  };

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
            const [y, m, d] = e.target.value.split("-").map(Number);
            setSelectedDate(new Date(y, m - 1, d));
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
              placeholder="Поиск по службе... (Аминь, Херувимская, Помилуй)"
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
                        <span className="search-result-section">{result.section}</span>
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

<div className="service-tabs">
        {SERVICES.map((svc) => (
          <button
            key={svc.key}
            className={activeService === svc.key ? "service-tab active" : "service-tab"}
            onClick={() => setActiveService(svc.key)}
          >
            {svc.title}
          </button>
        ))}
      </div>

      {/* Подвкладки для Часов */}
      {activeService === "hours" && day?.services?.hours && typeof day.services.hours === "object" && (
        <div className="hour-subtabs">
          {["1", "3", "6", "9"].map((hour) => {
            const isAvailable = !!day.services.hours[hour];
            return (
              <button
                key={hour}
                className={`hour-subtab ${activeHour === hour ? "active" : ""} ${isAvailable ? "" : "disabled"}`}
                onClick={() => isAvailable && setActiveHour(hour)}
                disabled={!isAvailable}
                title={isAvailable ? `Час ${hour}-й` : `${hour}-й час не добавлен`}
              >
                {hour}-й час
              </button>
            );
          })}
        </div>
      )}

      <div className="service-body">
        {!day ? (
          <div className="empty-service">
            В базе пока нет данных для этой даты.
            <br />
            Попробуйте выбрать другой день.
          </div>
        ) : groups.length === 0 ? (
          <div className="empty-service">
            Эта служба пока не добавлена.
            <br />
            Скоро появится.
          </div>
        ) : (
          groups.map((group, idx) => (
            <div key={idx}>
              <h2 className="section-title">{group.section}</h2>
              {group.items.map((item, j) => {
                // Если элемент — канон, рисуем особо
                if (item.is_canon && item.canon) {
                  return (
                    <div
                      key={j}
                      data-item-index={activeItems.indexOf(item)}
                    >
                      {renderCanon(item, sourcesByType)}
                    </div>
                  );
                }
               // Обычная реплика
               const itemIndex = activeItems.indexOf(item);
               const prevItem = activeItems[itemIndex - 1];
               const showRole = !prevItem || prevItem.role !== item.role;
               return (
                <div
                  key={j}
                  className="prayer"
                  data-item-index={itemIndex}
                >
                  {showRole && <span className="prayer-role">{item.role}</span>}
                  {(item.text || "").split(/\n\n+/).map((paragraph, pIdx) => (
                    <p key={pIdx} className="prayer-text">{paragraph}</p>
                  ))}
                </div>
              );
              })}
            </div>
          ))
        )}
      </div>

      {/* Плавающая кнопка закладок */}
      {groups.length > 0 && (
        <button
          className="bookmarks-fab"
          onClick={() => setShowBookmarks(!showBookmarks)}
          title="Закладки по службе"
          aria-label="Закладки"
        >
          {showBookmarks ? "✕" : "📑"}
        </button>
      )}

     {/* Панель закладок */}
      {showBookmarks && groups.length > 0 && (
        <>
          <div className="bookmarks-backdrop" onClick={() => setShowBookmarks(false)} />
          <div className="bookmarks-panel">
            <div className="bookmarks-header">Закладки</div>
            <div className="bookmarks-list">
              {groups.map((group, idx) => (
                <div key={idx}>
                  <button
                    className="bookmark-item"
                    onClick={() => scrollToSection(group.section)}
                  >
                    <span className="bookmark-title">{group.section}</span>
                    <span className="bookmark-count">{group.items.length}</span>
                  </button>
                  {group.subBookmarks && group.subBookmarks.length > 0 && (
                    <div className="bookmark-sublist">
                      {group.subBookmarks.map((sub, subIdx) => (
                        <button
                          key={subIdx}
                          className="bookmark-item bookmark-subitem"
                          onClick={() => scrollToCanonOde(sub.title)}
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
          </div>
        </>
      )}
    </div>
  );
}

export default App;