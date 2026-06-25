import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// GitHub Pages serves this repo's site under the `/chat/` subpath. Asset paths
// must be base-path aware so the static build loads correctly when deployed.
export default defineConfig({
  base: '/chat/',
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
