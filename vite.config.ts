// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";

// Conexão pública do backend (URL + chave publicável/anon). São valores
// públicos por definição — a chave privada (service role) NUNCA aparece aqui.
// Servem como fallback determinístico quando o ambiente de build (produção)
// não injeta as variáveis VITE_*, o que deixava o app publicado sem backend
// ("Supabase não configurado" no console e login falhando).
const SUPABASE_PROJECT_ID = "ttjzgszxrnmcsygtzfcu";
const SUPABASE_URL_FALLBACK = `https://${SUPABASE_PROJECT_ID}.supabase.co`;
const SUPABASE_PUBLISHABLE_FALLBACK =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR0anpnc3p4cm5tY3N5Z3R6ZmN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4NTkyMDMsImV4cCI6MjA5NDQzNTIwM30.cP_-LNb9jIfeXFjUSZSh7Lf7JWQm2o9D7oYRrDweBsw";

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || SUPABASE_URL_FALLBACK;
const supabaseKey =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  SUPABASE_PUBLISHABLE_FALLBACK;
const supabaseProjectId =
  process.env.VITE_SUPABASE_PROJECT_ID || process.env.SUPABASE_PROJECT_ID || SUPABASE_PROJECT_ID;

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(supabaseUrl),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(supabaseKey),
      "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(supabaseKey),
      "import.meta.env.VITE_SUPABASE_PROJECT_ID": JSON.stringify(supabaseProjectId),
    },
    plugins: [
      VitePWA({
        registerType: "autoUpdate",
        injectRegister: null,
        filename: "sw.js",
        devOptions: { enabled: false },
        manifest: false, // usamos public/manifest.webmanifest
        // Build do TanStack Start/Nitro publica em dist/client/.
        // Sem isto, o Workbox escaneia dist/ e gera URLs precache com
        // prefixo "client/assets/..." que não existem em produção.
        outDir: "dist/client",
        workbox: {
          // Escaneia o diretório PÚBLICO real, não dist/.
          globDirectory: "dist/client",
          globPatterns: ["**/*.{js,css,svg,png,ico,woff2}"],
          // Sem index.html (SSR). navegações usam NetworkFirst abaixo.
          navigateFallback: null,
          cleanupOutdatedCaches: true,
          // ATUALIZAÇÃO ATÔMICA: novo SW só assume após todos os assets baixados
          // (install completo) E após o usuário recarregar/fechar abas antigas.
          // Evita "white screen" quando o usuário fica offline durante update.
          clientsClaim: false,
          skipWaiting: false,

          // SSR pode emitir documentos > 2 MB.
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          runtimeCaching: [
            // 1) Navegações (HTML SSR): NetworkFirst.
            //    Cada rota visitada online fica cacheada e abre offline.
            {
              urlPattern: ({ request, sameOrigin }) =>
                sameOrigin && request.mode === "navigate",
              handler: "NetworkFirst",
              options: {
                cacheName: "pages",
                networkTimeoutSeconds: 4,
                expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
              },
            },
            // 2) Chunks/Assets hasheados: CacheFirst (precache cobre o set inicial).
            {
              urlPattern: ({ url, sameOrigin }) =>
                sameOrigin && /^\/assets\/.+\.(?:js|css|woff2|png|svg|ico)$/.test(url.pathname),
              handler: "CacheFirst",
              options: {
                cacheName: "static-assets",
                expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 30 },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/i,
              handler: "CacheFirst",
              options: {
                cacheName: "google-fonts",
                expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              },
            },
          ],
        },
      }),
    ],
  },
});
