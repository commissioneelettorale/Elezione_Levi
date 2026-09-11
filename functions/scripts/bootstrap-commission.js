'use strict';

/**
 * Bootstrap one-time dell'account iniziale della Commissione.
 *
 * IMPORTANTE:
 * - nel repository NON è presente la password in chiaro;
 * - è presente esclusivamente un verificatore scrypt con salt casuale;
 * - l'account nasce con mustChangePassword=true;
 * - al primo accesso la Commissione deve sostituire la password prima di usare
 *   qualunque funzione amministrativa.
 */
const { initializeApp, getApps } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const crypto = require('crypto');

if (!getApps().length) initializeApp();
const db = getFirestore();

const APP_ID = 'iis-levi-electoral-v3';
const YEAR = '2026/2027';
const USERNAME = 'commissione.presidente';
const DISPLAY_NAME = 'Presidente Commissione Elettorale';
const ROLE = 'COMMISSIONE';
const INITIAL_PASSWORD = String(process.env.COMMISSIONE_INITIAL_PASSWORD || '');

function collectionForYear(year) {
  const suffix = year.replace('/', '_');
  return db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection(`gestione_accessi_${suffix}`);
}

(async () => {
  const collection = collectionForYear(YEAR);
  const existing = await collection.where('username', '==', USERNAME).limit(1).get();
  if (!existing.empty) {
    console.log(`Bootstrap Commissione: account ${USERNAME} già presente; nessuna credenziale è stata sovrascritta.`);
    process.exit(0);
  }

  if (
    INITIAL_PASSWORD.length < 16 ||
    !/[A-Z]/.test(INITIAL_PASSWORD) ||
    !/[a-z]/.test(INITIAL_PASSWORD) ||
    !/[0-9]/.test(INITIAL_PASSWORD) ||
    !/[^A-Za-z0-9]/.test(INITIAL_PASSWORD)
  ) {
    console.error('La secret COMMISSIONE_INITIAL_PASSWORD deve contenere almeno 16 caratteri, maiuscole, minuscole, numeri e simboli.');
    process.exit(2);
  }

  const passwordSalt = crypto.randomBytes(24).toString('hex');
  const passwordHash = crypto.scryptSync(INITIAL_PASSWORD, passwordSalt, 64).toString('hex');
  const ref = collection.doc();
  await ref.set({
    name: DISPLAY_NAME,
    username: USERNAME,
    role: ROLE,
    scopeClass: 'TUTTE',
    active: true,
    passwordHash,
    passwordSalt,
    mustChangePassword: true,
    bootstrapAccount: true,
    bootstrapVersion: '2026-09-11a',
    createdAt: FieldValue.serverTimestamp(),
    createdBy: 'SECURE_BOOTSTRAP_DEPLOY'
  });

  console.log(`Bootstrap Commissione completato: ${USERNAME} (${ref.id}).`);
  console.log('La password arriva esclusivamente dalla secret GitHub e non viene scritta nel repository né nei log. Cambio obbligatorio al primo accesso.');
})().catch((err) => {
  console.error('Bootstrap Commissione fallito:', err && err.message ? err.message : err);
  process.exit(1);
});
