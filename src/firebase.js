// src/firebase.js — единственная точка подключения к Firestore

import { initializeApp } from "firebase/app";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";

// Конфиг Firebase-проекта klirosapp.
// apiKey не является секретом: он всё равно попадает в бандл фронтенда.
// Настоящая защита — правила Firestore (allow write: if false).
const firebaseConfig = {
  apiKey: "AIzaSyBd2aibeorkyQXsNh-h2Q605hP_O_nBtsw",
  authDomain: "klirosapp.firebaseapp.com",
  projectId: "klirosapp",
  storageBucket: "klirosapp.firebasestorage.app",
  messagingSenderId: "827038829039",
  appId: "1:827038829039:web:c40d810eed53f9849c4e1a",
};

// Инициализация приложения
const app = initializeApp(firebaseConfig);

// Инициализация Firestore с офлайн-кешем.
// - persistentLocalCache: данные, которые уже загружались, хранятся в IndexedDB
//   браузера, и приложение работает без интернета.
// - persistentMultipleTabManager: корректная работа, если открыто несколько
//   вкладок одновременно.
// Это современный API (Firebase SDK v10+), заменяет deprecated
// enableMultiTabIndexedDbPersistence.
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});

export { db };