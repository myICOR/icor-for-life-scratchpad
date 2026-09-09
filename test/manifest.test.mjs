/* Identity and floor. One id across the manifest, the package and the
 * constant; one version across three files; desktop only, because the
 * icon and the hotkey live in Electron's main process; every named import
 * from 'obsidian' present at the declared minAppVersion, read from the
 * @since annotations in obsidian.d.ts; bare command ids and sentence-case
 * names; no default hotkeys anywhere. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { COMMAND_OPEN_DAILY_NOTE, COMMAND_QUICK_NOTE, PLUGIN_ID, PLUGIN_NAME, PROTOCOL_ACTION } from './build/pure.mjs';

const repo = resolve(import.meta.dirname, '..');
const read = (f) => readFileSync(resolve(repo, f), 'utf8');
const manifest = JSON.parse(read('manifest.json'));
const pkg = JSON.parse(read('package.json'));
const versions = JSON.parse(read('versions.json'));

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

const cmp = (a, b) => {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
};

test('one id, one name, one version', () => {
  assert.equal(manifest.id, PLUGIN_ID);
  assert.equal(manifest.id, pkg.name);
  assert.equal(manifest.name, PLUGIN_NAME);
  assert.equal(manifest.version, pkg.version);
  assert.equal(versions[manifest.version], manifest.minAppVersion);
  assert.equal(manifest.author, 'myICOR');
  assert.equal(manifest.authorUrl, 'https://myicor.com');
});

test('desktop only, floor 1.13.0', () => {
  assert.equal(manifest.isDesktopOnly, true);
  assert.equal(manifest.minAppVersion, '1.13.0');
});

test('the description is what the directory accepts', () => {
  assert.ok(manifest.description.length <= 250, 'at most 250 characters');
  assert.match(manifest.description, /\.$/, 'ends with a full stop');
  assert.doesNotMatch(manifest.description, /^(This|A plugin|An Obsidian plugin)/);
  assert.match(manifest.description, /ICOR for Life/);
  /* obsidianmd/validate-manifest: the charset and the two forbidden
     words, on the three fields the scanner reads. A colon is outside the
     charset, and "Obsidian" is not a word a description may carry. */
  const charset = /^[A-Za-z0-9\s.,!?'"-]+$/;
  for (const field of ['name', 'description']) {
    assert.match(manifest[field], charset, `${field} is outside the directory's charset`);
    assert.doesNotMatch(manifest[field], /obsidian/i, `${field} names the app`);
    assert.doesNotMatch(manifest[field], /plugin/i, `${field} says "plugin"`);
  }
  assert.doesNotMatch(manifest.id, /obsidian|plugin/i, 'the id names the app or says "plugin"');
});

test('every named import from obsidian exists at minAppVersion', () => {
  const dts = read('node_modules/obsidian/obsidian.d.ts');
  const since = new Map();
  for (const m of dts.matchAll(/\/\*\*([^]*?)\*\/\s*export (?:abstract )?(?:class|function|interface|type|const|enum|let|var) (\w+)/g)) {
    const s = m[1].match(/@since (\d+\.\d+\.\d+)/);
    if (s && !since.has(m[2])) since.set(m[2], s[1]);
  }
  const floor = manifest.minAppVersion;
  const offenders = [];
  for (const file of walk(resolve(repo, 'src'))) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/import (?:type )?\{([^}]*)\} from 'obsidian'/g)) {
      for (const raw of m[1].split(',')) {
        const name = raw.trim().split(/\s+as\s+/)[0];
        if (!name) continue;
        const s = since.get(name);
        if (s && cmp(s, floor) > 0) offenders.push(`${name} (@since ${s}) in ${file.slice(repo.length + 1)}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `newer than minAppVersion ${floor}:\n  ${offenders.join('\n  ')}`);
  /* The members used on those imports that carry their own @since:
     getSettingDefinitions (1.13.0) is the floor's reason; the rest are
     older. Checked by the scanner's no-unsupported-api rule in lint. */
});

test('commands: bare ids, sentence case, an icon each, no default hotkeys', () => {
  const main = read('src/main.ts');
  const commands = [...main.matchAll(/addCommand\(\{ id: ([A-Z_]+), name: '([^']+)', icon: '([^']+)'/g)];
  assert.equal(commands.length, 2);
  const ids = new Set(commands.map((c) => c[1]));
  assert.deepEqual([...ids].sort(), ['COMMAND_OPEN_DAILY_NOTE', 'COMMAND_QUICK_NOTE']);
  for (const id of [COMMAND_QUICK_NOTE, COMMAND_OPEN_DAILY_NOTE]) assert.doesNotMatch(id, /icor|quick-notes-menu/, 'bare id, the app prefixes the plugin id');
  for (const c of commands) {
    assert.match(c[2], /^[A-Z][a-z]/, `${c[2]} is sentence case`);
    assert.match(c[3], /^lucide-/);
  }
  assert.doesNotMatch(main, /hotkeys:/, 'no default hotkey on a command; the global chord is the member\'s');
});

test('the protocol action is the documented one', () => {
  assert.equal(PROTOCOL_ACTION, 'icor-quick-note');
  assert.match(read('README.md'), /obsidian:\/\/icor-quick-note\?vault=/);
});

test('electron is a devDependency for its types and an esbuild external, never bundled', () => {
  assert.ok(pkg.devDependencies.electron, 'electron in devDependencies');
  assert.equal(pkg.dependencies, undefined, 'no runtime dependencies');
  const build = read('esbuild.config.mjs');
  assert.match(build, /external: \['obsidian', 'electron', '@electron\/remote'\]/);
  /* npm 11 has no per-project spelling of the skip switch, so the release
     workflow sets the environment variable on its install step, and it
     runs only scripts that exist. */
  const workflow = read('.github/workflows/release.yml');
  assert.match(workflow, /ELECTRON_SKIP_BINARY_DOWNLOAD: "1"/);
  for (const m of workflow.matchAll(/npm run ([a-z]+)/g)) assert.ok(pkg.scripts[m[1]], `release.yml runs "npm run ${m[1]}", which package.json does not define`);
});
