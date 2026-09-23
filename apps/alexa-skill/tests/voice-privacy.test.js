const test = require('node:test');
const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const { join } = require('node:path');

// Keeps the policy test independent of the Lambda build tooling.
const forbiddenValuePatterns = [/R\$/i, /\d/, /%/];

test('qualitative voice replies never expose financial values', () => {
  const replies = [
    'O resultado da carteira Bianca está positivo. Toque na tela para ver os detalhes.',
    'A maior classe da carteira Família é ações. Toque na tela para ver a composição.',
    'A carteira Sergio está estável. Toque na tela para ver os detalhes.'
  ];

  for (const reply of replies) {
    for (const pattern of forbiddenValuePatterns) {
      assert.doesNotMatch(reply, pattern);
    }
  }
});

test('voice policy does not interpolate arbitrary API labels into speech', async () => {
  const source = await readFile(
    join(__dirname, '../lambda/src/services/voice.ts'),
    'utf8'
  );

  assert.match(source, /const allocationLabels/);
  assert.doesNotMatch(source, /\$\{status\.largestAllocationLabel\}/);
  assert.doesNotMatch(source, /\$\{status\./);
});

test('error response is qualitative even when the API throws', async () => {
  const source = await readFile(join(__dirname, '../lambda/src/index.ts'), 'utf8');
  const errorSpeech = source.match(/\.speak\('([^']+)'\)/)?.[1];

  assert.ok(errorSpeech);
  for (const pattern of forbiddenValuePatterns) {
    assert.doesNotMatch(errorSpeech, pattern);
  }
});

test('touch navigation re-renders views with values masked by default', async () => {
  const [widget, detail, handlers] = await Promise.all([
    readFile(join(__dirname, '../dataStorePackages/MinhaCarteiraWidget/documents/document.json'), 'utf8'),
    readFile(join(__dirname, '../lambda/src/apl/detail-document.json'), 'utf8'),
    readFile(join(__dirname, '../lambda/src/handlers/portfolio-handlers.ts'), 'utf8')
  ]);

  assert.match(widget, /"bind": \[\{ "name": "showValues", "value": false \}\]/);
  assert.match(detail, /"bind": \[\{ "name": "showValues", "value": false \}\]/);
  assert.match(handlers, /action === 'select-profile' \|\| action === 'show-details'/);
  assert.match(handlers, /await renderMasked\(input, profile\)/);
});
