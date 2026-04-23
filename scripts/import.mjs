// scripts/import.mjs — импорт данных из data/ в Firestore
// Запуск: node scripts/import.mjs

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, readdirSync } from 'fs';
import { join, basename } from 'path';

// --- Инициализация Firebase Admin SDK ---
const serviceAccount = JSON.parse(
  readFileSync('./service-account.json', 'utf8')
);

initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore();

// --- Загрузка всех JSON-файлов из указанной папки в указанную коллекцию ---
async function importFolder(folderPath, collectionName) {
  console.log(`\n📂 Обрабатываю папку: ${folderPath}`);
  
  let files;
  try {
    files = readdirSync(folderPath).filter(f => f.endsWith('.json'));
  } catch (e) {
    console.log(`   (папка пуста или не существует, пропускаю)`);
    return 0;
  }

  if (files.length === 0) {
    console.log(`   (нет JSON-файлов, пропускаю)`);
    return 0;
  }

  let count = 0;

  for (const file of files) {
    const fullPath = join(folderPath, file);
    const docId = basename(file, '.json'); // "liturgy-sunday.json" → "liturgy-sunday"
    
    const raw = readFileSync(fullPath, 'utf8');
    const data = JSON.parse(raw);

    try {
      await db.collection(collectionName).doc(docId).set(data);
      console.log(`   ✓ ${collectionName}/${docId}`);
      count++;
    } catch (e) {
      console.error(`   ✗ ${collectionName}/${docId}: ${e.message}`);
    }
  }

  return count;
}

// --- Главный процесс ---
async function main() {
  console.log('🚀 Начинаю импорт в Firestore...');
  console.log(`   Проект: ${serviceAccount.project_id}`);

  const templatesCount = await importFolder('./data/templates', 'templates');
  const daysCount = await importFolder('./data/days', 'days');

  console.log('');
  console.log('═══════════════════════════════════════');
  console.log(`✅ Готово! Загружено:`);
  console.log(`   • templates: ${templatesCount}`);
  console.log(`   • days:      ${daysCount}`);
  console.log('═══════════════════════════════════════');

  process.exit(0);
}

main().catch((e) => {
  console.error('❌ Критическая ошибка:', e);
  process.exit(1);
});
