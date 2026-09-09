/* Where the note lives and what one capture appends. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { appendLine, dailyNotePath, renderAppend } from './build/pure.mjs';

test('the daily note path joins folder and formatted name; no folder means the vault root', () => {
  assert.equal(dailyNotePath('04 Inner World/Journal/2026/09', '2026-09-09'), '04 Inner World/Journal/2026/09/2026-09-09.md');
  assert.equal(dailyNotePath('', '2026-09-09'), '2026-09-09.md');
});

test('the default template yields a timed list item', () => {
  assert.equal(renderAppend('- {{time}} {{text}}', 'call the dentist', '14:05'), '- 14:05 call the dentist');
});

test('a multi-line capture keeps its line breaks and loses trailing whitespace only', () => {
  assert.equal(renderAppend('- {{time}} {{text}}', 'one\r\ntwo  \n\n', '09:00'), '- 09:00 one\ntwo');
  assert.equal(renderAppend('{{text}}', '  indented', '09:00'), '  indented', 'leading whitespace is the member\'s');
});

test('a template may repeat a placeholder or omit the time', () => {
  assert.equal(renderAppend('{{time}} {{text}} ({{time}})', 'x', '10:00'), '10:00 x (10:00)');
  assert.equal(renderAppend('> {{text}}', 'quoted', '10:00'), '> quoted');
});

test('appending always starts on its own line and ends the file with one newline', () => {
  assert.equal(appendLine('', '- a'), '- a\n');
  assert.equal(appendLine('# Day\n', '- a'), '# Day\n- a\n');
  assert.equal(appendLine('# Day', '- a'), '# Day\n- a\n');
  assert.equal(appendLine('# Day\n- a\n', '- b'), '# Day\n- a\n- b\n');
});
