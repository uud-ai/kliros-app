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

// Человекочитаемая подпись дня, если в документе нет своей dateLabel
function humanLabel(date) {
  const days = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];
  const months = ["января", "февраля", "марта", "апреля", "мая", "июня",
                  "июля", "августа", "сентября", "октября", "ноября", "декабря"];
  return `${days[date.getDay()]}, ${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

// Сдвиг даты на n дней (положительное — вперёд, отрицательное — назад)
function shiftDate(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function App() {
  // По умолчанию показываем воскресенье 26 апреля 2026 — день, который у нас в базе
  const [selectedDate, setSelectedDate] = useState(new Date(2026, 3, 26));

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [day, setDay] = useState(null);
  const [activeService, setActiveService] = useState("liturgy");
  const [theme, setTheme] = useState("light");
  const [fontSize, setFontSize] = useState(1.2);

  useEffect(() => {
    document.body.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    document.documentElement.style.setProperty("--prayer-size", fontSize + "rem");
  }, [fontSize]);

  // Загружаем документ каждый раз, когда меняется выбранная дата
  useEffect(() => {
    async function loadDay() {
      setLoading(true);
      setError(null);
      setDay(null);
      try {
        const docId = toDocId(selectedDate);
        const snapshot = await getDoc(doc(db, "days", docId));
        if (snapshot.exists()) {
          setDay(snapshot.data());
        } else {
          setDay(null);
        }
      } catch (e) {
        setError("Ошибка загрузки: " + e.message);
      } finally {
        setLoading(false);
      }
    }
    loadDay();
  }, [selectedDate]);

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
        current = { section: item.section, items: [] };
        groups.push(current);
      }
      current.items.push(item);
    });
    return groups;
  };

  // Проверяем, является ли выбранная дата сегодняшней
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const selected = new Date(selectedDate);
  selected.setHours(0, 0, 0, 0);
  const isToday = selected.getTime() === today.getTime();

  // Подпись даты: если в документе нет dateLabel — формируем сами
  const dateLabel = day?.dateLabel || humanLabel(selectedDate);

  const activeItems = day?.[activeService] || [];
  const groups = groupBySection(activeItems);

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">Клирос</div>
        <div className="topbar-tools">
          <button className="icon-btn" onClick={() => setFontSize(Math.max(0.9, fontSize - 0.1))} title="Меньше">А−</button>
          <button className="icon-btn" onClick={() => setFontSize(Math.min(2.0, fontSize + 0.1))} title="Больше">А+</button>
          <button className="icon-btn" onClick={cycleTheme} title="Тема">{themeIcon}</button>
        </div>
      </div>

      <div className="date-nav">
        <button
          className="date-nav-btn"
          onClick={() => setSelectedDate(shiftDate(selectedDate, -1))}
        >
          ← Вчера
        </button>
        <button
          className={isToday ? "date-nav-btn today active" : "date-nav-btn today"}
          onClick={() => setSelectedDate(new Date())}
          title="Вернуться к сегодняшнему дню"
        >
          Сегодня
        </button>
        <button
          className="date-nav-btn"
          onClick={() => setSelectedDate(shiftDate(selectedDate, 1))}
        >
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

      <div className="service-body">
        {!day ? (
          <div className="empty-service">
            В базе пока нет данных для этой даты.
            <br />
            Попробуйте воскресенье 26 апреля 2026.
          </div>
        ) : groups.length === 0 ? (
          <div className="empty-service">
            Эта служба пока не добавлена в базу.
            <br />
            Скоро появится.
          </div>
        ) : (
          groups.map((group, idx) => (
            <div key={idx}>
              <h2 className="section-title">{group.section}</h2>
              {group.items.map((item, j) => (
                <div key={j} className="prayer">
                  <span className="prayer-role">{item.role}</span>
                  <p className="prayer-text">{item.text}</p>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default App;