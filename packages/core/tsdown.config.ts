import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/react.ts', 'src/hooks.ts', 'src/json.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  treeshake: true,
  outDir: 'dist',
  external: ['react'],
})
