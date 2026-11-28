import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as esbuild from 'esbuild';

const rootDir = process.cwd();
const outPublicDir = path.join(rootDir, 'public');

const ICON_SVG = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">',
  '<rect width="512" height="512" fill="#FFFFFF"/>',
  '<rect x="30" y="30" width="452" height="452" fill="none" stroke="#111111" stroke-width="18"/>',
  '<circle cx="256" cy="188" r="88" fill="#FFFFFF" stroke="#111111" stroke-width="22"/>',
  '<path d="M168 148 Q256 130 344 148" fill="none" stroke="#FF0000" stroke-width="24" stroke-linecap="round"/>',
  '<circle cx="226" cy="186" r="11" fill="#111111"/>',
  '<circle cx="286" cy="186" r="11" fill="#111111"/>',
  '<path d="M222 224 Q256 244 290 224" fill="none" stroke="#111111" stroke-width="14" stroke-linecap="round"/>',
  '<line x1="256" y1="276" x2="256" y2="328" stroke="#111111" stroke-width="20" stroke-linecap="round"/>',
  '<circle cx="176" cy="304" r="22" fill="#FF0000" stroke="#111111" stroke-width="14"/>',
  '<circle cx="336" cy="304" r="22" fill="#FF0000" stroke="#111111" stroke-width="14"/>',
  '<text x="256" y="428" text-anchor="middle" fill="#111111" font-family="Arial,sans-serif" font-size="82" font-weight="900" letter-spacing="6">AFF</text>',
  '</svg>',
].join('');

const ICON_DATA_URI = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(ICON_SVG)}`;

const manifestJson = JSON.stringify(
  {
    id: '/',
    name: 'Adnan Family Fighter',
    short_name: 'AdnanFighter',
    description:
      'Game pertarungan 2.5D Three.js bergaya 3D Ugly Doodle & Sketsa Tangan dengan aksen merah, 4 karakter keluarga, senjata rahasia unik, dan mode Online 1v1.',
    start_url: '/',
    scope: '/',
    display: 'fullscreen',
    orientation: 'landscape',
    background_color: '#FFFFFF',
    theme_color: '#111111',
    icons: [
      {
        src: ICON_DATA_URI,
        sizes: '192x192',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: ICON_DATA_URI,
        sizes: '512x512',
        type: 'image/svg+xml',
        purpose: 'any',
      },
    ],
  },
  null,
  2
);

const result = await esbuild.build({
  entryPoints: [path.join(rootDir, 'src/game/standalone.ts')],
  bundle: true,
  minify: true,
  write: false,
  format: 'iife',
  target: ['es2020'],
});

const jsBundle = result.outputFiles[0].text
  .replace(/<\/script>/gi, '<\\/script>')
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '');
const bundleHash = crypto.createHash('sha1').update(jsBundle).digest('hex').slice(0, 10);

const serviceWorkerJs = `const CACHE_NAME = 'adnan-family-fighter-pwa-${bundleHash}';
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/assets/aistudio/Ayah_Adnan_fabd0a5b.png',
  '/assets/aistudio/Ibu_TIka_4d5a6b7c.png',
  '/assets/aistudio/Kak_Dhira_4ca87974.png',
  '/assets/aistudio/Dik_Iyen_5d7e9c6f.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/_vercel/') || url.pathname.startsWith('/api/')) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() =>
        caches.match(event.request).then((cached) => {
          if (cached) return cached;
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
          return new Response('', { status: 504, statusText: 'Offline' });
        })
      )
  );
});
`;

function buildHtml({ includePwaAndOnline }) {
  const pwaHead = includePwaAndOnline
    ? `  <link rel="manifest" href="/manifest.json" />
  <meta name="theme-color" content="#FFFFFF" />
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="default" />
  <meta name="apple-mobile-web-app-title" content="AdnanFighter" />
  <link rel="icon" type="image/svg+xml" href="${ICON_DATA_URI}" />
  <link rel="apple-touch-icon" href="${ICON_DATA_URI}" />
  <script>window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__sfDeferredPrompt=e;});</script>\n`
    : `  <link rel="icon" type="image/svg+xml" href="${ICON_DATA_URI}" />\n`;

  const swScript = includePwaAndOnline
    ? `\n  <script>
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      window.addEventListener('load', function () {
        var hadController = !!navigator.serviceWorker.controller;
        var reloaded = false;
        navigator.serviceWorker.addEventListener('controllerchange', function () {
          if (hadController && !reloaded) {
            reloaded = true;
            window.location.reload();
          }
        });
        navigator.serviceWorker
          .register('/sw.js', { updateViaCache: 'none' })
          .then(function (reg) {
            reg.update().catch(function () {});
          })
          .catch(function () {});
      });
    }
  </script>`
    : '';

  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
  <meta name="screen-orientation" content="landscape" />
  <title>Adnan Family Fighter</title>
  <meta name="description" content="Game pertarungan 2.5D Three.js bergaya 3D Ugly Doodle & Sketsa Tangan dengan aksen merah, 4 karakter keluarga, senjata rahasia unik, dan mode Online 1v1 WebRTC." />
  <meta property="og:title" content="Adnan Family Fighter" />
  <meta property="og:description" content="Game pertarungan 2.5D Three.js bergaya 3D Ugly Doodle & Sketsa Tangan dengan aksen merah, 4 karakter keluarga, senjata rahasia unik, dan mode Online 1v1 WebRTC." />
  <meta property="og:type" content="website" />
  <meta name="twitter:card" content="summary_large_image" />
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=Silkscreen:wght@400;700&family=Space+Mono:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet">
${pwaHead}</head>
<body>
  <div id="app"></div>
  <script>${jsBundle}</script>${swScript}
</body>
</html>
`;
}

const indexHtml = buildHtml({ includePwaAndOnline: true });
const offlineHtml = buildHtml({ includePwaAndOnline: false });

fs.mkdirSync(outPublicDir, { recursive: true });
fs.writeFileSync(path.join(rootDir, 'index.html'), indexHtml, 'utf8');
fs.writeFileSync(path.join(outPublicDir, 'manifest.json'), manifestJson, 'utf8');
fs.writeFileSync(path.join(outPublicDir, 'sw.js'), serviceWorkerJs, 'utf8');
fs.writeFileSync(path.join(outPublicDir, 'adnan-family-fighter.html'), offlineHtml, 'utf8');

console.log(
  `Built PWA root index.html (${Buffer.byteLength(indexHtml, 'utf8')} bytes) + public/{manifest.json,sw.js,adnan-family-fighter.html}`
);
