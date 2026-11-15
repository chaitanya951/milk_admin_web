// ESLint root config for the DairyDirect monorepo.
// Enforces the app import boundary: admin-web and store-web NEVER import from
// each other — both may only import from @dairydirect/shared (packages/shared).
// Violations are errors, so `npm run build` (which runs lint first) fails on them.
module.exports = {
  root: true,
  env: { browser: true, es2022: true },
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  plugins: ['@typescript-eslint', 'react-hooks'],
  extends: ['eslint:recommended'],
  ignorePatterns: ['dist', 'dev-dist', 'node_modules', '*.cjs', 'stats.html'],
  rules: {
    'no-restricted-imports': 'off',
    'no-unused-vars': 'off',
  },
  overrides: [
    {
      files: ['**/*.{ts,tsx}'],
      rules: { 'no-undef': 'off' }, // TypeScript owns undefined-symbol checks
    },
    {
      // admin-web must never import from store-web (by alias, path or traversal).
      files: ['apps/admin-web/**/*.{ts,tsx}'],
      rules: {
        'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
        'no-restricted-imports': ['error', {
          patterns: [
            {
              group: ['@dairydirect/store-web', '@dairydirect/store-web/*', '**/apps/store-web/**', '**/store-web/src/**'],
              message: 'admin-web must not import from store-web. Use @dairydirect/shared.',
            },
            {
              group: ['**/../store-web/**', '**/../../store-web/**'],
              message: 'admin-web must not import from store-web. Use @dairydirect/shared.',
            },
          ],
        }],
      },
    },
    {
      // store-web must never import from admin-web.
      files: ['apps/store-web/**/*.{ts,tsx}'],
      rules: {
        'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
        'no-restricted-imports': ['error', {
          patterns: [
            {
              group: ['@dairydirect/admin-web', '@dairydirect/admin-web/*', '**/apps/admin-web/**', '**/admin-web/src/**'],
              message: 'store-web must not import from admin-web. Use @dairydirect/shared.',
            },
            {
              group: ['**/../admin-web/**', '**/../../admin-web/**'],
              message: 'store-web must not import from admin-web. Use @dairydirect/shared.',
            },
          ],
        }],
      },
    },
    {
      // packages/shared stays portal-agnostic: no imports from either app.
      files: ['packages/shared/**/*.{ts,tsx}'],
      rules: {
        'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
        'no-restricted-imports': ['error', {
          patterns: [
            {
              group: ['@dairydirect/admin-web*', '@dairydirect/store-web*', '**/apps/admin-web/**', '**/apps/store-web/**'],
              message: 'Shared code must stay portal-agnostic — apps import from shared, never the reverse.',
            },
          ],
        }],
      },
    },
  ],
}
