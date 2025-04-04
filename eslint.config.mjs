// eslint.config.mjs
import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
// Import TypeScript ESLint parser and plugin for the override rule
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

// Start with the configurations you are extending
const eslintConfig = [
  ...compat.extends("next/core-web-vitals"), // Keep this line

  // --- Add this configuration object AFTER the compat.extends ---
  // This object specifically targets TS/TSX files to override the rule
  {
    files: ['**/*.ts', '**/*.tsx'], // Target TypeScript files
    plugins: {
      '@typescript-eslint': tsPlugin, // Make sure the plugin is available
    },
    languageOptions: {
      parser: tsParser, // Specify the parser
      parserOptions: {
         // You might need project path if rule requires type info,
         // but for no-unused-vars it's often not strictly needed.
         // project: './tsconfig.json',
      },
    },
    rules: {
      // Override the specific rule
      '@typescript-eslint/no-unused-vars': [
        'error', // Or 'warn' if you prefer warnings over errors
        {
          args: 'after-used',
          caughtErrors: 'all', // Check all caught errors
          ignoreRestSiblings: true,
          vars: 'all',
          // --- These patterns allow underscores ---
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          // --- End patterns ---
        },
      ],
      // Add any other specific TS overrides here if needed
    },
  },
  // --- End of added configuration object ---

  // You could potentially add other config objects here if needed
];

export default eslintConfig;
