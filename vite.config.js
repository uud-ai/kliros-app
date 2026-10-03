import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/kliros/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Клирос — богослужебный помощник',
        short_name: 'Клирос',
        description: 'Клиросная читалка для чтецов. Работает офлайн в храме.',
        lang: 'ru',
        theme_color: '#9c1c1c',
        background_color: '#f5efe1',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/kliros/',
        scope: '/kliros/',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // /data/** (Минея, Библия, шаблоны) не прекэшируем при установке —
        // корпус уже ~21МБ и растёт с каждым заполненным днём. Приложение
        // само лениво подгружает только нужные для текущего дня файлы
        // (см. getDocData в App.jsx), поэтому данные кэшируются runtime-
        // стратегией ниже — по факту обращения, а не все разом при install.
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        globIgnores: ['**/data/**'],
        runtimeCaching: [
          {
            // Литерал, не `base` — generateSW сериализует эту функцию в sw.js
            // как текст без замыкания на модуль, внешняя переменная внутри
            // была бы ReferenceError в самом service worker'е.
            urlPattern: ({ url }) => url.pathname.startsWith('/kliros/data/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'kliros-data',
              expiration: {
                maxEntries: 2000,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: { statuses: [0, 200] },
              plugins: [
                {
                  // SPA-fallback на хостинге отдаёт 200 text/html
                  // для несуществующих /data/*.json — без этой проверки
                  // CacheFirst закэшировал бы её как валидный JSON.
                  cacheWillUpdate: async ({ response }) => {
                    const type = response.headers.get('content-type') || ''
                    return type.includes('json') ? response : null
                  },
                },
              ],
            },
          },
          {
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'CacheFirst',
            options: {
              cacheName: 'kliros-images',
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-stylesheets',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
})