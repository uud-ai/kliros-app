// Одноразовый генератор вариантов шаблонов Часов (hours-N-ferial / -sunday-with-saint / -sunday-featured)
// на основе базовых hours-N.json (случай "Неделя без святого").
// Правило (Типикон/Часослов, «Устав о тропарях и кондаках на часех»):
//  - один святой (будний день, любой ранг от «без знака» до бденного, без храма) —
//    один тропарь святого на «Слава», один кондак святого;
//  - Неделя + рядовой (шестеричный/без знака) святой — два тропаря
//    (воскресный, «Слава:» — святого), кондак воскресный без чередования;
//  - Неделя + славословный/полиелейный/бденный святой — те же два тропаря,
//    но кондак чередуется по часам: час 1 и 6 — святого, час 3 и 9 — воскресный.
import fs from "node:fs";
import path from "node:path";

const dir = path.join(process.cwd(), "data", "templates");
const hours = [1, 3, 6, 9];

for (const n of hours) {
  const basePath = path.join(dir, `hours-${n}.json`);
  const base = JSON.parse(fs.readFileSync(basePath, "utf8"));

  const findIdx = (items, section) => items.findIndex((it) => it.section === section);

  // ---------- ferial ----------
  {
    const d = JSON.parse(JSON.stringify(base));
    d._meta.id = `hours-${n}-ferial`;
    d._meta.description = d._meta.description.replace(
      / — читается/,
      ` (бу́дничный вариант, тропа́рь и конда́к свято́го дня по Мине́е) — читается`
    );

    const tIdx = findIdx(d.items, "Тропарь дня");
    d.items[tIdx] = {
      section: "Тропарь дня",
      role: "Чтец",
      text: "{{minea.tropar}}",
      variable_type: "minea",
      variable_key: "tropar",
      fallback: "Тропа́рь свято́му дня (текст бу́дет добавлен).",
    };

    const kIdx = findIdx(d.items, "Кондак дня");
    d.items[kIdx] = {
      section: "Кондак дня",
      role: "Чтец",
      text: "{{minea.kondak}}",
      variable_type: "minea",
      variable_key: "kondak",
      fallback: "Конда́к свято́му дня (текст бу́дет добавлен).",
    };

    fs.writeFileSync(
      path.join(dir, `hours-${n}-ferial.json`),
      JSON.stringify(d, null, 2) + "\n"
    );
  }

  // ---------- sunday-with-saint (рядовой святой) ----------
  {
    const d = JSON.parse(JSON.stringify(base));
    d._meta.id = `hours-${n}-sunday-with-saint`;
    d._meta.description = d._meta.description.replace(
      / — читается/,
      ` (воскресе́нье + рядово́й свято́й: два тропаря́, конда́к воскре́сный) — читается`
    );

    const tIdx = findIdx(d.items, "Тропарь дня");
    const resurrectionalTropar = d.items[tIdx];
    d.items.splice(
      tIdx,
      1,
      resurrectionalTropar,
      { section: "Тропарь дня", role: "Лик", text: "Сла́ва:" },
      {
        section: "Тропарь дня",
        role: "Чтец",
        text: "{{minea.tropar}}",
        variable_type: "minea",
        variable_key: "tropar",
        fallback: "Тропа́рь свято́му дня (текст бу́дет добавлен).",
      }
    );
    // Кондак дня остаётся воскресным без изменений (см. base).

    fs.writeFileSync(
      path.join(dir, `hours-${n}-sunday-with-saint.json`),
      JSON.stringify(d, null, 2) + "\n"
    );
  }

  // ---------- sunday-featured (славословный/полиелейный/бденный святой) ----------
  {
    const d = JSON.parse(JSON.stringify(base));
    d._meta.id = `hours-${n}-sunday-featured`;
    d._meta.description = d._meta.description.replace(
      / — читается/,
      ` (воскресе́нье + славосло́вный/полиеле́йный/бде́нный свято́й: два тропаря́, конда́к чередyется по часа́м) — читается`
    );

    const tIdx = findIdx(d.items, "Тропарь дня");
    const resurrectionalTropar = d.items[tIdx];
    d.items.splice(
      tIdx,
      1,
      resurrectionalTropar,
      { section: "Тропарь дня", role: "Лик", text: "Сла́ва:" },
      {
        section: "Тропарь дня",
        role: "Чтец",
        text: "{{minea.tropar}}",
        variable_type: "minea",
        variable_key: "tropar",
        fallback: "Тропа́рь свято́му дня (текст бу́дет добавлен).",
      }
    );

    const kIdx = findIdx(d.items, "Кондак дня");
    if (n === 1 || n === 6) {
      d.items[kIdx] = {
        section: "Кондак дня",
        role: "Чтец",
        text: "{{minea.kondak}}",
        variable_type: "minea",
        variable_key: "kondak",
        fallback: "Конда́к свято́му дня (текст бу́дет добавлен).",
      };
    }
    // на 3-м и 9-м часе кондак остаётся воскресным (см. base) — чередование.

    fs.writeFileSync(
      path.join(dir, `hours-${n}-sunday-featured.json`),
      JSON.stringify(d, null, 2) + "\n"
    );
  }
}

console.log("Готово: сгенерированы hours-N-ferial / -sunday-with-saint / -sunday-featured для N=1,3,6,9");
