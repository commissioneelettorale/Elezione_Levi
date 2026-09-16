'use strict';
// Actual application handlers; synthetic in-memory database with conflict retries.
// This is a correctness test, never a cloud capacity measurement.
const assert=require('node:assert/strict'),crypto=require('node:crypto'),{performance}=require('node:perf_hooks');
const h=require('./check-consultations.cjs'),policy=require('../lib/election-policy'),legal=require('../lib/legal-readiness');
const {api,stores,db,path,configPath,statePath,year,env}=h;
const simulatedUsers=3000;
const delay=()=>new Promise(resolve=>setImmediate(resolve));
db.runTransaction=async callback=>{
 for(let attempt=0;attempt<5;attempt++){
  const versions=new Map(),writes=[];
  const result=await callback({get:async ref=>{assert.equal(writes.length,0);versions.set(ref.path,stores.get(ref.path));await delay();return ref.get();},set:(r,v,o)=>writes.push([r,v,o]),update:(r,v)=>writes.push([r,v,{merge:true}]),create:(r,v)=>{versions.set(r.path,stores.get(r.path));writes.push([r,v]);}});
  if([...versions].some(([key,value])=>stores.get(key)!==value))continue;
  // Commit without yielding: each transaction has one atomic commit point.
  for(const [ref,value,options]of writes)stores.set(ref.path,options?.merge?{...stores.get(ref.path),...value}:value);
  return result;
 }
 throw Error('Synthetic transaction conflict limit');
};
async function check(){
 h.clock(+policy.localDate('2026-10-10','09:30'));
 const config={annoScolastico:year,privacyMode:legal.ANONYMOUS_MODE,consiglioAttivo:true,consultazioni:{consiglio:h.profile('2026-10-10','OTTOBRE')},listeConsiglio:{DOCENTE:{A:{nome:'FITTIZIA',candidati:['CANDIDATO FITTIZIO']}}}};
 const state={...Object.fromEntries(h.pre.map(key=>[key,true])),votingReview:{stage:'AUTHORIZED',commit:env.VERCEL_GIT_COMMIT_SHA,configurationSha256:api._test.configurationHash(config),credentialRevision:null}};
 stores.clear();stores.set(configPath,config);stores.set(statePath,state);
 const codes=Array.from({length:simulatedUsers},()=>crypto.randomBytes(16).toString('hex').toUpperCase());
 for(const code of codes)stores.set(path('credenziali_anonime',crypto.createHash('sha256').update(year+':'+code).digest('hex')),{schema:legal.ANONYMOUS_MODE,tipo:'DOCENTE',classe:'',hasVoted:false});
 const started=performance.now();
 const sessions=await Promise.all(codes.map(token=>api.validateVoterToken({data:{token,annoScolastico:year}})));
 assert.equal(new Set(sessions.map(s=>s.sessionId)).size,simulatedUsers);
 const vote=sessionId=>api.castVote({data:{sessionId,annoScolastico:year,ballots:{consiglio:{isBianca:true}}}});
 const outcomes=await Promise.all(sessions.map(s=>vote(s.sessionId)));
 assert.ok(outcomes.every(result=>result.ok&&result.recordedBallots===1&&result.fullyCompleted));
 let ballots=[...stores].filter(([key])=>key.startsWith(path('voti_consiglio')+'/'));assert.equal(ballots.length,simulatedUsers);
 assert.equal(new Set(ballots.map(([key])=>key)).size,simulatedUsers);
 for(const [,ballot]of ballots){assert.equal(ballot.schema,'LEVI_SEALED_V1');assert.ok(!('token'in ballot)&&!('sessionId'in ballot)&&!('nome'in ballot));}
 const repeated=await Promise.allSettled(Array.from({length:25},()=>vote(sessions[0].sessionId)));assert.ok(repeated.every(r=>r.status==='rejected'));
 // Two submissions for one newly issued session race at the commit boundary.
 const code=crypto.randomBytes(16).toString('hex').toUpperCase();stores.set(path('credenziali_anonime',crypto.createHash('sha256').update(year+':'+code).digest('hex')),{schema:legal.ANONYMOUS_MODE,tipo:'DOCENTE',classe:'',hasVoted:false});
 const session=await api.validateVoterToken({data:{token:code,annoScolastico:year}});
 const race=await Promise.allSettled([vote(session.sessionId),vote(session.sessionId)]);assert.equal(race.filter(r=>r.status==='fulfilled').length,1);
 ballots=[...stores].filter(([key])=>key.startsWith(path('voti_consiglio')+'/'));assert.equal(ballots.length,simulatedUsers+1);
 assert.equal((await api.getVoterSessionStatus({data:{sessionId:session.sessionId,annoScolastico:year}})).status,'COMMITTED');
 await assert.rejects(api.castVote({data:{sessionId:'PROVA-SESSIONE-1',annoScolastico:year}}),e=>e.code==='unauthenticated');
 await assert.rejects(api.validateVoterToken({data:{token:'PROVA-DOCENTE-0001',annoScolastico:year}}),e=>e.code==='invalid-argument');
 console.log('PASS: '+simulatedUsers+' concurrent synthetic login/vote flows through actual backend handlers; exact ballot count, encrypted records, replay rejection and concurrent duplicate submission. Local duration '+Math.round(performance.now()-started)+' ms. Mock database, no network: NOT a Vercel/Firestore capacity test.');
}
check().catch(error=>{console.error(error);process.exitCode=1;}).finally(h.resetDate);
