// @ts-check
import tseslint from 'typescript-eslint';
import eslintPluginPrettier from 'eslint-plugin-prettier/recommended';
import sonarjs from 'eslint-plugin-sonarjs';
import importPlugin from 'eslint-plugin-import-x';
import globals from 'globals';

/**
 * ESLint config — Nest backend (mirrors inite-brain-service).
 *
 * Quality gates (DRY / SOLID / Clean Architecture / anti-god-file),
 * treated as ERRORS (CI red). Raising a ceiling is the wrong knob —
 * split the offender instead. Pre-existing violations carry a
 * grep-able `eslint-disable` + TODO so the debt is tracked, not hidden.
 *
 *   - max-lines (300)              — god-file ceiling; split, don't grow.
 *   - max-lines-per-function (200) — god-function ceiling.
 *   - max-classes-per-file (1)     — one @Injectable per file (SRP).
 *   - max-params (3)               — past 3, pass a typed options object /
 *     contract (one per file). The ONLY exceptions are framework injection
 *     points that can't be options objects — NestJS DI constructors and
 *     decorated route handlers (@Body/@Req/@Res/@Param/@Query) — which carry a
 *     grep-able `eslint-disable max-params` + reason. Pre-existing service-
 *     method violations carry a `TODO(par-max)` disable until refactored.
 *   - complexity (12)              — cyclomatic complexity per fn.
 *   - sonarjs/cognitive-complexity (30) — readability-weighted variant.
 *   - sonarjs/no-identical-functions / no-duplicated-branches — DRY.
 *   - import-x/no-restricted-paths — controllers must not import the DB
 *     layer (src/prisma) directly; business logic lives in services.
 *
 * Test files are exempt from size/complexity gates (Arrange/Act/Assert
 * legitimately inflates length and duplication).
 */

const sizeGates = {
  'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
  'max-lines-per-function': [
    'error',
    { max: 200, skipBlankLines: true, skipComments: true, IIFEs: true },
  ],
  'max-classes-per-file': ['error', 1],
  'max-params': ['error', 3],
  complexity: ['error', 12],
  'sonarjs/cognitive-complexity': ['error', 30],
};

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'generated/**',
      // sub-projects / non-source with their own toolchains
      'frontend/**',
      'packages/**',
      'scripts/**',
      'prisma/**',
    ],
  },
  ...tseslint.configs.recommended,
  eslintPluginPrettier,
  {
    plugins: {
      sonarjs: sonarjs,
      'import-x': importPlugin,
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.jest },
      parserOptions: {
        // No type-aware linting (slow on a Nest app; we lint src + test
        // which would need separate tsconfigs).
        project: false,
      },
    },
    settings: {
      'import-x/resolver': {
        node: { extensions: ['.ts', '.js'] },
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-empty-object-type': 'off',
      'prefer-const': 'warn',
      'prettier/prettier': 'off', // formatting handled by `npm run format`

      // ── Clean architecture / DRY hard gates ──────────────────────
      // Controllers MUST NOT import the DB layer directly. A controller
      // is HTTP plumbing; queries belong in a service so the next caller
      // (cron / MCP / another controller) can reuse them. Existing
      // violations carry a per-line disable + TODO.
      'import-x/no-restricted-paths': [
        'error',
        {
          zones: [
            {
              target: './src/**/*.controller.ts',
              from: './src/prisma',
              message:
                'Controllers MUST NOT import from src/prisma directly. Move the query into a service and inject the service instead.',
            },
          ],
        },
      ],
      'sonarjs/no-identical-functions': 'error',
      'sonarjs/no-duplicated-branches': 'error',

      ...sizeGates,
    },
  },
  {
    files: ['test/**/*.ts', '**/*.spec.ts', '**/*.unit-spec.ts'],
    rules: {
      'max-lines': 'off',
      'max-lines-per-function': 'off',
      'max-classes-per-file': 'off',
      'max-params': 'off',
      complexity: 'off',
      'sonarjs/cognitive-complexity': 'off',
      'sonarjs/no-identical-functions': 'off',
      'sonarjs/no-duplicated-branches': 'off',
    },
  },
);
