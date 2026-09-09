# Third-party notices

The built `main.js` bundles no third-party code. Everything it needs at
runtime is provided by the host application and is declared external at
build time (`esbuild.config.mjs`): `obsidian`, and the desktop process's
own `electron` and `@electron/remote`, which the plugin reaches through
`window.require` at runtime. `test/hygiene.test.mjs` checks that the
bundle requires exactly `obsidian` and carries no `node_modules` path.

## Icons

The command icons are Lucide names resolved through Obsidian's own icon
API at runtime. The menu bar icon is either the file shipped in
`assets/` or a glyph drawn on a canvas at load. No icon assets are
bundled into `main.js`.

## Development dependencies

TypeScript, esbuild, ESLint, `eslint-plugin-obsidianmd`, `@eslint/css`,
`typescript-eslint`, `@types/node`, the `obsidian` type package and the
`electron` package (for its type declarations only; the binary download
is skipped by `.npmrc`) are used to build, lint and test the plugin. None
of them ships in a release.

Everything in this plugin is written for it.
