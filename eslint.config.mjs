import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ['src/tool/**/*.{ts,tsx}', 'src/app/tool-client.tsx'],
    rules: {
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/immutability': 'off',
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.name='fetch']",
          message: 'Tool logic must stay client-local. Do not send user data via fetch.',
        },
        {
          selector: "NewExpression[callee.name='XMLHttpRequest']",
          message: 'Tool logic must stay client-local. Do not use XMLHttpRequest.',
        },
        {
          selector: "CallExpression[callee.property.name='sendBeacon']",
          message: 'Tool logic must stay client-local. Do not send telemetry/beacons.',
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    'dist/**',
    'packages/*/dist/**',
    '__tests__/e2e/**',
    'playwright.config.ts',
  ]),
]);

export default eslintConfig;
