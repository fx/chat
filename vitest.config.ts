import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    // Streaming/timing logic is tested with fake timers — no real-clock sleeps.
    fakeTimers: {
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
    },
    include: ['packages/**/*.test.{ts,tsx}', 'scripts/**/*.test.mjs', 'demos/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary'],
      include: ['packages/core/src/**', 'packages/chat/src/**', 'scripts/**/*.mjs'],
      // Only meaningful source contributes to the threshold; CSS has no
      // executable lines and test files are not production source.
      exclude: [
        'packages/chat/src/**/*.css',
        'packages/*/src/**/*.test.{ts,tsx}',
        'packages/chat/src/exports.snapshot.json',
        'scripts/**/*.test.mjs',
      ],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
})
