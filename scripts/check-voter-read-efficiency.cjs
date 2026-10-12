'use strict';
// Uses real voting handlers with synthetic in-memory Firestore. Not a live load test.
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const h=require('./check-consultations.cjs');
const legal=require('../lib/legal-readiness'),policy=require('../lib/election-policy');
const {api,stores,path,configPath,statePath,env,year}=h;
(async()=>{
  h.clock(+policy.localDate('2026-10-10','09:30'));
  const config={annoScolastico:year,privacyMode:legal.ANONYMOUS_MODE,
    consiglioAttivo:true,consultazioni:{consiglio:h.profile('2026-10-10','OTTOBRE')},
    listeConsiglio:{DOCENTE:{A:{nome:'LISTA PROVA',candidati:['TEST UNO']}}}};
  const state={...Object.fromEntries(h.pre.map(k=>[k,true])),
    votingReview:{stage:'AUTHORIZED',commit:env.VERCEL_GIT_COMMIT_SHA,
      configurationSha256:api._test.configurationHash(config),credentialRevision:null}};
  const code=crypto.randomBytes(16).toString('hex').toUpperCase();
  stores.clear();stores.set(configPath,config);stores.set(statePath,state);
  const tokenPath=path('credenziali_anonime',crypto.createHash('sha256').update(year+':'+code).digest('hex'));
  stores.set(tokenPath,{schema:legal.ANONYMOUS_MODE,tipo:'DOCENTE',classe:'',hasVoted:false});
  const counts=new Map(),nativeGet=Map.prototype.get;
  stores.get=function(k){counts.set(k,(counts.get(k)||0)+1);return nativeGet.call(this,k);};
  let session;
  try {
    session=await api.validateVoterToken({data:{token:code,annoScolastico:year}});
    assert.ok(session.sessionId,'Must issue bound session');
    assert.equal(counts.get(statePath),1,'Only transactional read of current regularity on login');
    assert.equal(counts.get(configPath),2,'Initial mode discovery plus transactional configuration');
    counts.clear();
    const cast=await api.castVote({data:{sessionId:session.sessionId,annoScolastico:year,ballots:{consiglio:{isBianca:true}}}});
    assert.equal(cast.recordedBallots,1);
    assert.equal(counts.get(statePath),1,'Only transactional read of current regularity on voting');
    assert.equal(counts.get(configPath),2,'Initial mode discovery plus transactional configuration on vote');
    const ballotRefs=[...stores.keys()].filter(key=>key.startsWith(path('voti_consiglio')+'/'));
    assert.equal(ballotRefs.length,1,'One anonymous stored ballot');
    await assert.rejects(api.castVote({data:{sessionId:session.sessionId,annoScolastico:year,ballots:{consiglio:{isBianca:true}}}}));
    console.log('PASS: isolated handlers check 1 regularity document read per login and 1 per vote, 1 stored encrypted ballot, replay rejected; no network or actual ballots.');
  } finally {delete stores.get;h.resetDate();}
})().catch(err=>{console.error(err);process.exitCode=1;});
