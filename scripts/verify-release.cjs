'use strict';
// Reproducible development evidence. Never connects to an election database.
const fs=require('node:fs'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const tests=[
 ['access','scripts/check-hardening.cjs','Accessi revocati, ruoli/anno, preferenze, congelamento e completezza dei rapporti.'],
 ['voting','scripts/check-consultations.cjs','Lotti, ammissione, indipendenza, sospensione/ripresa, anonimizzazione applicativa, doppio voto, tempi e ricevuta.'],
 ['pagination','scripts/check-technical-export.cjs','205 registrazioni, paginazione completa e interruzione senza esportazione parziale.'],
 ['acts','scripts/check-consultation-documents.cjs','Atti e orari diversi nei verbali di ottobre e novembre.'],
 ['browser-source','scripts/check-privacy-surface.cjs','Sorgente della persistenza, API senza cookie né inoltro del voto a servizi alternativi.'],
 ['technical-pdf','scripts/check-legal-evidence.cjs','PDF effettivo con identificativi, ammissione ed evidenze non inventate.'],
 ['dpo-archive','scripts/check-dpo-dossier.cjs','PDF/ZIP effettivi, manifest verificabile, dati mancanti e fallimento dell’esportazione incompleta.']
];
const evidence=[];
for(const [id,script,requirement]of tests){
 const started=new Date().toISOString(),r=spawnSync(process.execPath,[script],{encoding:'utf8',timeout:60000});
 evidence.push({id,requirement,method:'Esecuzione del codice in '+script+' con dati fittizi; dipendenze Firebase simulate dove necessario.',expected:'Asserzioni completate senza errori.',observed:(r.stdout||'').trim(),outcome:r.status===0?'PASS':'FAIL',testedAt:started,operator:'Verifica automatica di sviluppo (non collaudatore indipendente)',node:process.version});
 console.log(id,r.status===0?'PASS':'FAIL');if(r.status!==0)throw new Error(r.stderr||r.error||script+' failed');
}
const node22=process.env.LEVI_NODE22;
if(node22){const r=spawnSync(node22,['--no-experimental-require-module','-e',"require('./functions/core');require('./api/call');console.log(process.version)"],{encoding:'utf8',timeout:30000});if(r.status!==0)throw new Error('Node 22 cold import failed: '+r.stderr);evidence.push({id:'node22-cold-import',requirement:'Avvio CommonJS del backend nel runtime Node 22 senza require ESM sperimentale.',method:'Import reale di functions/core e api/call, nessuna richiesta al database.',expected:'Nessun ERR_REQUIRE_ESM.',observed:'Import riuscito: '+r.stdout.trim(),outcome:'PASS',testedAt:new Date().toISOString(),operator:'Verifica automatica di sviluppo'});}
const audit=spawnSync('npm',['audit','--omit=dev','--json'],{encoding:'utf8',timeout:45000});
let auditData;try{auditData=JSON.parse(audit.stdout);}catch(_){throw new Error('npm audit non completato');}
if(!auditData.metadata?.vulnerabilities||audit.status!==0)throw new Error('npm audit richiede valutazione: '+JSON.stringify(auditData.metadata?.vulnerabilities));
evidence.push({id:'dependencies',requirement:'Segnalazioni note nel lockfile npm delle dipendenze Production.',method:'npm audit --omit=dev --json',expected:'Nessuna segnalazione nota nel perimetro npm.',observed:JSON.stringify(auditData.metadata.vulnerabilities),outcome:'PASS',testedAt:new Date().toISOString(),operator:'Verifica automatica di sviluppo',limitation:'Non copre SDK remoti, librerie vendorizzate, configurazione cloud o vulnerabilità non note.'});
const files=['index.html','functions/core.js','api/call.js','firestore.rules','vercel.json','package-lock.json',...fs.readdirSync('lib').map(n=>'lib/'+n),...tests.map(t=>t[1]),'scripts/verify-release.cjs'];
const source=files.filter(p=>fs.statSync(p).isFile()).map(path=>({path,sha256:crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex')}));
fs.writeFileSync('docs/verifiche-sviluppo.json',JSON.stringify({format:'LEVI_DEVELOPMENT_EVIDENCE_V2',generatedAt:new Date().toISOString(),evidence,source,notVerified:['Browser reale e dispositivi della scuola: browser di prova non disponibile in questo ambiente.','Firebase Rules distribuite, IAM/MFA e log dei provider Production.','Backup, ripristino reale, custodi e conservazione scolastica.','Distribuzione fisica dei codici, non correlabilità dell’intera infrastruttura e verifica indipendente.','Validità degli atti, nomine, DPIA e parere DPO.'],privacy:'Nessun accesso a voti reali, creazione di credenziali reali, migrazione o apertura elettorale durante queste prove.'},null,2)+'\n');
console.log('Development evidence saved; actual software release is identified separately by the deployment commit.');
