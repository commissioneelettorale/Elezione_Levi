'use strict';
// Tests actual backend handlers with synthetic Firestore, not real ballots or live accounts.
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const h=require('./check-consultations.cjs');
const policy=require('../lib/election-policy'),legal=require('../lib/legal-readiness');
const {api,stores,path,configPath,statePath,year,env}=h;
const date='2026-10-13';
const windowFor=(from,to)=>({dedicated:true,windows:[{date,from,to}]});
const config={
 annoScolastico:year,privacyMode:legal.ANONYMOUS_MODE,
 rappresentantiClasseStudentiAttivo:true,consultaAttiva:true,rappresentantiClasseGenitoriAttivo:true,
 consultazioni:{
  classeStudente:windowFor('09:00','10:00'),
  consulta:windowFor('10:15','12:30'),
  classeGenitore:windowFor('15:00','18:00')
 }
};
const admitted={...Object.fromEntries(h.pre.map(k=>[k,true])),
 votingReview:{stage:'AUTHORIZED',commit:env.VERCEL_GIT_COMMIT_SHA,
 configurationSha256:api._test.configurationHash(config),credentialRevision:null}};
stores.clear();stores.set(configPath,config);stores.set(statePath,admitted);
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
function addToken(token,data){
 const ref=path('credenziali_anonime',sha(year+':'+token.replace(/[ -]/g,'')));
 stores.set(ref,{schema:legal.ANONYMOUS_MODE,...data,hasVoted:false,
   voted_classe_studente:false,voted_consulta:false,voted_classe_genitore:false});
 return ref;
}
const student='STU-TEST123',parent='GEN-TEST123';
const stuRef=addToken(student,{tipo:'STUDENTE',classe:'1A'});
const genRef=addToken(parent,{tipo:'GENITORE',classe:'1A',electionKey:'classeGenitore'});
const login=token=>api.validateVoterToken({data:{annoScolastico:year,token}});
const deposit=(sessionId,key)=>api.castVote({data:{annoScolastico:year,sessionId,ballots:{[key]:{isBianca:true}}}});
const at=(hour)=>h.clock(+policy.localDate(date,hour));
async function run(){
 at('09:30');
 const one=await login(student);
 assert.deepEqual(Array.from(one.openElections),['classeStudente']);
 await assert.rejects(login(student),err=>err.code==='already-exists','Only one active session at a time');
 const first=await deposit(one.sessionId,'classeStudente');
 assert.equal(first.recordedBallots,1);
 assert.equal(first.fullyCompleted,false,'First morning vote cannot consume remaining Consulta entitlement');
 assert.equal(stores.get(stuRef).voted_classe_studente,true);
 assert.equal(stores.get(stuRef).voted_consulta,false);
 assert.equal(stores.get(stuRef).hasVoted,false);
 await assert.rejects(login(student),err=>err.code==='failed-precondition',
   'A completed first ballot cannot create an empty 15 minute session before Consulta opens');
 at('10:30');
 const two=await login(student);
 assert.notEqual(two.sessionId,one.sessionId);
 assert.deepEqual(Array.from(two.openElections),['consulta']);
 assert.equal(two.voted_classe_studente,true);
 const second=await deposit(two.sessionId,'consulta');
 assert.equal(second.recordedBallots,1);
 assert.equal(second.fullyCompleted,true);
 assert.equal(stores.get(stuRef).hasVoted,true);
 assert.equal(stores.get(stuRef).voted_consulta,true);
 assert.equal((await api.getVoterSessionStatus({data:{annoScolastico:year,sessionId:two.sessionId}})).status,'COMMITTED');
 await assert.rejects(login(student),err=>err.code==='failed-precondition');
 await assert.rejects(deposit(two.sessionId,'consulta'));
 assert.equal((await h.db.collection(path('voti_classe_studenti')).get()).size,1);
 assert.equal((await h.db.collection(path('voti_consulta')).get()).size,1);
 for(const bucket of ['voti_classe_studenti','voti_consulta']){
   const collection=await h.db.collection(path(bucket)).get();
   assert.equal(collection.docs[0].data().schema,'LEVI_SEALED_V1');
 }
 at('15:30');
 const parentSession=await login(parent);
 assert.deepEqual(Array.from(parentSession.openElections),['classeGenitore']);
 const parentResult=await deposit(parentSession.sessionId,'classeGenitore');
 assert.equal(parentResult.recordedBallots,1);
 assert.equal(parentResult.fullyCompleted,true);
 assert.equal(stores.get(genRef).hasVoted,true);
 await assert.rejects(login(parent),err=>err.code==='failed-precondition');
 assert.equal((await h.db.collection(path('voti_classe_genitori')).get()).size,1);
 console.log('PASS: STUDENTE one token, two distinct sessions morning, one ballot per consultation; GENITORE one afternoon login and one ballot. No duplicate, no premature token exhaustion, no empty-session lockout. Synthetic Firestore only.');
}
run().catch(err=>{console.error(err);process.exitCode=1;}).finally(h.resetDate);
