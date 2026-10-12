#!/usr/bin/env node
'use strict';

/** Controllo pre-produzione senza stampare il contenuto dei voti. */
const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();
const APP_ID='iis-levi-electoral-v3';
const yi=process.argv.indexOf('--year');
const year=yi>=0&&process.argv[yi+1]?process.argv[yi+1]:'2026/2027';
const suffix=year.replace('/','_');
const root=db.collection('artifacts').doc(APP_ID).collection('public').doc('data');
const ballotCols=['voti_consiglio','voti_istituto','voti_consulta','voti_classe_studenti','voti_classe_genitori'];
const forbidden=new Set(['token','tokenHash','tokenDocId','sessionId','sessionHash','nome','email','uid','userId','createdAt','updatedAt','timestamp','dataVoto','ip','userAgent','ballotId','documentId']);
(async()=>{
  let ok=true;
  const cfg=await root.collection('config').doc(`yearly_settings_${suffix}`).get();
  console.log(`Configurazione annuale: ${cfg.exists?'OK':'MANCANTE'}`); if(!cfg.exists) ok=false;
  const tokens=await root.collection(`tokens_${suffix}`).get();
  console.log(`Aventi diritto/token: ${tokens.size}`);
  for(const col of ballotCols){
    const snap=await root.collection(`${col}_${suffix}`).get();
    let unsafe=0;
    snap.forEach(d=>{if(Object.keys(d.data()).some(k=>forbidden.has(k))) unsafe++;});
    console.log(`${col}: ${snap.size} schede; documenti con metadati vietati=${unsafe}`);
    if(unsafe) ok=false;
  }
  console.log(ok?'PREFLIGHT TECNICO: OK':'PREFLIGHT TECNICO: NON SUPERATO');
  process.exit(ok?0:4);
})().catch(e=>{console.error(e);process.exit(1);});
