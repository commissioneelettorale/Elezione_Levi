'use strict';
// Regression checks run in Vercel build against real helper code and page sources.
// All dates, sessions and records are synthetic: no production API/DB calls.
const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const ElectionPolicy=require('../lib/election-policy'),NoLists=require('../lib/no-lists');
const backend=fs.readFileSync('functions/core.js','utf8');
const begin=backend.indexOf('const VOTED_FLAGS=Object.freeze('),finish=backend.indexOf('async function auditAdmin(',begin);
assert.ok(begin>0&&finish>begin);
class HttpsError extends Error{constructor(code,message){super(message);this.code=code;}}
const context={ElectionPolicy,NoLists,HttpsError,normalize:v=>String(v||'').trim().toUpperCase()};
vm.createContext(context);
vm.runInContext(backend.slice(begin,finish)+'\nthis.testing={activeVoterKeys,eligibleCredentialEnd,assertCredentialStillUsable,referentEndMs};',context);
const {activeVoterKeys,eligibleCredentialEnd,assertCredentialStillUsable,referentEndMs}=context.testing;
const config={annoScolastico:'2026/2027',rappresentantiIstitutoAttivo:true,consultaAttiva:true,
 rappresentantiClasseStudentiAttivo:true,rappresentantiClasseGenitoriAttivo:true,
 consultazioni:{
  istituto:{dedicated:true,period:'NOVEMBRE',kind:'RINNOVO',windows:[{date:'2026-11-13',from:'10:00',to:'12:00'}]},
  consulta:{dedicated:true,period:'OTTOBRE',kind:'SUPPLETIVE',windows:[{date:'2026-10-13',from:'09:00',to:'11:00'}]},
  classeStudente:{dedicated:true,period:'OTTOBRE',kind:'RINNOVO',windows:[{date:'2026-10-13',from:'09:00',to:'12:00'}]},
  classeGenitore:{dedicated:true,period:'OTTOBRE',kind:'RINNOVO',windows:[{date:'2026-10-13',from:'14:00',to:'16:00'}]}
 }};
const date=(day,time)=>+ElectionPolicy.localDate(day,time);
const now=Date.now;function time(fake,fn){const previous=context.Date;class FakeDate extends Date{static now(){return fake;}}context.Date=FakeDate;try{return fn();}finally{context.Date=previous;}}
const student={tipo:'STUDENTE',voted_istituto:false,voted_consulta:false,voted_classe_studente:false};
assert.equal(eligibleCredentialEnd(config,activeVoterKeys(config,'STUDENTE',student)),date('2026-11-13','12:00'));
time(date('2026-10-13','12:01'),()=>assert.equal(assertCredentialStillUsable(config,student).length,3,
 'Shared code remains valid for November election even after October class/consulta close'));
time(date('2026-11-13','12:00'),()=>assert.throws(()=>assertCredentialStillUsable(config,student),e=>e.code==='failed-precondition'&&/scaduto/.test(e.message)));
time(date('2026-10-13','11:00'),()=>assert.throws(()=>assertCredentialStillUsable(config,{
 ...student,voted_istituto:true,voted_consulta:true,voted_classe_studente:true
}),e=>e.code==='failed-precondition'&&/esaurita/.test(e.message)));
assert.equal(referentEndMs(config,'STUDENTE'),date('2026-10-13','12:00'));
assert.equal(referentEndMs(config,'GENITORE'),date('2026-10-13','16:00'));
console.log('PASS: exact Rome deadlines, multi-election code validity, exhausted voter codes and separate referent expiries.');
const html=fs.readFileSync('index.html','utf8'),main=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
assert.ok(main);
new vm.Script(main.replace(/^\s*import .*;\s*$/gm,''));
assert.match(main,/window\.setClassNoElected=async function/);
assert.match(main,/window\.downloadNoElectedClassPDF=async function/);
assert.match(main,/const noElectedAdminHtml|let noElectedAdminHtml/);
assert.match(main,/NESSUNO ELETTO/);
assert.match(main,/PDF_Verbali/);
assert.match(main,/MANIFEST_SHA256\.json/);
const zip=main.slice(main.indexOf('window.downloadEntireYearArchive'),main.indexOf('window.executeDatabase',main.indexOf('window.downloadEntireYearArchive')));
assert.doesNotMatch(zip,/zip\.file\(["']registro_completo_token/);
assert.doesNotMatch(zip,/zip\.file\(\x60registro_token_/);
assert.match(zip,/getNoElectedClasses/);
assert.match(zip,/crypto\.subtle\.digest\('SHA-256'/);
const allow=fs.readFileSync('api/call.js','utf8');
assert.match(allow,/"setNoElectedClass"/);assert.match(allow,/"getNoElectedClasses"/);
console.log('PASS: full browser code parses, authenticated class statuses, detailed PDF and ZIP manifest; no raw token registers shipped.');
