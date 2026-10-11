import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The Tauri CLI sets TAURI_DEV_HOST when developing on a physical device; the
// dev server must then listen on that address (and HMR use it) so the device
// can reach it. Otherwise bind 0.0.0.0 so the browser build is reachable from
// other machines on the network too.
const host = process.env.TAURI_DEV_HOST

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Relative asset paths: the same build is served by Tauri's custom protocol
  // and by any static host under any subpath.
  base: './',
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    host: host || '0.0.0.0',
    allowedHosts: true,
    ...(host ? { hmr: { protocol: 'ws', host, port: 1421 } } : {}),
    watch: { ignored: ['**/src-tauri/**'] },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
  },
})
