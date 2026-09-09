/* The community directory's scanner, run in-repo. The rules it applies are
 * published as eslint-plugin-obsidianmd, so `npm run lint` is the same
 * instrument the directory uses, and a finding fails the gate here before it
 * fails a listing in public. The stylesheet is in scope too, because the
 * scanner reads it. */
import { defineConfig } from 'eslint/config';
import obsidianmd from 'eslint-plugin-obsidianmd';
import css from '@eslint/css';

export default defineConfig([
  ...obsidianmd.configs.recommended.map((c) => ({
    files: ['**/*.ts', '**/*.mjs'],
    ...c,
  })),
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['eslint.config.*'],
        },
      },
    },
    plugins: { obsidianmd },
    rules: {
      'obsidianmd/ui/sentence-case': ['warn', {
        brands: ['ICOR', 'Obsidian', 'Raycast', 'Alfred', 'Shortcuts'],
        acronyms: ['ID', 'URL'],
      }],
    },
  },
  {
    files: ['styles.css'],
    plugins: { css },
    language: 'css/css',
    rules: {
      ...css.configs.recommended.rules,
      /* Every value in styles.css is one of Obsidian's variables, which
         the scanner cannot see; it validates the shape and lets the
         names through. */
      'css/no-invalid-properties': ['error', { allowUnknownVariables: true }],
    },
  },
  {
    ignores: ['main.js', 'node_modules/**', 'test/**'],
  },
]);
