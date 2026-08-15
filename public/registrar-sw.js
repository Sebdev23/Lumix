// Registro del service worker.
//
// Vive en un archivo y no dentro del index.html para poder sacar 'unsafe-inline' de la
// politica de seguridad (CSP). Era la unica grieta real de esa configuracion: con
// unsafe-inline, un XSS puede ejecutar codigo inyectado en el HTML.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js')
}
