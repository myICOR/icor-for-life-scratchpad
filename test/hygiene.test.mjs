/* Text properties of the repo: what the directory's scanner reads, what
 * Flint's Electron rules require, what the brief forbids, and what the
 * team's hard rules say. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const repo = resolve(import.meta.dirname, '..');
const read = (f) => readFileSync(resolve(repo, f), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function walk(dir, exts) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === 'build' || name === 'node_modules') continue;
    if (statSync(p).isDirectory()) out.push(...walk(p, exts));
    else if (exts.some((e) => p.endsWith(e))) out.push(p);
  }
  return out;
}

/* Every text file in the repo except this one, which carries the very
   strings it forbids. */
const self = resolve(repo, 'test/hygiene.test.mjs');
const textFiles = ['README.md', 'SECURITY.md', 'THIRD-PARTY-NOTICES.md', 'CHANGELOG.md', 'CONTRIBUTING.md', 'manifest.json', 'package.json', 'styles.css', 'esbuild.config.mjs', 'eslint.config.mjs', '.npmrc']
  .map((f) => resolve(repo, f))
  .concat(walk(resolve(repo, 'src'), ['.ts']), walk(resolve(repo, 'test'), ['.mjs', '.ts']), walk(resolve(repo, 'docs'), ['.md']), walk(resolve(repo, '.github'), ['.yml']))
  .filter((f) => f !== self);

const sources = walk(resolve(repo, 'src'), ['.ts']);
const rel = (f) => f.slice(repo.length + 1);

test('no em dash or en dash anywhere in the repo text', () => {
  const hits = [];
  for (const f of textFiles) {
    for (const [i, line] of readFileSync(f, 'utf8').split('\n').entries()) {
      if (/[—–]/.test(line)) hits.push(`${rel(f)}:${i + 1}`);
    }
  }
  assert.deepEqual(hits, [], `dashes at:\n  ${hits.join('\n  ')}`);
});

test('the brief\'s forbidden Electron surfaces are absent, and unregisterAll is never called', () => {
  const banned = [
    [/\bunregisterAll\b/, 'globalShortcut.unregisterAll (the process is shared)'],
    [/app\.dock\b|\.dock\./, 'app.dock'],
    [/setActivationPolicy/, 'the activation policy'],
    [/setLoginItemSettings/, 'login items'],
    [/internalPlugins/, 'app.internalPlugins'],
    [/app\.commands\b|\.commands\./, 'app.commands'],
    [/'close'|"close"/, 'window close interception'],
    [/preventDefault\(\)\s*;?\s*\/\/\s*close/, 'window close interception'],
  ];
  for (const f of sources) {
    const text = strip(readFileSync(f, 'utf8'));
    for (const [re, what] of banned) assert.doesNotMatch(text, re, `${rel(f)} uses ${what}`);
  }
});

test('every register of the chord is preceded by an unregister of the same chord, and the boolean is read', () => {
  const src = strip(read('src/electron/globalHotkey.ts'));
  const unregisterAt = src.indexOf('gs.unregister(chord)');
  const registerAt = src.indexOf('gs.register(chord');
  assert.ok(unregisterAt >= 0 && registerAt >= 0, 'both calls exist');
  assert.ok(unregisterAt < registerAt, 'unregister runs before register');
  assert.match(src, /ok = gs\.register\(chord, onFire\)/, 'the return value is kept');
  assert.match(src, /if \(!ok\)[\s\S]*new Notice/, 'a false return is shown as a Notice');
});

test('main-process state is released on unload and on beforeunload, and the tray reference is module-level', () => {
  const main = strip(read('src/main.ts'));
  assert.match(main, /registerDomEvent\(window, 'beforeunload'/, 'Cmd-R reload skips onunload');
  assert.match(main, /onunload\(\): void \{\s*this\.releaseMainProcessState\(\);/);
  const release = main.slice(main.indexOf('private releaseMainProcessState'), main.indexOf('private openCapture'));
  assert.match(release, /hotkey\?\.release\(\)/);
  assert.match(release, /destroyTray\(\)/);
  const tray = strip(read('src/electron/tray.ts'));
  assert.match(tray, /^let tray: Tray \| null = null;/m, 'the Tray reference is module-level, not on the plugin instance');
  assert.match(tray, /t\.destroy\(\)/);
});

test('the tray menu label never registers its accelerator (the chord is globalShortcut\'s)', () => {
  const tray = strip(read('src/electron/tray.ts'));
  assert.match(tray, /registerAccelerator = false/);
});

test('protocol text is plain text: no innerHTML, no outerHTML, no insertAdjacentHTML anywhere', () => {
  for (const f of sources) {
    assert.doesNotMatch(strip(readFileSync(f, 'utf8')), /innerHTML|outerHTML|insertAdjacentHTML/, rel(f));
  }
});

test('the plugin touches no private surface and no global it should not', () => {
  const banned = [
    [/vault\.config\b/, 'app.vault.config'],
    [/app\.plugins\b/, 'app.plugins'],
    [/\bprocess\./, 'Node process'],
    [/\bdocument\./, 'the global document'],
    [/(^|[^.\w])set(Timeout|Interval)\(/m, 'a bare timer (use window.setTimeout)'],
    [/console\.(log|info|warn|error)\(/, 'console output'],
    [/\beval\(|new Function\(/, 'dynamic code'],
    [/\.style\.[a-zA-Z]+\s*=/, 'an inline style write'],
    [/\bfetch\(|XMLHttpRequest|WebSocket|requestUrl/, 'a network call'],
    [/from ['"](node:)?(fs|child_process|path|os)['"]/, 'a Node module'],
    [/\(\?<[=!]/, 'a regex lookbehind'],
    [/!important/, '!important'],
    [/\.obsidian\//, 'a hardcoded config path (use vault.configDir)'],
  ];
  for (const f of sources) {
    const text = strip(readFileSync(f, 'utf8'));
    for (const [re, what] of banned) assert.doesNotMatch(text, re, `${rel(f)} uses ${what}`);
  }
});

test('the one reach past the public API is app.setting, guarded, in main.ts only', () => {
  for (const f of sources) {
    const text = strip(readFileSync(f, 'utf8'));
    if (f.endsWith('/main.ts')) {
      assert.match(text, /typeof setting\.open === 'function' && typeof setting\.openTabById === 'function'/);
      continue;
    }
    assert.doesNotMatch(text, /openTabById|\.setting\b/, rel(f));
  }
});

test('every class the plugin adds carries the icor-qnm- prefix', () => {
  for (const f of sources) {
    const text = readFileSync(f, 'utf8');
    for (const m of text.matchAll(/(?:addClass|toggleClass)\(\s*`\$\{CLASS_PREFIX\}([a-z-]+)`/g)) assert.match(m[1], /^[a-z-]+$/);
    for (const m of text.matchAll(/(?:addClass|cls:)\s*\(?\s*'([^']+)'/g)) {
      assert.ok(m[1] === 'mod-cta', `${rel(f)}: literal class ${m[1]} (only Obsidian's own mod-cta may be literal)`);
    }
  }
  assert.equal(strip(read('src/constants.ts')).match(/CLASS_PREFIX = '([^']+)'/)[1], 'icor-qnm-');
});

test('the stylesheet: prefixed selectors, Obsidian variables only, no hex, no pixel, no !important', () => {
  const css = read('styles.css').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i, 'a hex colour');
  assert.doesNotMatch(css, /!important/);
  assert.doesNotMatch(css, /\d(px|em|rem)\b/, 'a literal length; sizes come from --size-* and --radius-*');
  for (const m of css.matchAll(/([^{}]+)\{/g)) {
    for (const selector of m[1].split(',')) assert.match(selector.trim(), /^\.icor-qnm-/, `selector ${selector.trim()} is not on the prefix`);
  }
  for (const m of css.matchAll(/(color|background[a-z-]*|font-family|font-size|border-radius|border-color|padding|gap|min-width|min-height)\s*:\s*([^;]+);/g)) {
    assert.match(m[2].trim(), /^var\(--|^calc\(|^\d+$/, `${m[1]}: ${m[2].trim()} is not an Obsidian variable`);
  }
});

test('the placeholder icon is the only literal colour in src, and it is black (the template-image contract)', () => {
  for (const f of sources) {
    const text = strip(readFileSync(f, 'utf8'));
    const hexes = [...text.matchAll(/#[0-9a-fA-F]{6}\b/g)].map((m) => m[0]);
    if (f.endsWith('/trayIcon.ts')) assert.deepEqual(hexes, ['#000000']);
    else assert.deepEqual(hexes, [], rel(f));
  }
});

test('the built plugin requires obsidian only and reaches Electron through window.require at runtime', () => {
  const main = read('main.js');
  const requires = [...main.matchAll(/require\("([^"]+)"\)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(requires)], ['obsidian']);
  assert.match(main, /@electron\/remote/, 'the remote module name is present for the runtime lookup');
  assert.doesNotMatch(main, /node_modules/);
});
