/* global self, fetch, URL, Response */

const OFFLINE_HTML = `<!doctype html>
<html lang="id">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>Sedang Offline — YNG Apparel</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        font-family: system-ui, -apple-system, sans-serif;
        background: #ffffff;
        color: #111111;
      }
      main {
        max-width: 420px;
        border: 1px solid #e5e5e5;
        border-radius: 16px;
        padding: 24px;
        background: #f5f5f5;
      }
      h1 {
        margin: 0 0 8px;
        font-size: 18px;
      }
      p {
        margin: 0;
        font-size: 14px;
        line-height: 1.5;
        color: #666666;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Koneksi internet terputus</h1>
      <p>Pastikan perangkat Anda terhubung ke internet lalu muat ulang halaman YNG Apparel.</p>
    </main>
  </body>
</html>`;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) {
    return;
  }

  event.respondWith(
    fetch(request).catch(() => {
      if (request.mode === 'navigate') {
        return new Response(OFFLINE_HTML, {
          status: 503,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      }
      return Response.error();
    })
  );
});
