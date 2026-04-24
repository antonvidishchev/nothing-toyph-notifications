import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';

export default defineConfig([
  globalIgnores(['dist/', 'node_modules/', 'coverage/']),

  // Client-side React/JSX files (browser environment)
  {
    files: ['client/**/*.{js,jsx}'],
    plugins: { js },
    extends: ['js/recommended'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      complexity: ['warn', { max: 20 }],
      'max-lines': ['warn', { max: 700 }],
    },
  },

  // Config files at project root (Node.js environment)
  {
    files: ['*.config.js'],
    plugins: { js },
    extends: ['js/recommended'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      complexity: ['warn', { max: 20 }],
      'max-lines': ['warn', { max: 700 }],
    },
  },

  // Test files — allow larger files (higher max-lines threshold)
  {
    files: ['**/__tests__/**/*.{js,jsx}', '**/*.test.{js,jsx}'],
    rules: {
      'max-lines': ['warn', { max: 2000 }],
    },
  },
]);
