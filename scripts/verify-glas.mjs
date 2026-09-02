// scripts/verify-glas.mjs — сверка computeGlas() с вручную выставленными
// гласами в существующих public/data/days/*.json.
// Запуск: node scripts/verify-glas.mjs

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { computeGlas, computePascha } from '../src/lib/paschalion.js';

const daysDir = './public/data/days';
const files = readdirSync(daysDir).filter((f) => f.endsWith('.json'));

console.log(`Пасха 2026: ${computePascha(2026).toISOString().slice(0, 10)} (ожидается 2026-04-12)\n`);

let ok = 0;
let fail = 0;
let skipped = 0;

for (const file of files) {
  const dateStr = file.replace('.json', '');
  const data = JSON.parse(readFileSync(join(daysDir, file), 'utf8'));

  const expected = data.tone ?? data.variables?.glas ?? null;
  if (expected == null) {
    console.log(`~ ${dateStr}: гласа в файле нет, пропуск`);
    skipped++;
    continue;
  }

  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const actual = computeGlas(date);

  if (actual === expected) {
    console.log(`✓ ${dateStr}: глас ${actual}`);
    ok++;
  } else {
    console.log(`✗ ${dateStr}: ожидался глас ${expected}, вычислен ${actual}`);
    fail++;
  }
}

console.log(`\nИтого: ${ok} совпало, ${fail} разошлось, ${skipped} пропущено (без гласа в файле)`);
process.exit(fail > 0 ? 1 : 0);
