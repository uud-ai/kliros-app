// Устав соединения службы Триоди (Постной и Цветной) с Октоихом и Минеей.
//
// В отличие от src/lib/typikon.js (рядовой год, вне триодного цикла), здесь
// всё определяется не Минеей и не гласом, а числом дней от Пасхи — все даты
// этого модуля переходящие. Смещение "offset" = 0 в день Пасхи, отрицательное
// до неё (Постная Триодь), положительное после (Цветная Триодь).
//
// Модуль отвечает на два разных вопроса:
//   1) describeTriodionDay(date) — какой это день триодного цикла и по какой
//      ОБЩЕЙ схеме положено соединять его с Октоихом/Минеей (это и есть
//      устав в строгом смысле — правило, независимое от того, что уже
//      реально набрано в data/templates).
//   2) planPentecostarionSunday(date) — там, где эта схема уже подкреплена
//      реальным содержимым (пока только новозаветные воскресенья Цветной
//      Триоди, минимальной "liturgy-sunday-with-variables" заглушкой),
//      строит план службы для ЛЮБОГО года — так же, как planDayService в
//      typikon.js делает для рядового времени.
//
// Марковы главы (совпадение неподвижного праздника Минеи с этим переходящим
// днём — например, Благовещения с постным буднем или со Страстной) сюда
// намеренно не включены: это отдельная, огромная и очень точная таблица
// исключений из Типикона (гл. 47–50), которую нельзя надёжно восстановить
// по памяти — её нужно переносить из первоисточника после того, как тексты
// Триоди будут внесены в проект. Здесь для неё оставлен только механизм
// (см. MARK_CHAPTERS ниже), который useDayService должен проверять раньше
// общей схемы, когда таблица начнёт заполняться.

import { computeGlas, computePascha } from "./paschalion.js";
import { formatDateLabel } from "./typikon.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function atUTCMidnight(date) {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}

// Ближайшая по времени Пасха к дате (а не "Пасха года этой даты или
// прошлогодняя", как в paschalion.paschaForDate — та функция сделана для
// гласового цикла ОБЫЧНОГО времени, где дата января/февраля ещё относится к
// циклу прошлогодней Пасхи. Здесь же наоборот: январь/февраль/март — это
// уже подготовка к БУДУЩЕЙ Пасхе того же года, поэтому нужно сравнение с
// обеими соседними Пасхами и выбор ближайшей — 133-дневное окно Триоди
// вокруг Пасхи (−70…+63) многократно меньше межпасхального интервала
// (~365 дней), так что неоднозначности не возникает).
function nearestPascha(date) {
  const d = atUTCMidnight(date);
  const year = d.getUTCFullYear();
  let best = null;
  let bestDistance = Infinity;
  for (const y of [year - 1, year, year + 1]) {
    const candidate = computePascha(y);
    const distance = Math.abs(d.getTime() - candidate.getTime());
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

// Число дней от Пасхи (0 = Пасха, отрицательное — до неё, положительное —
// после). Работает для любого года: сама Пасха ищется через Пасхалию.
export function paschaOffset(date) {
  const d = atUTCMidnight(date);
  const pascha = nearestPascha(d);
  return Math.round((d.getTime() - pascha.getTime()) / DAY_MS);
}

// ===== Общая схема соединения с Минеей =====
// Значение — не имя шаблона (шаблонов для Триоди почти нет), а КАТЕГОРИЯ
// правила, которое к этому дню применяется. Дальнейшая работа (когда
// появятся тексты Триоди) — подставить для каждой категории свой набор
// шаблонов; сама категория от появления текстов не изменится.
export const MENAION_SCHEME = {
  // Обычное соединение по рангу святого — так же, как в рядовое время
  // (typikon.js): подготовительные недели и воскресенья Цветной Триоди не
  // отменяют Минею, они лишь добавляют триодную тему поверх воскресной.
  ORDINARY_COMBINATION: "ordinary-combination",
  // Пять воскресений Великого поста (кроме Недели ваий) — служба святому
  // Минеи в этот день не поётся вовсе; всё, что у него есть, переносится на
  // ближайший будний день той же седмицы (см. Типикон, Триодь Постная,
  // общее указание в начале книги). Это НЕ Марковы главы — Маркова глава
  // нужна, только если святой имеет знак не ниже полиелейного и его никак
  // нельзя просто "потерять" — тогда указывается конкретный день переноса.
  LENTEN_SUNDAY_NO_MINEA: "lenten-sunday-no-minea",
  // Будни Великого поста (Пн–Пт): Минея сокращается до тропаря и кондака
  // святому (обычно на "Бог Господь" и по 3-й песни канона), отдельного
  // канона и стихир святому не поётся — Октоих также молчит, всё
  // пространство службы занимает трипеснец/четверопеснец Триоди.
  LENTEN_WEEKDAY_COMMEMORATION_ONLY: "lenten-weekday-commemoration-only",
  // То же, будний день Великого поста, но святой полиелейный/бденный —
  // просто "сократить до тропаря" уже недостаточно (эта степень праздника
  // предполагает полную службу). Устав в этом случае даёт КОНКРЕТНОЕ
  // указание для конкретного святого (частично совершить в сам день,
  // частично перенести на соседний день) — это и есть Маркова глава,
  // здесь без данных таблицы MARK_CHAPTERS решить нельзя.
  MARK_CHAPTER_REQUIRED: "mark-chapter-required",
  // Суббота Великого поста со своей темой (Феодоровская, родительская,
  // Похвала Богородице, Лазарева) — святой Минеи обычно поётся в
  // сокращении вместе с темой субботы; полиелейный/бденный ранг — снова
  // Маркова глава.
  LENTEN_SATURDAY_REDUCED: "lenten-saturday-reduced",
  // Вселенская родительская суббота (мясопустная, Троицкая) — служба
  // целиком заупокойная, Минея святого дня, как правило, переносится на
  // повечерие накануне или полностью опускается.
  SATURDAY_MEMORIAL_UNIVERSAL: "saturday-memorial-universal",
  // День с полностью самостоятельным последованием Господского праздника
  // (Неделя ваий, Страстная седмица, Светлая седмица, Вознесение,
  // Пятидесятница, Отдание Пасхи) — Октоих и Минея не поются вовсе.
  EXCLUDED_OWN_PROPER: "excluded-own-proper",
};

// ===== Календарь смещений от Пасхи =====
// day: смещение в сутках от Пасхи. kind: "sunday" | "saturday" | "weekday".
// period: подпись периода для дня (в стиле periodLabel() из typikon.js).
// sploshnaya: седмица без поста в среду/пятницу (пища), но это НЕ снимает
// требование о соединении/исключении Минеи — это только про fasting.
const NAMED_DAYS = [
  { offset: -70, kind: "sunday", name: "Неде́ля о мытаре́ и фарисе́е", period: "По́стная Три́одь", scheme: MENAION_SCHEME.ORDINARY_COMBINATION },
  { offset: -63, kind: "sunday", name: "Неде́ля о блу́дном сы́не", period: "По́стная Три́одь", scheme: MENAION_SCHEME.ORDINARY_COMBINATION },
  { offset: -57, kind: "saturday", name: "Суббо́та мясопу́стная (Вселе́нская роди́тельская)", period: "По́стная Три́одь", scheme: MENAION_SCHEME.SATURDAY_MEMORIAL_UNIVERSAL },
  { offset: -56, kind: "sunday", name: "Неде́ля мясопу́стная, о Стра́шном Суде́", period: "По́стная Три́одь", scheme: MENAION_SCHEME.ORDINARY_COMBINATION },
  { offset: -49, kind: "sunday", name: "Неде́ля сыропу́стная. Воспомина́ние Ада́мова изгна́ния. Проще́ное воскресе́нье", period: "По́стная Три́одь", scheme: MENAION_SCHEME.ORDINARY_COMBINATION },
  { offset: -48, kind: "weekday", name: "Чи́стый понеде́льник. Нача́ло Вели́кого поста́", period: "Вели́кий пост", scheme: MENAION_SCHEME.LENTEN_WEEKDAY_COMMEMORATION_ONLY },
  { offset: -43, kind: "saturday", name: "Суббо́та 1-й седми́цы, вмч. Фео́дора Ти́рона", period: "Вели́кий пост", scheme: MENAION_SCHEME.LENTEN_SATURDAY_REDUCED },
  { offset: -42, kind: "sunday", name: "Неде́ля 1-я Вели́кого поста́. Торжество́ Правосла́вия", period: "Вели́кий пост", scheme: MENAION_SCHEME.LENTEN_SUNDAY_NO_MINEA, contentKey: "great-lent-sunday-1" },
  { offset: -36, kind: "saturday", name: "Суббо́та 2-й седми́цы — роди́тельская", period: "Вели́кий пост", scheme: MENAION_SCHEME.SATURDAY_MEMORIAL_UNIVERSAL },
  { offset: -35, kind: "sunday", name: "Неде́ля 2-я Вели́кого поста́, свт. Григо́рия Пала́мы", period: "Вели́кий пост", scheme: MENAION_SCHEME.LENTEN_SUNDAY_NO_MINEA, contentKey: "great-lent-sunday-2" },
  { offset: -29, kind: "saturday", name: "Суббо́та 3-й седми́цы — роди́тельская", period: "Вели́кий пост", scheme: MENAION_SCHEME.SATURDAY_MEMORIAL_UNIVERSAL },
  { offset: -28, kind: "sunday", name: "Неде́ля 3-я Вели́кого поста́, Крестопокло́нная", period: "Вели́кий пост", scheme: MENAION_SCHEME.LENTEN_SUNDAY_NO_MINEA, contentKey: "great-lent-sunday-3" },
  { offset: -22, kind: "saturday", name: "Суббо́та 4-й седми́цы — роди́тельская", period: "Вели́кий пост", scheme: MENAION_SCHEME.SATURDAY_MEMORIAL_UNIVERSAL },
  { offset: -21, kind: "sunday", name: "Неде́ля 4-я Вели́кого поста́, прп. Иоа́нна Ле́ствичника", period: "Вели́кий пост", scheme: MENAION_SCHEME.LENTEN_SUNDAY_NO_MINEA, contentKey: "great-lent-sunday-4" },
  { offset: -18, kind: "weekday", name: "Мари́ино стоя́ние (кано́н прп. Андре́я Кри́тского целико́м)", period: "Вели́кий пост", scheme: MENAION_SCHEME.LENTEN_WEEKDAY_COMMEMORATION_ONLY },
  { offset: -15, kind: "saturday", name: "Суббо́та Ака́фиста. Похвала́ Пресвято́й Богоро́дицы", period: "Вели́кий пост", scheme: MENAION_SCHEME.LENTEN_SATURDAY_REDUCED },
  { offset: -14, kind: "sunday", name: "Неде́ля 5-я Вели́кого поста́, прп. Мари́и Еги́петской", period: "Вели́кий пост", scheme: MENAION_SCHEME.LENTEN_SUNDAY_NO_MINEA, contentKey: "great-lent-sunday-5" },
  { offset: -8, kind: "saturday", name: "Ла́зарева суббо́та", period: "Вели́кий пост", scheme: MENAION_SCHEME.EXCLUDED_OWN_PROPER, services: { vespers: "vespers-lazarus-saturday", matins: "matins-lazarus-saturday", liturgy: "liturgy-lazarus-saturday" }, fasting: "Разреше́ние на ры́бу" },
  { offset: -7, kind: "sunday", name: "Неде́ля ва́ий (Вход Госпо́день в Иерусали́м)", period: "Вели́кий пост", scheme: MENAION_SCHEME.EXCLUDED_OWN_PROPER, services: { vespers: "vespers-palm-sunday", matins: "matins-palm-sunday", liturgy: "liturgy-palm-sunday" }, fasting: "Разреше́ние на ры́бу" },
  { offset: -6, kind: "weekday", name: "Вели́кий Понеде́льник", period: "Стра́стная седми́ца", scheme: MENAION_SCHEME.EXCLUDED_OWN_PROPER, services: { vespers: "vespers-great-monday", matins: "matins-great-monday" }, fasting: "Стро́гий пост" },
  { offset: -5, kind: "weekday", name: "Вели́кий Вто́рник", period: "Стра́стная седми́ца", scheme: MENAION_SCHEME.EXCLUDED_OWN_PROPER },
  { offset: -4, kind: "weekday", name: "Вели́кая Среда́", period: "Стра́стная седми́ца", scheme: MENAION_SCHEME.EXCLUDED_OWN_PROPER },
  { offset: -3, kind: "weekday", name: "Вели́кий Четве́рг", period: "Стра́стная седми́ца", scheme: MENAION_SCHEME.EXCLUDED_OWN_PROPER },
  { offset: -2, kind: "weekday", name: "Вели́кая Пя́тница", period: "Стра́стная седми́ца", scheme: MENAION_SCHEME.EXCLUDED_OWN_PROPER },
  { offset: -1, kind: "saturday", name: "Вели́кая Суббо́та", period: "Стра́стная седми́ца", scheme: MENAION_SCHEME.EXCLUDED_OWN_PROPER },
  { offset: 0, kind: "sunday", name: "Свята́я Па́сха. Све́тлое Христо́во Воскресе́ние", period: "Па́сха", scheme: MENAION_SCHEME.EXCLUDED_OWN_PROPER, specialService: "pascha" },
  { offset: 1, kind: "weekday", name: "Све́тлый понеде́льник", period: "Све́тлая седми́ца", scheme: MENAION_SCHEME.EXCLUDED_OWN_PROPER },
  { offset: 2, kind: "weekday", name: "Све́тлый вто́рник", period: "Све́тлая седми́ца", scheme: MENAION_SCHEME.EXCLUDED_OWN_PROPER },
  { offset: 3, kind: "weekday", name: "Све́тлая среда́", period: "Све́тлая седми́ца", scheme: MENAION_SCHEME.EXCLUDED_OWN_PROPER },
  { offset: 4, kind: "weekday", name: "Све́тлый четве́рг", period: "Све́тлая седми́ца", scheme: MENAION_SCHEME.EXCLUDED_OWN_PROPER },
  { offset: 5, kind: "weekday", name: "Све́тлая пя́тница", period: "Све́тлая седми́ца", scheme: MENAION_SCHEME.EXCLUDED_OWN_PROPER },
  { offset: 6, kind: "saturday", name: "Све́тлая суббо́та", period: "Све́тлая седми́ца", scheme: MENAION_SCHEME.EXCLUDED_OWN_PROPER },
  { offset: 7, kind: "sunday", name: "Неде́ля 2-я по Па́сце, апо́стола Фомы́. Антипа́сха", period: "Пентикоста́рий", scheme: MENAION_SCHEME.ORDINARY_COMBINATION, specialService: "antipascha" },
  { offset: 14, kind: "sunday", name: "Неде́ля 3-я по Па́сце, святы́х жён-мироно́сиц", period: "Пентикоста́рий", scheme: MENAION_SCHEME.ORDINARY_COMBINATION },
  { offset: 21, kind: "sunday", name: "Неде́ля 4-я по Па́сце, о разсла́бленном", period: "Пентикоста́рий", scheme: MENAION_SCHEME.ORDINARY_COMBINATION },
  { offset: 25, kind: "weekday", name: "Преполове́ние Пятидеся́тницы", period: "Пентикоста́рий", scheme: MENAION_SCHEME.ORDINARY_COMBINATION },
  { offset: 28, kind: "sunday", name: "Неде́ля 5-я по Па́сце, о самаряны́не", period: "Пентикоста́рий", scheme: MENAION_SCHEME.ORDINARY_COMBINATION },
  { offset: 35, kind: "sunday", name: "Неде́ля 6-я по Па́сце, о слепо́м", period: "Пентикоста́рий", scheme: MENAION_SCHEME.ORDINARY_COMBINATION },
  { offset: 38, kind: "weekday", name: "Отда́ние Па́схи", period: "Пентикоста́рий", scheme: MENAION_SCHEME.EXCLUDED_OWN_PROPER },
  { offset: 39, kind: "weekday", name: "Вознесе́ние Госпо́дне", period: "Пентикоста́рий", scheme: MENAION_SCHEME.EXCLUDED_OWN_PROPER },
  { offset: 42, kind: "sunday", name: "Неде́ля 7-я по Па́сце, святы́х отце́в I Вселе́нскаго Собо́ра", period: "Пентикоста́рий", scheme: MENAION_SCHEME.ORDINARY_COMBINATION },
  { offset: 48, kind: "saturday", name: "Тро́ицкая роди́тельская суббо́та", period: "Пентикоста́рий", scheme: MENAION_SCHEME.SATURDAY_MEMORIAL_UNIVERSAL },
  { offset: 49, kind: "sunday", name: "Святая Пятидеся́тница. День Святы́я Тро́ицы", period: "Пятидеся́тница", scheme: MENAION_SCHEME.EXCLUDED_OWN_PROPER, specialService: "pentecost" },
  { offset: 50, kind: "weekday", name: "День Свята́го Ду́ха", period: "Пятидеся́тница", scheme: MENAION_SCHEME.EXCLUDED_OWN_PROPER },
  { offset: 56, kind: "sunday", name: "Неде́ля 1-я по Пятидеся́тнице, всех святы́х", period: "По Пятидеся́тнице", scheme: MENAION_SCHEME.ORDINARY_COMBINATION },
  { offset: 63, kind: "sunday", name: "Неде́ля 2-я по Пятидеся́тнице, всех святы́х, в земле́ Росси́йской просия́вших", period: "По Пятидеся́тнице", scheme: MENAION_SCHEME.ORDINARY_COMBINATION },
];

const NAMED_DAYS_BY_OFFSET = new Map(NAMED_DAYS.map((d) => [d.offset, d]));

// Седмицы без поста в среду/пятницу (только пища; аллитургийность среды и
// пятницы Постной Триоди сюда не относится — это отдельное правило).
const SPLOSHNAYA_RANGES = [
  [-69, -64], // седмица мытаря и фарисея
  [-55, -50], // седмица сырная (Масленица)
  [50, 55], // седмица по Пятидесятнице (до Отдания в субботу)
];

function isSploshnaya(offset) {
  return SPLOSHNAYA_RANGES.some(([from, to]) => offset >= from && offset <= to);
}

// Ближайшая предыдущая (или сама) именованная неделя/суббота — нужна, чтобы
// классифицировать будний день, у которого нет собственной записи в
// NAMED_DAYS (обычный будний день поста внутри седмицы).
function enclosingWeek(offset) {
  let best = null;
  for (const d of NAMED_DAYS) {
    if (d.kind !== "sunday") continue;
    if (d.offset <= offset && (best == null || d.offset > best.offset)) best = d;
  }
  return best;
}

const LOWER_BOUND = -70; // Неделя о мытаре и фарисее
const UPPER_BOUND = 63; // Неделя всех русских святых

/**
 * Описывает день триодного цикла по смещению от Пасхи. Возвращает null,
 * если дата вне цикла Постной/Цветной Триоди — тогда действует обычный
 * устав рядового времени (typikon.js), Триодь тут ни при чём.
 */
export function describeTriodionDay(date) {
  const offset = paschaOffset(date);
  if (offset < LOWER_BOUND || offset > UPPER_BOUND) return null;

  const named = NAMED_DAYS_BY_OFFSET.get(offset);
  if (named) {
    return { offset, ...named, sploshnaya: isSploshnaya(offset) };
  }

  // Будний день/суббота без собственной записи — доопределяем схему по
  // объемлющей неделе.
  const week = enclosingWeek(offset);
  const dow = date.getDay(); // 0 = вс
  const kind = dow === 6 ? "saturday" : "weekday";

  let scheme;
  if (week && week.offset >= -42 && week.offset <= -14) {
    // Будни/субботы внутри великопостных седмиц (после Недели 1-й, до
    // Недели ваий) без отдельной записи — обычные постные будни.
    scheme = kind === "saturday"
      ? MENAION_SCHEME.LENTEN_SATURDAY_REDUCED
      : MENAION_SCHEME.LENTEN_WEEKDAY_COMMEMORATION_ONLY;
  } else if (offset >= -48 && offset <= -43) {
    // Седмица 1-я Великого поста (Чистая) — то же самое, только до Недели 1-й.
    scheme = kind === "saturday"
      ? MENAION_SCHEME.LENTEN_SATURDAY_REDUCED
      : MENAION_SCHEME.LENTEN_WEEKDAY_COMMEMORATION_ONLY;
  } else {
    // Подготовительные недели или седмицы Цветной Триоди — рядовое
    // соединение, Триодь ничего не отменяет.
    scheme = MENAION_SCHEME.ORDINARY_COMBINATION;
  }

  const period = week ? week.period : (offset < -48 ? "Постная Триодь" : "Пентикоста́рий");

  return {
    offset,
    kind,
    name: null,
    period,
    scheme,
    sploshnaya: isSploshnaya(offset),
    parentWeek: week ? week.name : null,
  };
}

// ===== Марковы главы =====
// Таблица совпадений неподвижного числа Минеи (ключ "MM-DD") с переходящим
// днём Триоди. Пуста намеренно: это отдельный, очень подробный раздел
// Типикона (в первую очередь — судьба Благовещения 25 марта/7 апреля при
// каждом из ~35 возможных положений Пасхи), который нельзя реконструировать
// по памяти без риска литургической ошибки. Наполняется по мере переноса
// текста этого раздела Типикона в проект; до тех пор для затронутых чисел
// planDayService должен возвращать честный отказ, а не догадку.
export const MARK_CHAPTERS = {};

// ===== Общая заглушка для уже частично готового содержимого =====
// Единственный кусок Триоди, для которого в проекте есть хоть какое-то
// содержимое (см. data/days/2026-04-19..2026-06-14.json) — это минимальный
// вариант литургии "с переменными" для восьми воскресений Цветной Триоди
// плюс Пасхи и Пятидесятницы. Здесь эта же заготовка строится для ЛЮБОГО
// года — то же самое обобщение, которое planDayService уже делает для
// рядового времени в typikon.js.
const PENTECOSTARION_SUNDAY_OFFSETS = new Set([0, 7, 14, 21, 28, 35, 42, 49, 56, 63]);

// ===== Недели Великого поста с уже готовыми шаблонами =====
// В отличие от заглушки planPentecostarionSunday (только литургия), для
// недель, перечисленных здесь через contentKey в NAMED_DAYS, есть полный
// комплект вечерня/утреня/литургия (см. data/templates/*-lenten-sunday.json)
// и данные в data/triod/{contentKey}.json — их наличие проверяется по
// самому полю contentKey, без обращения к файловой системе (это делает
// вызывающий код, как и с data/minea для рядового устава).
const LENTEN_SUNDAY_SERVICE_SET = {
  vespers: "vespers-lenten-sunday",
  matins: "matins-lenten-sunday",
  liturgy: "liturgy-lenten-sunday",
};

export function planLentenSundayService(date) {
  const offset = paschaOffset(date);
  const named = NAMED_DAYS_BY_OFFSET.get(offset);
  if (!named || !named.contentKey) return null;

  const glas = computeGlas(date);

  return {
    dateLabel: formatDateLabel(date),
    feastName: named.name,
    period: named.period,
    tone: glas,
    fasting: "Стро́гий пост",
    services: { ...LENTEN_SUNDAY_SERVICE_SET },
    variables: {
      glas,
      sources: { oktoih: `oktoih-variables-glas${glas}`, triod: named.contentKey },
    },
  };
}

// ===== Дни с полностью самостоятельным (не соединяемым) последованием =====
// Лазарева суббота и Неделя ваий — по схеме EXCLUDED_OWN_PROPER Октоих и
// Минея не поются вовсе, поэтому, в отличие от planLentenSundayService, эти
// шаблоны (см. data/templates/*-lazarus-saturday.json и *-palm-sunday.json)
// не содержат переменных ({{namespace.key}}) — весь текст фиксирован
// (supports_variables: false), как и в шаблонах неподвижных двунадесятых
// праздников (Воздвижение, Успение). "services" для таких дней задаётся
// прямо в NAMED_DAYS, а не через отдельное поле contentKey.
export function planFixedProperService(date) {
  const offset = paschaOffset(date);
  const named = NAMED_DAYS_BY_OFFSET.get(offset);
  if (!named || !named.services) return null;

  return {
    dateLabel: formatDateLabel(date),
    feastName: named.name,
    period: named.period,
    tone: null,
    fasting: named.fasting || "Стро́гий пост",
    services: { ...named.services },
    variables: {},
  };
}

export function planPentecostarionSunday(date) {
  const offset = paschaOffset(date);
  const named = NAMED_DAYS_BY_OFFSET.get(offset);
  if (!named || !PENTECOSTARION_SUNDAY_OFFSETS.has(offset)) return null;

  // В день самой Пасхи глас Октоиха ещё не действует (Светлая седмица,
  // computeGlas вернёт null), но эксапостиларий "Плотию уснув" по традиции
  // печатается с пометкой "глас 1-й" — это фиксированное указание, не
  // результат гласового цикла, и она не отменяется на Пасху отдельно.
  const glas = offset === 0 ? 1 : computeGlas(date);
  const isOwnProper = named.scheme === MENAION_SCHEME.EXCLUDED_OWN_PROPER;

  // От Пасхи до Недели всех святых включительно (offset 56) — полное
  // разрешение поста на всю седмицу без исключений (Пасхальный устав,
  // действует и в среды/пятницы). Со следующего воскресенья (offset 63,
  // уже внутри Петрова поста) — обычная воскресная заметка о посте.
  const fasting = offset <= 56 ? "Разреше́ние на вся" : "Поста́ нет";

  return {
    dateLabel: formatDateLabel(date),
    feastName: named.name,
    period: named.period,
    tone: isOwnProper ? null : glas,
    fasting,
    services: { liturgy: "liturgy-sunday-with-variables" },
    variables: {
      glas,
      oktoih_source: `oktoih-variables-glas${glas}`,
      ...(named.specialService ? { special_service: named.specialService } : {}),
    },
  };
}
