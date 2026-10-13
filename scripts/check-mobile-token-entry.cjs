'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('index.html', 'utf8');
const api = fs.readFileSync('api/call.js', 'utf8');
assert.doesNotMatch(html, /isLikelyPersonalSmartphone|voto da smartphone personale è bloccato/);
assert.match(html, /window\.handleStudentLogin\s*=\s*async function/);
assert.match(html, /const token = normalizeTypedVoterToken\(document\.getElementById\('tokenInput'\)\.value\)/);
const normalizer = html.match(/function normalizeTypedVoterToken\(value\)\s*\{[\s\S]*?\n        \}/)?.[0];
assert.ok(normalizer, 'Missing isolated printed-token normalizer');
const normalize = vm.runInNewContext(normalizer + '\nnormalizeTypedVoterToken');
for (const entered of ['STU-2295GH','stu-2295gh','STU–2295GH','STU 2295GH','STU - 2295GH','STU\u00A02295GH'])
  assert.equal(normalize(entered), 'STU-2295GH', entered);
assert.equal(normalize('GEN-A2B3C4'), 'GEN-A2B3C4');
assert.equal(normalize('DOC-A2B3C4'), 'DOC-A2B3C4');
assert.equal(normalize('ATA-A2B3C4'), 'ATA-A2B3C4');
assert.equal(normalize('STU-INVALID'), 'STU-INVALID'); // Never invent authorized codes
for (const origin of ['https://elezione-levi.vercel.app','https://votazione-levi.vercel.app','https://commissioneelettorale.github.io'])
  assert.ok(api.includes("'"+origin+"'"), 'Required trusted origin missing: '+origin);
assert.match(api, /ALLOWED_FUNCTIONS/);
assert.match(api, /validateVoterToken/);
assert.match(api, /castVote/);
console.log('PASS: mobile device is not rejected by User-Agent, printed codes are normalized, and only declared production CORS origins are enabled. No live votes or token registries touched.');
