/* Text properties of the repo: what the directory's scanner reads, what
 * Flint's Electron rules require, what Vex's review requires, and what the
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

/* 0.2 allowed Node's fs in two modules (the owner record and the vault
   list) and three reaches past the public API in main.ts (app.setting,
   app.commands, app.plugins). All five exceptions went with the parts that
   needed them (Tom, 2026-11-23), so the bans below have no allowlist at
   all. A ban that has to be relaxed again becomes a named exception, never
   a deleted line (Vex M-6). */

test('no em dash or en dash anywhere in the repo text', () => {
  const hits = [];
  for (const f of textFiles) {
    for (const [i, line] of readFileSync(f, 'utf8').split('\n').entries()) {
      if (/[—–]/.test(line)) hits.push(`${rel(f)}:${i + 1}`);
    }
  }
  assert.deepEqual(hits, [], `dashes at:\n  ${hits.join('\n  ')}`);
});

test('nothing of the dropped capture box is left in the tree, and nothing appends to a daily note', () => {
  /* src/ only: test/settings.test.mjs names the old keys on purpose, to
     assert that a data.json carrying them normalises them away.

     `DailyNote` left this list on 2026-09-09 evening, when the plus menu
     gained a "Daily note" item that OPENS Obsidian's own daily note (a
     type called DailyNoteOptions is not the capture box). What the ban was
     really protecting is below it and is now written out: the dropped
     plugin appended a line to the daily note, and nothing in this one may
     ever write into a file it did not create. */
  for (const f of sources) {
    const text = readFileSync(f, 'utf8');
    assert.doesNotMatch(text, /dailyFolder|dailyFormat|appendTemplate|CaptureModal|quick-notes-menu|icor-qnm-/, `${rel(f)} still carries the dropped capture box`);
    assert.doesNotMatch(strip(text), /insertIntoFile|vault\.append|vault\.modify|vault\.process/, `${rel(f)} writes into a note the member already has`);
  }
  for (const gone of ['src/capture', 'src/modals/CaptureModal.ts']) {
    assert.throws(() => statSync(resolve(repo, gone)), `${gone} still exists`);
  }
});

test('the brief\'s forbidden Electron surfaces are absent, and unregisterAll is never called', () => {
  const banned = [
    [/\bunregisterAll\b/, 'globalShortcut.unregisterAll (the process is shared)'],
    [/app\.dock\b|\.dock\./, 'app.dock'],
    [/setActivationPolicy/, 'the activation policy'],
    [/setLoginItemSettings/, 'login items'],
    [/internalPlugins/, 'app.internalPlugins'],
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

test('the chord is released on unload and on beforeunload', () => {
  const main = strip(read('src/main.ts'));
  assert.match(main, /registerDomEvent\(window, 'beforeunload', \(\) => this\.hotkey\?\.release\(\)\)/, 'Cmd-R reload skips onunload');
  assert.match(main, /onunload\(\): void \{\s*this\.hotkey\?\.release\(\);/);
});

test('no innerHTML, no outerHTML, no insertAdjacentHTML anywhere', () => {
  for (const f of sources) {
    assert.doesNotMatch(strip(readFileSync(f, 'utf8')), /innerHTML|outerHTML|insertAdjacentHTML/, rel(f));
  }
});

test('the plugin touches no private surface and no global it should not', () => {
  const banned = [
    [/vault\.config\b/, 'app.vault.config'],
    /* Written as the property name rather than as `app.plugins`, because
       the reach is spelled through a cast (`(this.app as unknown as
       { plugins?: ... }).plugins`) and a regex looking for the literal
       `app.plugins` would never have fired on it. A guard whose passing
       state is reachable without the property being true is worse than no
       guard. */
    [/app\.plugins\b|\}\)\.plugins\b|plugins\?:|getPlugin/, 'app.plugins'],
    [/\bprocess\./, 'Node process'],
    [/\bdocument\./, 'the global document'],
    [/(^|[^.\w])set(Timeout|Interval)\(/m, 'a bare timer (use window.setTimeout)'],
    [/console\.(log|info|warn|error)\(/, 'console output'],
    [/\beval\(|new Function\(/, 'dynamic code'],
    [/\.style\.[a-zA-Z]+\s*=/, 'an inline style write'],
    [/\bfetch\(|XMLHttpRequest|WebSocket|requestUrl/, 'a network call'],
    [/from ['"](node:)?(fs|child_process|path|os)['"]|require\?\.\(['"](fs|path|os|child_process)['"]\)/, 'a Node module'],
    [/\bfs\.(read|write|open|stat|watch|rename|unlink|realpath|close|fstat)/, 'a file outside the vault API'],
    [/openTabById|\.setting\b|executeCommandById|\.commands\b/, 'a private field of the app'],
    [/\(\?<[=!]/, 'a regex lookbehind'],
    [/!important/, '!important'],
    [/\.obsidian\//, 'a hardcoded config path (use vault.configDir)'],
  ];
  for (const f of sources) {
    const text = strip(readFileSync(f, 'utf8'));
    for (const [re, what] of banned) assert.doesNotMatch(text, re, `${rel(f)} uses ${what}`);
  }
});

test('every class the plugin adds carries the icor-scr- prefix', () => {
  /* The only literal classes allowed are Obsidian's own, which the plugin
     borrows rather than styles. */
  const HOST_CLASSES = new Set(['mod-cta', 'clickable-icon']);
  for (const f of sources) {
    const text = readFileSync(f, 'utf8');
    for (const m of text.matchAll(/(?:addClass|toggleClass)\(\s*`\$\{CLASS_PREFIX\}([a-z-]+)`/g)) assert.match(m[1], /^[a-z-]+$/);
    for (const m of text.matchAll(/(?:addClass|cls:)\s*\(?\s*'([^']+)'/g)) {
      for (const cls of m[1].split(/\s+/)) assert.ok(HOST_CLASSES.has(cls), `${rel(f)}: literal class ${cls}`);
    }
    /* A class written as a template literal is where the prefix could be
       skipped quietly, so every word in one is checked too. */
    for (const m of text.matchAll(/cls:\s*`([^`]+)`/g)) {
      for (const word of m[1].split(/\s+/)) {
        if (word === '' || word.includes('${CLASS_PREFIX}')) continue;
        assert.ok(HOST_CLASSES.has(word.replace(/\$\{[^}]*\}/g, '')), `${rel(f)}: unprefixed class ${word}`);
      }
    }
  }
  assert.equal(strip(read('src/constants.ts')).match(/CLASS_PREFIX = '([^']+)'/)[1], 'icor-scr-');
});

test('the stylesheet: prefixed selectors, Obsidian variables only, no hex, no pixel, no !important', () => {
  const css = read('styles.css').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i, 'a hex colour');
  assert.doesNotMatch(css, /!important/);
  assert.doesNotMatch(css, /\d(px|em|rem)\b/, 'a literal length; sizes come from --size-* and --radius-*');
  assert.doesNotMatch(css, /\.theme-dark|prefers-color-scheme/, 'the window follows Obsidian; a room block means a literal appeared first');
  for (const m of css.matchAll(/([^{}]+)\{/g)) {
    for (const selector of m[1].split(',')) {
      const s = selector.trim();
      if (s === '') continue;
      assert.match(s, /^(\.icor-scr-|body\.icor-scr-window\b)/, `selector ${s} is not anchored on the plugin`);
    }
  }
  for (const m of css.matchAll(/(color|background[a-z-]*|font-family|font-size|border-radius|border-color|padding|gap|min-width|min-height)\s*:\s*([^;]+);/g)) {
    assert.match(m[2].trim(), /^var\(--|^calc\(|^\d+$/, `${m[1]}: ${m[2].trim()} is not an Obsidian variable`);
  }
});

/* CSS specificity as the cascade counts it: [classes and attributes and
   pseudo-classes, element names]. Ids would be a third number and this
   stylesheet has none. */
function specificity(selector) {
  let classes = 0;
  let elements = 0;
  for (const m of selector.matchAll(/\.[a-zA-Z0-9_-]+|\[[^\]]*\]|::?[a-zA-Z-]+(\([^)]*\))?|[a-zA-Z][a-zA-Z0-9-]*/g)) {
    if (/^[.[:]/.test(m[0])) classes += 1;
    else elements += 1;
  }
  return [classes, elements];
}

test('the reserved top band outranks Obsidian own padding:0 on a markdown leaf', () => {
  /* `.workspace-leaf-content[data-type='markdown'] .view-content
     { padding: 0 }` in the 1.13.7 app.css is (0,3,0). The plugin's first
     spelling of the band was `body.icor-scr-window .view-content`, which is
     (0,2,1), so the band never applied: the pill, the first line and
     Obsidian's find bar all shared the top forty pixels and the find bar's
     close button sat under the traffic lights (Tom's live test,
     2026-09-09). This is arithmetic, not source order, which is not
     something a plugin controls. */
  const css = read('styles.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const match = css.match(/([^{}]+)\{[^{}]*padding-top: var\(--icor-scr-band\)/);
  assert.ok(match, 'the band rule is there');
  const mine = specificity(match[1].trim());
  const theirs = specificity(".workspace-leaf-content[data-type='markdown'] .view-content");
  assert.deepEqual(theirs, [3, 0], 'the rule this has to beat, as read from the bundle');
  assert.ok(mine[0] > theirs[0] || (mine[0] === theirs[0] && mine[1] > theirs[1]), `the band selector is ${mine} against ${theirs}`);
});

test('the window has a drag region of its own, because hiding the chrome took both of Obsidian own away', () => {
  const css = read('styles.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const drag = css.match(/([^{}]+)\{\s*-webkit-app-region: drag;/);
  assert.ok(drag, 'something drags');
  assert.match(drag[1], /icor-scr-dragbar/, 'the strip, not only the pill');
  /* Each selector is doubled to beat `body.is-frameless > .app-container ~ *
     { -webkit-app-region: no-drag }` at (0,2,1). */
  for (const selector of drag[1].split(',')) {
    const s = selector.trim();
    if (s === '') continue;
    const spec = specificity(s);
    assert.ok(spec[0] > 2 || (spec[0] === 2 && spec[1] > 1), `${s} is ${spec}, which does not outrank Obsidian no-drag rule`);
  }
  assert.match(css, /-webkit-app-region: no-drag/, 'the buttons and the title stay clickable');
});

test('the plugin never touches the width of the editor column, so readable line width stays the member choice', () => {
  /* The first build forced readable line width off inside the window, and
     in fullscreen the note hugged the left edge of a 2000 pixel screen
     while the main window centred the same note (Tom, 2026-09-09). The
     fix is the absence of a rule: Obsidian's own behaviour is a
     max-width, which never binds in a narrow window and centres in a wide
     one, so both sizes are right with nothing written here. The way to
     lose that again is one helpful rule, which is what this guards. */
  const css = read('styles.css').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const selector = m[1].trim();
    if (!/cm-sizer|cm-content|cm-line|markdown-preview-sizer|is-readable-line-width|markdown-source-view|markdown-preview-view/.test(selector)) continue;
    assert.doesNotMatch(m[2], /(^|[\s;])(max-)?width\s*:|margin(-inline|-left|-right)?\s*:/, `${selector} overrides the editor column width`);
  }
  /* And no width class of the plugin's own crept back in to do it from
     JavaScript instead. */
  assert.doesNotMatch(css, /icor-scr-wide/);
  for (const f of sources) assert.doesNotMatch(strip(readFileSync(f, 'utf8')), /icor-scr-wide|file-line-width/, `${rel(f)} computes a line width`);
});

test('the drag band and the count line span the window, so a centred column cannot pull them in', () => {
  const css = read('styles.css').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const cls of ['icor-scr-dragbar', 'icor-scr-footer']) {
    const rule = css.match(new RegExp(`body\\.icor-scr-window \\.${cls} \\{([^}]*)\\}`));
    assert.ok(rule, `${cls} has a rule`);
    assert.match(rule[1], /position: fixed/, `${cls} is out of the editor flow`);
    assert.match(rule[1], /left: 0/, `${cls} starts at the window edge`);
    assert.match(rule[1], /right: 0/, `${cls} ends at the window edge`);
  }
});

test('no literal colour anywhere in src', () => {
  for (const f of sources) {
    const text = strip(readFileSync(f, 'utf8'));
    assert.deepEqual([...text.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]), [], rel(f));
  }
});

test('the built plugin requires obsidian only and reaches Electron through window.require at runtime', () => {
  const main = read('main.js');
  const requires = [...main.matchAll(/require\("([^"]+)"\)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(requires)], ['obsidian']);
  assert.match(main, /@electron\/remote/, 'the remote module name is present for the runtime lookup');
  assert.doesNotMatch(main, /node_modules/);
  assert.doesNotMatch(main, /data:image\/png;base64,/, 'no icon is embedded any more');
});
