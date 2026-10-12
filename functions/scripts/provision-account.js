#!/usr/bin/env node
'use strict';

/**
 * Provisiona un account istituzionale iniziale senza inserire password nel sito o nel repository.
 * Richiede GOOGLE_APPLICATION_CREDENTIALS oppure credenziali ADC Firebase/GCP.
 *
 * Esempio PowerShell:
 *   $env:PROVISION_PASSWORD="UnaPasswordLunga-Unica-2026!"
 *   node functions/scripts/provision-account.js --year 2026/2027 --role COMMISSIONE --username commissione.presidente --name "Presidente Commissione"
 *   Remove-Item Env:PROVISION_PASSWORD
 */
const admin = require('firebase-admin');
const crypto = require('crypto');
admin.initializeApp();
const db = admin.firestore();
const APP_ID = 'iis-levi-electoral-v3';

function arg(name, fallback = '') {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const year = arg('year', '2026/2027');
const role = arg('role', 'COMMISSIONE').trim().toUpperCase();
const username = arg('username').trim().toLowerCase();
const name = arg('name', username).trim();
const scopeClass = arg('scope', 'TUTTE').trim().toUpperCase();
const password = process.env.PROVISION_PASSWORD || '';
const allowed = new Set(['COMMISSIONE','DIRIGENTE','VICEPRESIDE','DSGA','SEGRETERIA']);
const managementRoles = new Set(['DIRIGENTE','VICEPRESIDE','DSGA','SEGRETERIA']);

if (!/^20\d{2}\/20\d{2}$/.test(year) || !allowed.has(role) || !username || !name) {
  console.error('Argomenti non validi. Specificare --year, --role, --username e --name.');
  process.exit(2);
}
if (password.length < 12) {
  console.error('Impostare PROVISION_PASSWORD con una password personale di almeno 12 caratteri.');
  process.exit(2);
}

(async () => {
  const suffix = year.replace('/', '_');
  const collection = db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection(`gestione_accessi_${suffix}`);
  const existing = await collection.where('username', '==', username).limit(1).get();
  if (!existing.empty) {
    console.error(`Account ${username} già presente.`);
    process.exit(3);
  }
  const salt = crypto.randomBytes(24).toString('hex');
  const passwordHash = crypto.scryptSync(password, salt, 64).toString('hex');
  const ref = collection.doc();
  const endYear = Number(year.split('/')[1]);
  // Scadenza a inizio 1 settembre UTC: il backend applicativo usa Europe/Rome e,
  // per il provisioning, la policy documentale resta il 31 agosto dell'A.S.
  const expiresAt = managementRoles.has(role) ? admin.firestore.Timestamp.fromDate(new Date(`${endYear}-09-01T00:00:00+02:00`)) : null;
  await ref.set({
    name, username, passwordHash, passwordSalt: salt, role, scopeClass,
    active: true,
    ...(expiresAt ? { expiresAt, expiryPolicy: 'FINE_ANNO_SCOLASTICO' } : {}),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdBy: 'OFFLINE_PROVISIONING'
  });
  console.log(`Creato account ${role}: ${username} (${ref.id}).`);
  console.log('La password NON è stata scritta nel repository né nei log applicativi.');
})().catch((err) => { console.error(err); process.exit(1); });
