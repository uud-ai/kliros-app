// Пасхалия и расчёт гласа Октоиха на произвольную дату.
//
// computePascha(year)  — дата православной (юлианской) Пасхи в григорианском
//                         календаре, для года начала пасхального цикла.
// computeGlas(date)    — глас Октоиха (1–8), действующий на календарную дату.
//
// Глас недели меняется с воскресенья на воскресенье; будние дни (Пн–Сб)
// принадлежат гласу недели, начавшейся в предыдущее воскресенье — это
// совпадает с тем, как в этом приложении вечерня субботы подшивается под
// дату следующего воскресенья (см. matins-sunday.json._meta.description).
// Глас 1 начинается в Неделю Фомину (воскресенье через неделю после Пасхи)
// и без остановки повторяется восьминедельным циклом до следующей Пасхи —
// цикл не прерывается ни Пятидесятницей, ни началом нового года.

const DAY_MS = 24 * 60 * 60 * 1000;

// Дата православной Пасхи по юлианскому календарю (алгоритм Мёуса
// для "old calendar" / юлианской Пасхи).
function computePaschaJulian(year) {
  const a = year % 4;
  const b = year % 7;
  const c = year % 19;
  const d = (19 * c + 15) % 30;
  const e = (2 * a + 4 * b - d + 34) % 7;
  const month = Math.floor((d + e + 114) / 31); // 3 = март, 4 = апрель
  const day = ((d + e + 114) % 31) + 1;
  return { month, day };
}

// Смещение между юлианским и григорианским календарём (в сутках) для года.
// 13 суток для 1900–2099, 14 для 2100–2199 и т.д.
function julianToGregorianOffset(year) {
  return 10 + Math.floor((year - 1600) / 100) - Math.floor((year - 1600) / 400);
}

// Возвращает дату Пасхи (григорианский календарь) для года начала цикла.
export function computePascha(year) {
  const { month, day } = computePaschaJulian(year);
  const offset = julianToGregorianOffset(year);
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
}

function atUTCMidnight(date) {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}

// Пасха пасхального года, которому принадлежит дата (Пасха этого года,
// либо прошлогодняя, если дата ещё не дошла до неё). Экспортируется отдельно
// от computeGlas, т.к. нужна и для отсчёта смещения дня от Пасхи (см.
// src/lib/triodion.js), а не только для гласа.
export function paschaForDate(date) {
  const d = atUTCMidnight(date);
  let pascha = computePascha(d.getUTCFullYear());
  if (d.getTime() < pascha.getTime()) {
    pascha = computePascha(d.getUTCFullYear() - 1);
  }
  return pascha;
}

// Глас Октоиха (1–8) на дату, либо null в течение Светлой седмицы
// (Пасха – суббота Светлой седмицы), когда обычный октоиховый цикл ещё
// не действует.
export function computeGlas(date) {
  const d = atUTCMidnight(date);
  const pascha = paschaForDate(d);
  const antipascha = new Date(pascha.getTime() + 7 * DAY_MS); // Неделя Фомина

  if (d.getTime() < antipascha.getTime()) {
    return null; // Светлая седмица — вне обычного гласового цикла
  }

  const dayOfWeek = d.getUTCDay(); // 0 = воскресенье
  const weekAnchor = new Date(d.getTime() - dayOfWeek * DAY_MS); // воскресенье этой седмицы

  const weeksSinceAntipascha = Math.round(
    (weekAnchor.getTime() - antipascha.getTime()) / (7 * DAY_MS)
  );

  return (((weeksSinceAntipascha % 8) + 8) % 8) + 1;
}
