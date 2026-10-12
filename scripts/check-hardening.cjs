'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
let record={active:true,role:'COMMISSIONE'}, oldConfig={}, reg={}, writes=0;
class HttpsError extends Error { constructor(code,message){super(message);this.code=code;} }
const ref={collection(){return this},doc(){return this},async get(){return {exists:true,data:()=>record}}};
const db={collection:()=>ref,runTransaction:async fn=>{let n=0;return fn({get:async()=>({exists:true,data:()=>++n===1?oldConfig:reg}),set:()=>{writes++}})}};
const context={__dirname:require('node:path').resolve('functions'),exports:{},require:n=>n.startsWith('../lib/')?require(n):n==='crypto'||n.startsWith('node:')?require(n):n==='firebase-functions/v2/https'?{HttpsError}:n==='firebase-admin/app'?{getApps:()=>[{}]}:n==='firebase-admin/firestore'?{getFirestore:()=>db,FieldValue:{serverTimestamp:()=>0}}:{getAuth:()=>({})},console,Date,Buffer,Intl,Set,Map,process:{env:{}}};
vm.createContext(context);vm.runInContext(fs.readFileSync('functions/core.js','utf8')+'\nexports.test={requireAuth,rejectExtraPreferences,assertAppealDeadlineElapsed,romeToday,validateTechnicalReport,TECHNICAL_TEST_IDS};',context);
const t=context.exports.test,request={auth:{uid:'test',token:{role:'COMMISSIONE',staffYear:'2026/2027',staffAccountId:'test'}},data:{annoScolastico:'2026/2027'}};
(async()=>{
await t.requireAuth(request,['COMMISSIONE']);
for(const name of ['getDpoDossierMaterials','getDpoReviewProfile','getPrivateTechnicalDocument']){
 await assert.rejects(context.exports[name]({data:{}}),e=>e.code==='unauthenticated');
 await assert.rejects(context.exports[name]({...request,auth:{...request.auth,token:{...request.auth.token,role:'STUDENTE'}}}),e=>e.code==='permission-denied');
}
const materials=await context.exports.getDpoDossierMaterials(request);assert.equal(materials.sections.length,14);assert.ok(JSON.parse(materials.inventory).assets.length);
await assert.rejects(context.exports.getDpoDossierMaterials({...request,auth:{...request.auth,token:{...request.auth.token,role:'ASSISTENTE_TECNICO'}}}),e=>e.code==='permission-denied');
await assert.rejects(context.exports.getPrivateTechnicalDocument({...request,data:{...request.data,document:'../../.env'}}),e=>e.code==='invalid-argument');

record.active=false;await assert.rejects(t.requireAuth(request,['COMMISSIONE']),e=>e.code==='permission-denied');record.active=true;
record.sessionVersion=1;await assert.rejects(t.requireAuth(request,['COMMISSIONE']),e=>e.code==='permission-denied');record.sessionVersion=0;
await assert.rejects(t.requireAuth({...request,data:{annoScolastico:'2027/2028'}},['COMMISSIONE']),e=>e.code==='permission-denied');
await assert.rejects(context.exports.saveElectionConfig({...request,data:{annoScolastico:'2026/2027',config:{annoScolastico:'2027/2028'}}}),e=>e.code==='permission-denied');
await assert.rejects(context.exports.saveElectionConfig({...request,data:{annoScolastico:'2027/2028',config:{annoScolastico:'2026/2027'}}}),e=>e.code==='permission-denied');
assert.equal(writes,0,'Conflicting school years must never reach a database write');
assert.throws(()=>t.rejectExtraPreferences({p3:'EXTRA'},'p',2));t.rejectExtraPreferences({p1:'VALID'},'p',2);
assert.throws(()=>t.assertAppealDeadlineElapsed({resultsPublished:true,appealDeadline:t.romeToday()}));
t.assertAppealDeadlineElapsed({resultsPublished:true,appealDeadline:'2020-01-01'});
oldConfig={listeIstituto:{A:[]}};reg={softwareFrozen:true};
await assert.rejects(context.exports.saveElectionConfig({...request,data:{annoScolastico:'2026/2027',config:{annoScolastico:'2026/2027',listeIstituto:{B:[]}}}}),e=>e.code==='failed-precondition');assert.equal(writes,0);
const report={softwareVersion:'commit-test',evidenceRef:'TEST-001',testEnvironment:'ISOLATED_TEST',tests:Object.fromEntries(t.TECHNICAL_TEST_IDS.map(id=>[id,{outcome:'NOT_TESTED',evidence:''}]))};
assert.equal(t.validateTechnicalReport(report).result,'NON_COMPLETO');
report.tests.identity={outcome:'PASS',evidence:''};assert.throws(()=>t.validateTechnicalReport(report));
for(const id of t.TECHNICAL_TEST_IDS) report.tests[id]={outcome:'PASS',evidence:'Test con dati fittizi',method:'Simulazione',expected:'Esito previsto',observed:'Esito previsto',testedAt:new Date().toISOString()};
assert.equal(t.validateTechnicalReport(report).result,'PROVE_DICHIARATE_SUPERATE');
report.tests.anonymity={...report.tests.anonymity,outcome:'FAIL',evidence:'Separazione non dimostrata'};assert.equal(t.validateTechnicalReport(report).result,'NON_SUPERATO');
report.tests.anonymity.outcome='INVALID';assert.throws(()=>t.validateTechnicalReport(report));
assert.throws(()=>t.validateTechnicalReport({...report,testEnvironment:'PRODUCTION'}));
await assert.rejects(context.exports.recordTechnicalTestReport({data:report}),e=>e.code==='unauthenticated');
console.log('PASS: technical report outcomes, evidence requirements and authorization.');
console.log('PASS: active/revoked/versioned accounts; year isolation; preference limits; appeal dates; frozen lists.');
})().catch(e=>{console.error(e);process.exitCode=1});
