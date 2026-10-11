import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/kitty.ts', 'src/kitty-jpeg.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  treeshake: true,
  outDir: 'dist',
  external: ['react', 'react/jsx-runtime', 'ink', 'jpeg-js', 'fast-png'],
})
