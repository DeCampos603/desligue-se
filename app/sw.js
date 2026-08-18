/**
 * DESLIGUE-SE — Service Worker para Suporte PWA Offline & Instalação
 */

const CACHE_NAME = 'desliguese-cache-v2.4.5';
const ASSETS_TO_CACHE = [
  './',
  './index.html?v=2.4.5',
  './styles.css?v=2.4.5',
  './config.js?v=2.4.5',
  './app.js?v=2.4.5',
  './manifest.json',
  './favicon.svg'
];

// Instalação: Cache dos arquivos estáticos essenciais
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Ativação: Limpeza de caches antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: rede primeiro, cache como rede de segurança para uso offline
self.addEventListener('fetch', (event) => {
  const requisicao = event.request;

  // 1. Só GET pode ser guardado. O Cache Storage recusa POST/PUT/DELETE, e
  //    tentar guardar disparava "Request method 'POST' is unsupported" no
  //    console a cada envio de formulário.
  if (requisicao.method !== 'GET') return;

  // 2. Chamadas de API nunca são cacheadas: elas dependem de sessão e de
  //    dados do momento. Recursos de outras origens também ficam de fora.
  const url = new URL(requisicao.url);
  if (url.pathname.startsWith('/api/') || url.origin !== self.location.origin) return;

  // 3. Endereços de retorno do pagamento carregam parâmetros de uso único.
  //    Guardar um deles faria a próxima visita reviver uma sessão vencida.
  const temParametros = url.search.length > 0 && !url.search.startsWith('?v=');

  event.respondWith(
    fetch(requisicao)
      .then((respostaDaRede) => {
        const podeGuardar =
          respostaDaRede &&
          respostaDaRede.status === 200 &&
          respostaDaRede.type === 'basic' &&   // ignora respostas opacas
          !temParametros;

        if (podeGuardar) {
          const copia = respostaDaRede.clone();
          caches.open(CACHE_NAME)
            .then((cache) => cache.put(requisicao, copia))
            .catch(() => { /* cota cheia ou modo privado: seguir sem cache */ });
        }
        return respostaDaRede;
      })
      .catch(() => {
        // Offline: devolve o que houver guardado
        return caches.match(requisicao).then((guardada) => {
          if (guardada) return guardada;
          if (requisicao.mode === 'navigate') return caches.match('./index.html');
          return Response.error();
        });
      })
  );
});

// Permite que a página peça a ativação imediata de uma versão nova
self.addEventListener('message', (event) => {
  if (event.data === 'ativar-agora') self.skipWaiting();
});
