// ESLint flat config. The sim determinism bans and the package dependency rules
// from docs/spec/20-architecture.md live here, so `npm run lint` enforces them.
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const DEP_MESSAGE = 'This import breaks the package dependency rules (docs/spec/20-architecture.md).';
const DET_MESSAGE = 'Not deterministic. The sim uses its own clock and seeded RNG streams.';

const APPS = ['**/apps/**', '@qoti/client', '@qoti/gallery', '@qoti/server'];
const TOOLS = ['**/tools/**', '@qoti/bench', '@qoti/dev-server'];
const VIEW = ['three', 'three/*', 'preact', 'preact/*', '@preact/*'];

const BANNED_GLOBALS = [
  'Date',
  'performance',
  'setTimeout',
  'setInterval',
  'setImmediate',
  'clearTimeout',
  'clearInterval',
  'clearImmediate',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'queueMicrotask',
  'Intl',
  'crypto',
];

const BANNED_MATH = [
  'random',
  'sin',
  'cos',
  'tan',
  'asin',
  'acos',
  'atan',
  'atan2',
  'exp',
  'expm1',
  'log',
  'log1p',
  'log2',
  'log10',
  'pow',
  'cbrt',
  'hypot',
  'sinh',
  'cosh',
  'tanh',
];

const LOCALE_METHODS = [
  'localeCompare',
  'toLocaleString',
  'toLocaleDateString',
  'toLocaleTimeString',
  'toLocaleUpperCase',
  'toLocaleLowerCase',
];

/** Dependency rule: forbid the given import patterns, optionally allowing type-only sim imports. */
function deps(patterns, { simTypesOnly = false } = {}) {
  const paths = simTypesOnly
    ? [{ name: '@qoti/sim', allowTypeImports: true, message: 'Only type imports from @qoti/sim here.' }]
    : [];
  return {
    'no-restricted-imports': 'off',
    '@typescript-eslint/no-restricted-imports': [
      'error',
      { paths, patterns: [{ group: patterns, message: DEP_MESSAGE }] },
    ],
  };
}

export default defineConfig([
  globalIgnores([
    '**/node_modules/**',
    '**/dist/**',
    '**/.wrangler/**',
    '.devdata/**',
    '**/playwright-report/**',
    '**/test-results/**',
    '**/blob-report/**',
    'coverage/**',
    '**/*.generated.ts',
    'docs/**',
    'test/fixtures/**',
  ]),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-irregular-whitespace': ['error', { skipStrings: false, skipTemplates: false }],
    },
  },
  {
    files: ['apps/client/**', 'apps/gallery/**', 'packages/art/**'],
    languageOptions: { globals: { ...globals.browser } },
  },

  // Determinism in packages/sim (scripts run in Node at build time and are exempt).
  {
    files: ['packages/sim/**/*.{ts,tsx,js,mjs}'],
    ignores: ['packages/sim/scripts/**'],
    rules: {
      'no-restricted-globals': ['error', ...BANNED_GLOBALS.map((name) => ({ name, message: DET_MESSAGE }))],
      'no-restricted-properties': [
        'error',
        ...BANNED_MATH.map((property) => ({
          object: 'Math',
          property,
          message: 'Banned in the sim. Use integer math, Math.sqrt or a lookup table.',
        })),
        ...['keys', 'values', 'entries'].map((property) => ({
          object: 'Object',
          property,
          message: 'Iterate arrays or Maps, never object keys.',
        })),
        ...LOCALE_METHODS.map((property) => ({ property, message: 'Locale methods are not deterministic.' })),
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "BinaryExpression[operator='**']",
          message: 'The ** operator is banned in the sim. Use integer math or a lookup table.',
        },
        {
          selector: "AssignmentExpression[operator='**=']",
          message: 'The ** operator is banned in the sim. Use integer math or a lookup table.',
        },
        { selector: 'ForInStatement', message: 'Iterate arrays or Maps, never object keys.' },
        { selector: ':function[async=true]', message: 'No async in the sim.' },
        { selector: 'AwaitExpression', message: 'No async in the sim.' },
      ],
    },
  },

  // Package dependency rules.
  {
    files: ['packages/content/**'],
    rules: deps(['@qoti/*', ...VIEW, 'fflate', 'ws', 'node:*', ...APPS, ...TOOLS]),
  },
  {
    files: ['packages/sim/**'],
    ignores: ['packages/sim/scripts/**'],
    rules: deps(['@qoti/protocol', '@qoti/art', ...VIEW, 'ws', 'node:*', ...APPS, ...TOOLS]),
  },
  {
    files: ['packages/protocol/**'],
    rules: deps(['@qoti/content', '@qoti/art', ...VIEW, 'ws', 'node:*', ...APPS, ...TOOLS], {
      simTypesOnly: true,
    }),
  },
  {
    files: ['packages/art/**'],
    rules: deps([
      '@qoti/sim',
      '@qoti/protocol',
      'preact',
      'preact/*',
      '@preact/*',
      'ws',
      'node:*',
      ...APPS,
      ...TOOLS,
    ]),
  },
  {
    files: ['apps/server/**', 'tools/dev-server/**'],
    rules: deps(['@qoti/content', '@qoti/art', ...VIEW, ...APPS], {
      simTypesOnly: true,
    }),
  },
  {
    files: ['tools/bench/**'],
    rules: deps(['@qoti/art', '@qoti/protocol', ...VIEW, ...APPS]),
  },
  {
    files: ['apps/client/**'],
    rules: deps(['@qoti/gallery', '@qoti/server', '**/apps/gallery/**', '**/apps/server/**', 'ws', ...TOOLS]),
  },
  {
    files: ['apps/gallery/**'],
    rules: deps([
      '@qoti/client',
      '@qoti/server',
      '@qoti/sim',
      '@qoti/protocol',
      '**/apps/client/**',
      '**/apps/server/**',
      ...TOOLS,
    ]),
  },
]);
