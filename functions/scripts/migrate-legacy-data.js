#!/usr/bin/env node
'use strict';

/**
 * Bonifica i dati prodotti da versioni precedenti.
 * Esegue DRY-RUN di default. Usare --apply soltanto dopo backup e autorizzazione verbalizzata.
 */
const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();
const APP_ID = 'iis-levi-electoral-v3';
const apply = process.argv.includes('--apply');
const yi = process.argv.indexOf('--year');
const year = yi >= 0 && process.argv[yi + 1] ? process.argv[yi + 1] : '2026/2027';
const suffix = year.replace('/', '_');
const root = db.collection('artifacts').doc(APP_ID).collection('public').doc('data');
const forbiddenTokenFields = [
  'vote_id_consiglio','vote_id_istituto','vote_id_consulta','vote_id_classe_studente','vote_id_classe_genitore',
  'activeSessionHash','sessionExpiresAt'
];
const forbiddenBallotFields = [
  'token','tokenHash','tokenDocId','sessionId','sessionHash','nome','email','uid','userId',
  'createdAt','updatedAt','timestamp','dataVoto','ip','userAgent','ballotId','documentId'
];
const ballots = ['voti_consiglio','voti_istituto','voti_consulta','voti_classe_studenti','voti_classe_genitori'];

(async () => {
  console.log(`${apply ? 'APPLY' : 'DRY-RUN'} - A.S. ${year}`);
  let changes = 0;
  const tokenSnap = await root.collection(`tokens_${suffix}`).get();
  for (const doc of tokenSnap.docs) {
    const d = doc.data();
    const hits = forbiddenTokenFields.filter((f) => Object.prototype.hasOwnProperty.call(d, f));
    if (hits.length) {
      console.log(`Token ${doc.id}: rimuovere ${hits.join(', ')}`);
      changes++;
      if (apply) {
        const update = {}; hits.forEach((f) => { update[f] = admin.firestore.FieldValue.delete(); });
        await doc.ref.update(update);
      }
    }
  }
  for (const name of ballots) {
    const snap = await root.collection(`${name}_${suffix}`).get();
    for (const doc of snap.docs) {
      const d = doc.data();
      const hits = forbiddenBallotFields.filter((f) => Object.prototype.hasOwnProperty.call(d, f));
      if (hits.length) {
        console.log(`${name}/${doc.id}: rimuovere ${hits.join(', ')}`);
        changes++;
        if (apply) {
          const update = {}; hits.forEach((f) => { update[f] = admin.firestore.FieldValue.delete(); });
          await doc.ref.update(update);
        }
      }
    }
  }
  console.log(`Elementi da bonificare: ${changes}.`);
  if (!apply) console.log('Nessuna modifica eseguita. Ripetere con --apply solo dopo backup/verbale.');
})().catch((err) => { console.error(err); process.exit(1); });
