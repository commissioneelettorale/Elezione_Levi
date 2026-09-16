'use strict';
// Actual import handler and client batching, isolated in memory: no real database.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const register=require('../lib/voter-register');
const year='2026/2027',root='artifacts/iis-levi-electoral-v3/public/data';
const path=(name,id)=>`${root}/${name}_2026_2027/${id}`;
const configPath=`${root}/config/yearly_settings_2026_2027`,statePath=path('regolarita','state'),accountPath=path('gestione_accessi','commission');
const now=Date.parse('2026-09-16T10:00:00Z');
class TestDate extends Date{static now(){return now;}}
class HttpsError extends Error{constructor(code,message){super(message);this.code=code;}}
let records=new Map(),counter=0,commitFailure=false,beforeTransaction=null,queue=Promise.resolve(),forceCollision=false;
const testCrypto={...crypto,randomBytes:size=>forceCollision?Buffer.alloc(size,7):crypto.randomBytes(size)};
class Ref{
 constructor(path,max=Infinity){this.path=path;this.max=max;this.id=path.split('/').pop();}
 collection(name){return new Ref(this.path+'/'+name);}
 doc(id='auto-'+(++counter)){return new Ref(this.path+'/'+id);}
 limit(max){return new Ref(this.path,max);}
 async get(){
  if(this.path.split('/').length%2===0){const data=records.get(this.path);return{exists:data!==undefined,id:this.id,data:()=>structuredClone(data)};}
  const docs=[...records].filter(([key])=>key.startsWith(this.path+'/')&&!key.slice(this.path.length+1).includes('/')).slice(0,this.max).map(([key,data])=>({id:key.split('/').pop(),data:()=>structuredClone(data)}));
  return{docs,empty:!docs.length,size:docs.length};
 }
}
const db={collection:name=>new Ref(name),runTransaction:fn=>{
 const run=queue.then(async()=>{
  if(beforeTransaction){const hook=beforeTransaction;beforeTransaction=null;hook();}
  const operations=[];
  const result=await fn({get:ref=>{assert.equal(operations.length,0,'reads must precede writes');return ref.get();},
   create:(ref,value)=>operations.push({ref,value,create:true}),set:(ref,value)=>operations.push({ref,value})});
  if(commitFailure)throw new HttpsError('unavailable','Synthetic commit failure');
  const next=new Map(records);
  for(const {ref,value,create} of operations){if(create&&next.has(ref.path))throw new HttpsError('already-exists','Document exists');next.set(ref.path,structuredClone(value));}
  records=next;return result;
 });queue=run.catch(()=>{});return run;
}};
const context={exports:{},console,Date:TestDate,Buffer,Intl,URL,Set,Map,process:{env:{}},require:name=>{
 if(name.startsWith('../lib/'))return require(name);
 if(name==='crypto')return testCrypto;
 if(name==='firebase-functions/v2/https')return{HttpsError};
 if(name==='firebase-admin/app')return{getApps:()=>[{}]};
 if(name==='firebase-admin/firestore')return{getFirestore:()=>db,FieldValue:{serverTimestamp:()=>now}};
 if(name==='firebase-admin/auth')return{getAuth:()=>({})};
 throw Error('Unexpected dependency '+name);
}};
vm.createContext(context);vm.runInContext(fs.readFileSync('functions/core.js','utf8'),context);
const api=context.exports;
const actor={uid:'synthetic-commission',token:{role:'COMMISSIONE',staffYear:year,staffAccountId:'commission',sessionVersion:0}};
const request=(data={},auth=actor)=>({auth,data:{annoScolastico:year,tipo:'STUDENTE',importId:'a'.repeat(64),offset:0,totalRows:1,rows:[{nome:'ALUNNO FITTIZIO',classe:'1A',indirizzo:'LICEO'}],...data}});
const invoke=data=>api.importVoterRegister(request(data));
const docs=name=>[...records].filter(([key])=>key.startsWith(`${root}/${name}_2026_2027/`));
function reset(config={votingStartsAtMs:0}){records=new Map([[accountPath,{active:true,role:'COMMISSIONE',sessionVersion:0}]]);if(config)records.set(configPath,config);commitFailure=false;beforeTransaction=null;forceCollision=false;}
async function rejectsWithoutWrites(req,code){const before=JSON.stringify([...records]);await assert.rejects(api.importVoterRegister(req),error=>error.code===code);assert.equal(JSON.stringify([...records]),before);}
let passed=0;
async function test(name,fn){await fn();passed++;console.log('PASS: '+name);}
(async()=>{
 await test('preparation with missing regularity, zero/missing calendar and missing initial configuration',async()=>{
  for(const config of [{votingStartsAtMs:0},{},null]){reset(config);assert.equal((await invoke()).created,1);assert.equal(docs('tokens').length,1);assert.equal(docs('importazioni_registro').length,1);assert.ok(records.has(path('config','referenti_keys')));}
 });
 await test('no unauthenticated, wrong-role, wrong-year, revoked or password-change writes',async()=>{
  reset();await rejectsWithoutWrites(request({},null),'unauthenticated');
  for(const role of ['STUDENTE','GENITORE','DOCENTE','ATA','ASSISTENTE_TECNICO','DIRIGENTE'])await rejectsWithoutWrites(request({}, {...actor,token:{...actor.token,role}}),'permission-denied');
  await rejectsWithoutWrites(request({annoScolastico:'2027/2028'}),'permission-denied');
  for(const record of [{active:false,role:'COMMISSIONE'},{active:true,role:'COMMISSIONE',sessionVersion:1},{active:true,role:'COMMISSIONE',mustChangePassword:true}]){
   records.set(accountPath,record);await rejectsWithoutWrites(request(),record.mustChangePassword?'failed-precondition':'permission-denied');
  }
 });
 await test('final rolls, closed procedure, authorized vote and every started schedule remain frozen',async()=>{
  for(const state of [{voterRollFinal:true},{procedureClosed:true},{votingReview:{stage:'AUTHORIZED'}}]){reset();records.set(statePath,state);await rejectsWithoutWrites(request(),'failed-precondition');}
  for(const config of [{votingStartsAtMs:now},{calendario:{votingStartDate:'01/09/2026',votingStartTime:'09:00'}},{consultaAttiva:false,consultazioni:{consulta:{dedicated:true,windows:[{date:'2026-09-01',from:'09:00',to:'12:00'},{date:'2026-10-01',from:'09:00',to:'12:00'}]}}}]){reset(config);await rejectsWithoutWrites(request(),'failed-precondition');}
  reset({consultaAttiva:true,consultazioni:{consulta:{dedicated:true,windows:[{date:'2026-10-01',from:'09:00',to:'12:00'}]}}});assert.equal((await invoke()).created,1);
 });
 await test('existing ballots and anonymous credentials block edits even with missing config',async()=>{
  for(const name of ['voti_consiglio','voti_istituto','voti_consulta','voti_classe_studenti','voti_classe_genitori','credenziali_anonime']){reset(null);records.set(path(name,'existing'),{synthetic:true});await rejectsWithoutWrites(request(),'failed-precondition');}
 });
 await test('all 1501 rows imported beyond former 400-row and 1000-code limits; exact replay adds nothing',async()=>{
  reset();const rows=Array.from({length:1501},(_,i)=>({nome:'ELETTTORE FITTIZIO '+i,classe:'1A',indirizzo:'LICEO'}));
  const options={api:{importVoterRegister:async data=>({data:await api.importVoterRegister(request(data))})},annoScolastico:year,tipo:'STUDENTE',rows,importId:'b'.repeat(64)};
  assert.deepEqual(await register.importRows(options),{confirmed:1501,created:1501});assert.equal(docs('tokens').length,1501);
  assert.deepEqual(await register.importRows(options),{confirmed:1501,created:0});assert.equal(docs('tokens').length,1501);
  assert.equal(docs('importazioni_registro').length,4);
  for(const [,row]of docs('tokens')){assert.equal(row.hasVoted,false);assert.equal(row.voted_istituto,false);assert.equal(Object.keys(row).length,10);}
  const audit=[...records].filter(([key])=>key.startsWith(root+'/audit_admin/'));assert.equal(audit.length,4);assert.ok(!JSON.stringify(audit).includes('ELETTTORE FITTIZIO'));
 });
 await test('lost response after commit: progress is honest and retry does not duplicate',async()=>{
  reset();let drop=true;const rows=Array.from({length:805},(_,i)=>({nome:'PROVA '+i}));
  const options={api:{importVoterRegister:async data=>{const result=await api.importVoterRegister(request(data));if(data.offset===400&&drop){drop=false;throw Error('Synthetic lost response');}return{data:result};}},annoScolastico:year,tipo:'DOCENTE',rows,importId:'c'.repeat(64)};
  await assert.rejects(register.importRows(options),error=>error.confirmed===400&&error.totalRows===805);assert.equal(docs('tokens').length,800);
  assert.deepEqual(await register.importRows(options),{confirmed:805,created:5});assert.equal(docs('tokens').length,805);
 });
 await test('invalid values and forged vote flags are rejected before any write',async()=>{
  for(const data of [{tipo:'COMMISSIONE'},{importId:'../bad'},{offset:1},{totalRows:10001},{rows:[]},{rows:[{nome:'TEST',hasVoted:true}]},{rows:[{nome:{bad:1}}]},{rows:[{nome:'A'.repeat(121)}]},{rows:[{nome:'TEST',classe:'X'.repeat(33)}]}]){reset();await rejectsWithoutWrites(request(data),'invalid-argument');}
  reset();await invoke();await rejectsWithoutWrites(request({rows:[{nome:'DIFFERENT'}]}),'already-exists');
 });
 await test('referent creation is atomic and existing keys are preserved',async()=>{
  reset();records.set(path('config','referenti_keys'),{'REF-STU123':{classe:'1A',tipo:'STUDENTE'}});await invoke();assert.equal(Object.keys(records.get(path('config','referenti_keys'))).length,1);
  reset();records.set(path('config','referenti_keys'),Object.fromEntries(Array.from({length:1000},(_,i)=>['REF-STU'+String(i).padStart(3,'0'),{classe:'OTHER'+i,tipo:'STUDENTE'}])));
  await rejectsWithoutWrites(request(),'resource-exhausted');assert.equal(docs('tokens').length,0);
 });
 await test('concurrent replay and ID collision never overwrite an existing voter',async()=>{
  reset();const results=await Promise.all([invoke(),invoke()]);assert.equal(results.reduce((n,r)=>n+r.created,0),1);assert.equal(docs('tokens').length,1);
  reset();forceCollision=true;const id='STU'+'07'.repeat(12);
  records.set(path('tokens',id),{nome:'EXISTING',hasVoted:true});await rejectsWithoutWrites(request(),'already-exists');assert.equal(records.get(path('tokens',id)).hasVoted,true);
 });
 await test('changes between preflight and transaction, commit failure, and read/write ordering',async()=>{
  reset();beforeTransaction=()=>records.set(accountPath,{active:false,role:'COMMISSIONE'});await assert.rejects(invoke(),error=>error.code==='permission-denied');assert.equal(docs('tokens').length,0);
  reset();beforeTransaction=()=>records.set(statePath,{voterRollFinal:true});await assert.rejects(invoke(),error=>error.code==='failed-precondition');assert.equal(docs('tokens').length,0);
  reset();commitFailure=true;await rejectsWithoutWrites(request(),'unavailable');assert.equal(docs('tokens').length,0);
 });
 await test('Excel aliases, numeric cells, invalid headings and bad later rows before batching',async()=>{
  assert.deepEqual(register.fromExcelRows([{' Cognome ':'Rossi',NOME:' Anna ',CLASSE:1,INDIRIZZO:'Liceo'}]),[{nome:'ROSSI ANNA',classe:'1',indirizzo:'LICEO'}]);
  assert.equal(register.fromExcelRows([{'Cognome Nome':'Rossi Anna'}])[0].nome,'ROSSI ANNA');
  assert.throws(()=>register.fromExcelRows([{wrong:'value'}]),/Nominativo mancante/);
  const rows=Array.from({length:401},()=>({nome:'TEST'}));rows[400]={nome:''};let calls=0;
  await assert.rejects(register.importRows({api:{importVoterRegister:()=>{calls++;}},tipo:'ATA',rows}));assert.equal(calls,0);
 });
 console.log(`${passed} import checks passed (simulated database; no production writes).`);
})().catch(error=>{console.error(error);process.exitCode=1;});
