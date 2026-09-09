/* The two files outside every vault, as shapes. Vex's 2026-09-09 review is
 * the source of every assertion in here; the finding id is named on each. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MAX_VAULTS, OWNER_RECORD_SCHEMA, canonicalPath, formatOwnerRecord, isAbsolutePath, parseOwnerRecord, parseVaultRegistry, samePath, vaultMark, vaultNameFromPath } from './build/pure.mjs';

const repo = resolve(import.meta.dirname, '..');
const read = (f) => readFileSync(resolve(repo, f), 'utf8');

test('a valid record parses field by field into the four keys and nothing else', () => {
  const record = parseOwnerRecord(JSON.stringify({ schema: 1, ownerPath: '/Users/t/Vault', ownerName: 'Vault', ts: 12 }));
  assert.deepEqual(record, { schema: 1, ownerPath: '/Users/t/Vault', ownerName: 'Vault', ts: 12 });
  assert.deepEqual(Object.keys(record).sort(), ['ownerName', 'ownerPath', 'schema', 'ts']);
});

test('M-3: missing, malformed and shapeless all parse to null, which never means "claim it"', () => {
  assert.equal(parseOwnerRecord(''), null);
  assert.equal(parseOwnerRecord('not json'), null);
  assert.equal(parseOwnerRecord('null'), null);
  assert.equal(parseOwnerRecord('[]'), null);
  assert.equal(parseOwnerRecord('"a string"'), null);
  assert.equal(parseOwnerRecord('{}'), null);
  assert.equal(parseOwnerRecord(JSON.stringify({ ownerPath: '' })), null);
  assert.equal(parseOwnerRecord(JSON.stringify({ ownerPath: 'relative/path' })), null, 'a relative path is refused');
  assert.equal(parseOwnerRecord(JSON.stringify({ ownerPath: `/x${'y'.repeat(2000)}` })), null, 'an oversized path is refused');
  assert.equal(parseOwnerRecord(`{"ownerPath":"/a\\u0000b"}`), null, 'a NUL is refused');
  assert.equal(parseOwnerRecord(`{"ownerPath":"/a","pad":"${'z'.repeat(70000)}"}`), null, 'an oversized record is refused');
});

test('L-4: a hostile prototype in the JSON does not reach the record', () => {
  const record = parseOwnerRecord('{"ownerPath":"/v","__proto__":{"ownsMenuBar":true}}');
  assert.equal(record.ownerPath, '/v');
  assert.equal(record.ownsMenuBar, undefined);
  assert.equal(Object.getPrototypeOf(record), Object.prototype);
  assert.equal({}.ownsMenuBar, undefined, 'Object.prototype is untouched');
});

test('M-2: NFC on both sides, because APFS hands paths back decomposed', () => {
  const composed = '/Users/tom/Vaults/B\u00FCcher';
  const decomposed = '/Users/tom/Vaults/Bu\u0308cher';
  assert.notEqual(composed, decomposed);
  assert.ok(samePath(composed, decomposed));
  assert.equal(canonicalPath('/a/b/'), '/a/b');
  assert.equal(canonicalPath('/a/b'), '/a/b');
  assert.equal(vaultNameFromPath('/Users/tom/My Life Folder - TR'), 'My Life Folder - TR');
});

test('case is NOT folded: two vaults on a case-sensitive volume are two vaults', () => {
  assert.equal(samePath('/a/Vault', '/a/vault'), false);
});

test('a Windows drive path and a UNC share count as absolute, a bare name does not', () => {
  assert.ok(isAbsolutePath('/Users/t/v'));
  assert.ok(isAbsolutePath('C:\\Users\\t\\v'));
  assert.ok(isAbsolutePath('\\\\server\\share'));
  assert.equal(isAbsolutePath('v'), false);
  assert.equal(isAbsolutePath('../v'), false);
});

test('the record written is the record read, and it carries the schema', () => {
  const text = formatOwnerRecord('/Users/t/Vault/', 999);
  const back = parseOwnerRecord(text);
  assert.deepEqual(back, { schema: OWNER_RECORD_SCHEMA, ownerPath: '/Users/t/Vault', ownerName: 'Vault', ts: 999 });
  assert.match(text, /\n$/, 'one trailing newline');
});

test('M-2: the record holds nothing but the four keys, so it cannot leak a second answer', () => {
  const parsed = JSON.parse(formatOwnerRecord('/v', 1));
  assert.deepEqual(Object.keys(parsed).sort(), ['ownerName', 'ownerPath', 'schema', 'ts']);
});

test('the vault registry is read defensively and capped', () => {
  const registry = JSON.stringify({
    vaults: {
      aaa: { path: '/Users/t/Two', ts: 2, open: true },
      bbb: { path: '/Users/t/One', ts: 1 },
      ccc: { path: '' },
      ddd: { notAPath: true },
      eee: 'nope',
    },
  });
  const entries = parseVaultRegistry(registry);
  assert.deepEqual(entries.map((e) => e.name), ['One', 'Two']);
  assert.equal(entries[1].open, true);
  assert.equal(entries[0].open, false);
  assert.deepEqual(parseVaultRegistry('not json'), []);
  assert.deepEqual(parseVaultRegistry('{}'), []);
  assert.deepEqual(parseVaultRegistry(JSON.stringify({ vaults: [] })), []);
  const many = { vaults: {} };
  for (let i = 0; i < 200; i++) many.vaults[`k${i}`] = { path: `/v/${i}` };
  assert.equal(parseVaultRegistry(JSON.stringify(many)).length, MAX_VAULTS);
});

test('M-4: the mark comes from the record and a manifest, never from another vault data file', () => {
  const entry = { id: 'a', path: '/v/one', name: 'one', open: false };
  const owner = { schema: 1, ownerPath: '/v/one', ownerName: 'one', ts: 1 };
  assert.equal(vaultMark(entry, true, owner), 'owner');
  assert.equal(vaultMark(entry, true, null), 'installed');
  assert.equal(vaultMark(entry, false, null), 'not installed');
  assert.equal(vaultMark(entry, false, { ...owner, ownerPath: '/v/two' }), 'not installed');
});

test('M-2: ownerPath is compared and displayed, never used to build a path or reach fs', () => {
  for (const file of ['src/electron/ownerRecord.ts', 'src/ownership/record.ts', 'src/ownership/ownership.ts']) {
    const src = read(file);
    assert.doesNotMatch(src, /join\([^)]*ownerPath/, `${file} joins ownerPath`);
    assert.doesNotMatch(src, /resolve\([^)]*ownerPath/, `${file} resolves ownerPath`);
    assert.doesNotMatch(src, /(readFileSync|writeFileSync|existsSync|statSync|openSync|watch)\([^)]*ownerPath/, `${file} hands ownerPath to fs`);
  }
});

test('H-1: the watcher is on the directory, debounced, and never on the record file', () => {
  const src = read('src/electron/ownerRecord.ts');
  assert.match(src, /node\.fs\.watch\(dir,/, 'the watcher takes the directory');
  assert.doesNotMatch(src, /fs\.watch\(recordPath/, 'never the file: a rename makes that watcher deaf');
  assert.match(src, /if \(filename !== name\) return;/, 'events are filtered by filename');
  assert.match(src, /WATCH_DEBOUNCE_MS = 150/, 'one write fires twice');
  assert.match(src, /closeOwnerRecordWatcher\(\);\n  disposed = false;/, 'the previous watcher is closed before a new one opens');
  assert.match(src, /if \(!disposed\) onChange\(\)/, 'a late event does not touch a torn-down plugin');
});

test('L-1, L-2, L-3: the write is a uniquely named 0600 temp file renamed over the target', () => {
  const src = read('src/electron/ownerRecord.ts');
  const write = src.indexOf('writeFileSync(tmpPath');
  const rename = src.indexOf('renameSync(tmpPath, recordPath)');
  assert.ok(write >= 0 && rename >= 0 && write < rename, 'temp first, then rename');
  assert.match(src, /mode: 0o600/, 'the mode of the temp file is the mode the record ends up with');
  assert.match(src, /Math\.random\(\)/, 'two vaults can click in the same second');
  assert.doesNotMatch(src, /writeFileSync\(recordPath/, 'a direct write follows a planted symlink');
});

test('M-1: every registry path goes through the validator before it reaches fs', () => {
  const src = read('src/electron/vaultRegistry.ts');
  assert.match(src, /includes\('\\0'\)/, 'a NUL is refused');
  assert.match(src, /isAbsolute\(raw\)/, 'a relative path is refused');
  assert.match(src, /includes\('\.\.'\)/, 'a parent segment is refused before resolve hides it');
  assert.match(src, /realpathSync\.native/, 'a symlinked vault entry is refused');
  assert.match(src, /isDirectory\(\)/, 'a file is not a vault');
  assert.match(src, /O_NOFOLLOW/, 'the one cross-vault read refuses to follow a link');
  const guard = src.indexOf('const dir = safeVaultDir(node, entry.path);');
  const join = src.indexOf("node.path.join(dir, configDir,");
  assert.ok(guard >= 0 && join >= 0 && guard < join, 'the join happens on the validated directory');
  /* The comment header names data.json to say it is NOT read, so the check
     runs on the code. */
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(code, /data\.json/, 'M-4: no other vault data file is read at all');
});

test('M-4 and the lazy read: the registry is never read at load', () => {
  const main = read('src/main.ts');
  assert.doesNotMatch(main, /listVaults|vaultRegistry/, 'main.ts never reaches the registry');
  const tab = read('src/settings/SettingsTab.ts');
  assert.match(tab, /Show other vaults/, 'the list is behind a click');
  const button = tab.indexOf("'Show other vaults'");
  const call = tab.indexOf('listVaults(node');
  assert.ok(button >= 0 && call >= 0 && button < call, 'the read follows the click');
});
