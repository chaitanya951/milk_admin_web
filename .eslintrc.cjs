// ESLint: enforces the portal import boundary — admin and store apps never
// import from each other. (Config kept .cjs for simplicity.)
module.exports = {
  root: true,
  env: { browser: true, es2022: true },
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  plugins: ['@typescript-eslint', 'react-hooks'],
  extends: ['eslint:recommended'],
  ignorePatterns: ['dist', 'dev-dist', 'node_modules', '*.cjs'],
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
      // Admin app must never import from the store app.
      files: ['src/apps/admin/**/*.{ts,tsx}'],
      rules: {
        'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
        'no-restricted-imports': ['error', {
          patterns: [{
            group: ['@/apps/store', '@/apps/store/*', '**/apps/store/*'],
            message: 'Admin must not import from the Store portal.',
          }],
        }],
      },
    },
    {
      // Store app must never import from the admin app.
      files: ['src/apps/store/**/*.{ts,tsx}'],
      rules: {
        'no-restricted-imports': ['error', {
          patterns: [{
            group: ['@/apps/admin', '@/apps/admin/*', '**/apps/admin/*'],
            message: 'Store portal must not import from the Admin portal.',
          }],
        }],
      },
    },
    {
      // shared/ stays portal-agnostic.
      files: ['src/shared/**/*.{ts,tsx}', 'src/auth/**/*.{ts,tsx}'],
      rules: {
        'no-restricted-imports': ['error', {
          patterns: [{
            group: ['@/apps/*', '@/apps/*/*', '**/apps/*'],
            message: 'Shared/auth code must stay portal-agnostic.',
          }],
        }],
      },
    },
  ],
}
