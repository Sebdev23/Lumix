const CACHE_NAME = 'lumix-v2'
const STATIC_ASSETS = ['/manifest.json', '/icon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)),
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
    ),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  if (url.pathname.startsWith('/assets/') || url.pathname.endsWith('.svg')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fetchPromise = fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
          }
          return response
        })
        return cached || fetchPromise
      }),
    )
    return
  }

  if (url.origin.includes('supabase.co') || url.origin.includes('api.openai.com')) {
    event.respondWith(fetch(request))
    return
  }

  // El documento (navegacion a "/", index.html) NUNCA se sirve cache-first: si quedara
  // cacheado apuntando a un build viejo, sus archivos con hash (ej. ChatPage-ABC123.js) ya no
  // existen despues del proximo deploy -Netlify reemplaza dist/ entero-, y el catch-all de
  // netlify.toml (/* -> /index.html) devuelve HTML donde el navegador esperaba JavaScript.
  // Red primero, y la cache solo como respaldo si no hay conexion.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
          return response
        })
        .catch(() => caches.match(request)),
    )
    return
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request)),
  )
})
