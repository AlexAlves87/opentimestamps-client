import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'], // ← LÍNEA NUEVA
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      lines: 90,
      branches: 80,
      functions: 90,
      statements: 90,
      exclude: [
        'node_modules/',
        'dist/',
        'tests/',
        'vitest.config.ts',
        'vitest.setup.ts',
      ],
    },
  },
})