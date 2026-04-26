import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "./firebase";
import "./App.css";

const SERVICES = [
  { key: "vespers", title: "Вече́рня" },
  { key: "matins", title: "У́треня" },
  { key: "liturgy", title: "Литурги́я" },
  { key: "hours", title: "Часы́" },
];

// Формат даты для ID документа в Firestore: "YYYY-MM-DD"
function toDocId(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

// Подстановка переменных {{oktoih.tropar}} → реальный текст
function substituteVariables(text, variables) {
  if (!text || typeof text !== 'string') return text;
  return text.replace(/\{\{([^}]+)\}\}/g, (match, variablePath) => {
    const [type, key] = variablePath.split('.');
    if (type === 'oktoih' && variables && variables[key]) {
      return variables[key];
    }
    return match;
  });
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

  // ===== Загрузка дня + шаблонов + переменных =====
  useEffect(() => {
    async function loadDay() {
      setLoading(true);
      setError(null);
      setDay(null);

      try {
        const docId = toDocId(selectedDate);
        const snapshot = await getDoc(doc(db, "days", docId));

        if (!snapshot.exists()) {
          setDay(null);
          setLoading(false);
          return;
        }

        const dayData = snapshot.data();
        setDay(dayData);

        const templateIds = new Set();
        const variableIds = new Set();

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

        if (dayData.variables && dayData.variables.oktoih_source) {
          variableIds.add(dayData.variables.oktoih_source);
        }

        const templateIdsToLoad = [...templateIds].filter((id) => !templates[id]);
        const variableIdsToLoad = [...variableIds].filter((id) => !variables[id]);

        const promises = [];

        if (templateIdsToLoad.length > 0) {
          promises.push(
            ...templateIdsToLoad.map((id) =>
              getDoc(doc(db, "templates", id)).then((snap) => ({ type: 'template', id, snap }))
            )
          );
        }

        if (variableIdsToLoad.length > 0) {
          promises.push(
            ...variableIdsToLoad.map((id) =>
              getDoc(doc(db, "templates", id)).then((snap) => ({ type: 'variable', id, snap }))
            )
          );
        }

        if (promises.length > 0) {
          const results = await Promise.all(promises);

          const newTemplates = { ...templates };
          const newVariables = { ...variables };

          results.forEach(({ type, id, snap }) => {
            if (snap.exists()) {
              if (type === 'template') newTemplates[id] = snap.data();
              else if (type === 'variable') newVariables[id] = snap.data();
            }
          });

          setTemplates(newTemplates);
          setVariables(newVariables);
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
  const variableSource = day?.variables?.oktoih_source;
  const activeVariables = variableSource ? variables[variableSource] : null;

  // Формируем массив реплик с подстановкой переменных
  let activeItems = [];
  if (activeTemplate?.items) {
    activeItems = activeTemplate.items.map((item) => {
      // Канон обрабатывается отдельно — не трогаем его поля
      if (item.is_canon) return item;

      if (item.variable_type === 'oktoih' && activeVariables) {
        const substitutedText = substituteVariables(item.text, activeVariables);
        const finalText = substitutedText === item.text && item.fallback
          ? item.fallback
          : substitutedText;
        return { ...item, text: finalText };
      }
      return item;
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
        <input
          type="date"
          className="date-picker"
          value={toDocId(selectedDate)}
          onChange={(e) => {
            const [y, m, d] = e.target.value.split("-").map(Number);
            setSelectedDate(new Date(y, m - 1, d));
          }}
          title="Выбрать любую дату"
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
            Попробуйте воскресенье 26 апреля 2026.
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
                      {renderCanon(item, activeVariables)}
                    </div>
                  );
                }
               // Обычная реплика
               return (
                <div
                  key={j}
                  className="prayer"
                  data-item-index={activeItems.indexOf(item)}
                >
                  <span className="prayer-role">{item.role}</span>
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