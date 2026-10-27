// ESLint flat config. Run with `npm run lint`.
const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**'] },
  js.configs.recommended,
  {
    // Electron main process, preload and tool configs: CommonJS on Node.
    files: ['src/main/**/*.js', '*.config.js'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
  },
  {
    // Renderer: ES modules in the browser, talking to the system via window.api.
    files: ['src/renderer/**/*.js'],
    languageOptions: { sourceType: 'module', globals: { ...globals.browser } },
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: { sourceType: 'module', globals: { ...globals.node } },
  },
  {
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      'prefer-const': 'error',
      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
    },
  },
];
