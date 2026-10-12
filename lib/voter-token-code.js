'use strict';
const crypto = require('node:crypto');
const PREFIXES = Object.freeze({ STUDENTE: 'STU', GENITORE: 'GEN', DOCENTE: 'DOC', ATA: 'ATA' });
// Avoid characters that are easily confused when copied from a paper slip.
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ', DIGITS = '23456789', ALPHABET = LETTERS + DIGITS;
const FORMAT = 'LEVI_VOTER_CODE_6_V1';
function failure(message) { return Object.assign(new Error(message), { code: 'resource-exhausted' }); }
function generate(tipo, randomInt = crypto.randomInt) {
  if (!PREFIXES[tipo]) throw new Error('Componente elettorale non valida.');
  const chars = [LETTERS[randomInt(LETTERS.length)], DIGITS[randomInt(DIGITS.length)]];
  for (let i = 2; i < 6; i++) chars.push(ALPHABET[randomInt(ALPHABET.length)]);
  for (let i = chars.length - 1; i > 0; i--) { const j = randomInt(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return PREFIXES[tipo] + '-' + chars.join('');
}
function matches(code, tipo) {
  return !!PREFIXES[tipo] && new RegExp('^' + PREFIXES[tipo] + '-[A-Z0-9]{6}$').test(code);
}
async function readAll(tx, refs) {
  if (!refs.length) return [];
  return typeof tx.getAll === 'function' ? tx.getAll(...refs) : Promise.all(refs.map(ref => tx.get(ref)));
}
async function allocate(tx, collection, tipo, count, { randomInt = crypto.randomInt, documentId = code => code } = {}) {
  const accepted = [], attempted = new Set();
  for (let round = 0; round < 12 && accepted.length < count; round++) {
    const candidates = [];
    for (let tries = 0; candidates.length < count - accepted.length; tries++) {
      if (tries >= Math.max(2000, count * 20)) throw failure('Generazione codici non completata. Riprovare.');
      const code = generate(tipo, randomInt);
      if (!attempted.has(code)) { attempted.add(code); candidates.push(code); }
    }
    const snapshots = await readAll(tx, candidates.map(code => collection.doc(documentId(code))));
    snapshots.forEach((snapshot, i) => { if (!snapshot.exists) accepted.push(candidates[i]); });
  }
  if (accepted.length !== count) throw failure('Impossibile assegnare codici univoci. Riprovare.');
  return accepted;
}
function migrationPending(state) { return ['RUNNING', 'FAILED'].includes(state?.tokenCodeMigration?.status); }
module.exports = { PREFIXES, FORMAT, generate, matches, allocate, readAll, migrationPending };
