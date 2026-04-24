import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['client/src/**/*.{test,spec}.{js,jsx}'],
    passWithNoTests: true,
    setupFiles: ['./client/src/setupTests.js'],
    pool: 'forks',
    sequence: {
      shuffle: true,
    },
    reporters: ['verbose', 'json'],
    outputFile: {
      json: 'test-results.json',
    },
  },
  coverage: {
    provider: 'v8',
    thresholds: {
      lines: 80,
      branches: 70,
      functions: 55,
      statements: 80,
    },
  },
});
