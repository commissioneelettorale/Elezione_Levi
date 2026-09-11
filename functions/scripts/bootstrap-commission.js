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

if (!getApps().length) initializeApp();
const db = getFirestore();

const APP_ID = 'iis-levi-electoral-v3';
const YEAR = '2026/2027';
const USERNAME = 'commissione.presidente';
const DISPLAY_NAME = 'Presidente Commissione Elettorale';
const ROLE = 'COMMISSIONE';
const PASSWORD_SALT = 'f759600a6eb94822d3f6411f05772bb5f98d0fae33919faf';
const PASSWORD_HASH = 'fecb7feba555566bf2fd17ee6f5ae84c3e793f9fa815794050fe0b2301ecdaab3f526caf7bb4322aff3271efe67e38757ecc08a92982a2857ef360495370575c';

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

  const ref = collection.doc();
  await ref.set({
    name: DISPLAY_NAME,
    username: USERNAME,
    role: ROLE,
    scopeClass: 'TUTTE',
    active: true,
    passwordHash: PASSWORD_HASH,
    passwordSalt: PASSWORD_SALT,
    mustChangePassword: true,
    bootstrapAccount: true,
    bootstrapVersion: '2026-09-04c',
    createdAt: FieldValue.serverTimestamp(),
    createdBy: 'SECURE_BOOTSTRAP_DEPLOY'
  });

  console.log(`Bootstrap Commissione completato: ${USERNAME} (${ref.id}).`);
  console.log('La password in chiaro non è presente nel repository né nei log del workflow. Cambio obbligatorio al primo accesso.');
})().catch((err) => {
  console.error('Bootstrap Commissione fallito:', err && err.message ? err.message : err);
  process.exit(1);
});
