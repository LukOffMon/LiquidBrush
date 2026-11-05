// ESLint: errores reales (variables sin definir, código inalcanzable…), sin reglas de estilo
import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    files: ['app.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'script', globals: { ...globals.browser } },
    rules: {
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
      'no-empty': ['error', { allowEmptyCatch: true }]
    }
  },
  {
    files: ['sw.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'script', globals: { ...globals.serviceworker } }
  },
  {
    // Worker de cuentas (Cloudflare Workers: módulos ES con APIs web)
    files: ['cuentas/src/**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.serviceworker } }
  },
  {
    files: ['tests/**/*.js', 'playwright.config.js'],
    // page.evaluate() corre en el navegador: también valen document, localStorage…
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.node, ...globals.browser } }
  }
];
