'use strict';
const assert = require('node:assert/strict');
const Codes = require('../lib/voter-token-code');
const { migrate } = require('../lib/voter-token-migration');
const root = 'artifacts/iis-levi-electoral-v3/public/data', year = '2026/2027';
const path = (name,id) => root + '/' + name + '_2026_2027' + (id ? '/' + id : '');
const statePath = path('regolarita','state'), configPath = root + '/config/yearly_settings_2026_2027';
const now = Date.parse('2026-09-16T10:00:00Z');
const clone = v => v instanceof Date ? new Date(+v) : Array.isArray(v) ? v.map(clone) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k,x])=>[k,clone(x)])) : v;
const merge = (a,b) => { const result=clone(a||{}); for(const [k,v] of Object.entries(b))result[k]=v&&typeof v==='object'&&!Array.isArray(v)&&!(v instanceof Date)?merge(result[k],v):clone(v);return result; };
let data, serial=0, failCommit=0, transactions=0, failCount=0;
class Ref {
 constructor(path, fields=null, max=Infinity) { Object.assign(this,{path,fields,max});this.id=path.split('/').pop(); }
 collection(name) { return new Ref(this.path+'/'+name); }
 doc(id='auto-'+(++serial)) { return new Ref(this.path+'/'+id); }
 select(...fields) { return new Ref(this.path,fields,this.max); }
 limit(max) { return new Ref(this.path,this.fields,max); }
 async get() {
  if(this.path.split('/').length%2===0) { const value=data.get(this.path);return {id:this.id,ref:this,exists:value!==undefined,data:()=>clone(value)}; }
  const docs=[...data].filter(([p])=>p.startsWith(this.path+'/')&&!p.slice(this.path.length+1).includes('/')).slice(0,this.max).map(([p,v])=>({id:p.split('/').pop(),ref:new Ref(p),exists:true,data:()=>clone(this.fields?Object.fromEntries(this.fields.filter(k=>k in v).map(k=>[k,v[k]])):v)}));
  return {docs,size:docs.length,empty:!docs.length};
 }
}
const db={collection:name=>new Ref(name),runTransaction:async fn=>{
 const ops=[];const tx={get:async ref=>{assert.equal(ops.length,0,'transaction reads precede writes');return ref.get();},getAll:async(...refs)=>Promise.all(refs.map(ref=>tx.get(ref))),create:(r,v)=>ops.push({kind:'create',r,v}),set:(r,v,o)=>ops.push({kind:'set',r,v,o}),delete:r=>ops.push({kind:'delete',r})};
 const result=await fn(tx);transactions++;
 if(failCommit&&transactions===failCommit) { failCount++;throw Error('Synthetic commit loss'); }
 assert.ok(ops.length<=500,'write budget');
 const next=new Map(data);
 for(const op of ops) { if(op.kind==='create')assert.ok(!next.has(op.r.path),'never overwrite an existing document'); if(op.kind==='delete')next.delete(op.r.path);else next.set(op.r.path,op.o?.merge?merge(next.get(op.r.path),op.v):clone(op.v)); }
 data=next;return result;
}};
const opts={db,year,migrationId:'synthetic-six-character-test',apply:true,now:()=>now,timestamp:()=>new Date(now)};
function reset(count=1) {
 data=new Map([[root+'/config/settings_v3',{annoScolastico:year}],[configPath,{annoScolastico:year,votingStartsAtMs:0}], [statePath,{}]]);
 const types=Object.keys(Codes.PREFIXES);
 for(let i=0;i<count;i++)data.set(path('tokens','OLD-'+i),{tipo:types[i%4],nome:'SYNTHETIC '+i,classe:'1A',indirizzo:'LICEO',hasVoted:false,voted_consiglio:false,customMetadata:{preserve:true,index:i}});
 data.set(path('gestione_accessi','commission'),{passwordHash:'SYNTHETIC-UNCHANGED',sessionVersion:4});
 data.set(path('config','referenti_keys'),{'REF-STU123':{tipo:'STUDENTE',classe:'1A'}});
 failCommit=0;transactions=0;failCount=0;
}
const tokens=()=>[...data].filter(([p])=>p.startsWith(path('tokens')+'/'));
async function rejectsWithoutWrites(code) { const before=clone([...data]);await assert.rejects(migrate(opts),e=>e.code===code);assert.deepEqual([...data],before); }
async function main() {
 for(const type of Object.keys(Codes.PREFIXES)) {
  const values=Array.from({length:2500},()=>Codes.generate(type));
  assert.ok(new Set(values).size > 2400, 'the random generator must not collapse to a small fixed set');
  for(const value of values) { assert.ok(Codes.matches(value,type));assert.match(value.split('-')[1],/[A-Z]/);assert.match(value.split('-')[1],/[0-9]/); }
 }
 console.log('PASS: 10,000 generated examples, correct prefixes, exactly six random letters/digits.');
 reset(1501);const original=tokens().map(([,v])=>v),accounts=clone(data.get(path('gestione_accessi','commission'))),referents=clone(data.get(path('config','referenti_keys')));
 const preview=await migrate({...opts,apply:false});assert.equal(preview.remaining,1501);assert.equal(tokens().length,1501);assert.equal(data.get(statePath).tokenCodeMigration,undefined);
 const result=await migrate(opts);assert.equal(result.migrated,1501);assert.equal(result.remaining,0);assert.equal(tokens().length,1501);
 assert.deepEqual(tokens().map(([,v])=>v).sort((a,b)=>a.customMetadata.index-b.customMetadata.index),original);
 for(const [p,v] of tokens())assert.ok(Codes.matches(p.split('/').pop(),v.tipo));
 const backups=[...data].filter(([p])=>p.includes('/backup/'));assert.equal(backups.length,1501);
 for(const [p,b]of backups){assert.deepEqual(data.get(path('tokens',b.newId)),b.data);assert.ok(!data.has(path('tokens',p.split('/').pop())));}
 assert.deepEqual(data.get(path('gestione_accessi','commission')),accounts);assert.deepEqual(data.get(path('config','referenti_keys')),referents);
 const snapshot=clone([...data]);const replay=await migrate(opts);assert.equal(replay.applied,true);assert.deepEqual([...data],snapshot);
 console.log('PASS: 1,501 old IDs replaced, all voter fields unchanged, private recovery copies, original codes removed, repeat run does not rotate codes again.');
 reset(205);failCommit=3;await assert.rejects(migrate(opts));assert.equal(failCount,1);assert.equal(tokens().length,205);assert.equal(tokens().filter(([p,v])=>Codes.matches(p.split('/').pop(),v.tipo)).length,100);
 assert.equal(data.get(statePath).tokenCodeMigration.status,'FAILED');failCommit=0;
 assert.equal((await migrate(opts)).migrated,205);assert.equal(tokens().length,205);
 console.log('PASS: atomic batch failure and safe resume; no missing or duplicated voters.');
 for(const state of [{voterRollFinal:true},{procedureClosed:true},{votingReview:{stage:'AUTHORIZED'}}]) { reset();data.set(statePath,state);await rejectsWithoutWrites('PROCEDURE_FROZEN'); }
 reset();data.set(configPath,{votingStartsAtMs:now-1});await rejectsWithoutWrites('VOTING_ALREADY_STARTED');
 for(const name of ['voti_istituto','credenziali_anonime']) { reset();data.set(path(name,'synthetic'),{});await rejectsWithoutWrites('BALLOTS_OR_ANONYMOUS_CODES_EXIST'); }
 reset();data.get(path('tokens','OLD-0')).hasVoted=true;await rejectsWithoutWrites('VOTER_ALREADY_USED');
 reset();data.get(path('tokens','OLD-0')).activeSessionHash='synthetic';data.get(path('tokens','OLD-0')).sessionExpiresAt={toMillis:()=>now+1000};await rejectsWithoutWrites('ACTIVE_VOTER_SESSION');
 reset();data.set(root+'/config/settings_v3',{annoScolastico:'2027/2028'});await rejectsWithoutWrites('ACTIVE_YEAR_MISMATCH');
 console.log('PASS: frozen or started elections, used credentials, active sessions, anonymous pools and wrong year blocked before writes.');
 reset(0);const fixed=()=>0,code=Codes.generate('STUDENTE',fixed);data.set(path('tokens',code),{tipo:'STUDENTE',preserve:true});
 const before=clone([...data]);await assert.rejects(db.runTransaction(tx=>Codes.allocate(tx,new Ref(path('tokens')),'STUDENTE',1,{randomInt:fixed})),e=>e.code==='resource-exhausted');assert.deepEqual([...data],before);
 let seed=7;const rng=max=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%max;};
 const first=Codes.generate('STUDENTE',rng);data.set(path('tokens',first),{tipo:'STUDENTE'});seed=7;
 const allocated=await db.runTransaction(tx=>Codes.allocate(tx,new Ref(path('tokens')),'STUDENTE',1,{randomInt:rng}));assert.notEqual(allocated[0],first);
 console.log('PASS: generated collisions retried, exhausted generator fails without overwriting existing credentials.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
