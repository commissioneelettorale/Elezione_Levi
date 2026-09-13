'use strict';
// No network, real credentials or production data. Exercises actual backend handlers.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const policy=require('../lib/election-policy'),vault=require('../lib/ballot-vault'),legal=require('../lib/legal-readiness');
const year='2026/2027',root='artifacts/iis-levi-electoral-v3/public/data';
const env={VERCEL_GIT_COMMIT_SHA:'a'.repeat(40),VERCEL_ENV:'production',FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify({private_key:'ISOLATED_SYNTHETIC_SECRET'})};
const RealDate=Date;let clock=+new Date('2026-10-10T07:00:00Z');
class TestDate extends RealDate{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}}
global.Date=TestDate;
const stores=new Map();let sequence=0,beforeTransaction=null;
const merge=(a,b)=>{const out={...a};for(const [k,v]of Object.entries(b))out[k]=v&&v.constructor===Object&&out[k]?.constructor===Object?merge(out[k],v):v;return out;};
class Ref{
 constructor(path,filters=[],max=Infinity,fields=null){Object.assign(this,{path,filters,max,fields});this.id=path.split('/').pop();}
 collection(name){return new Ref(this.path+'/'+name);}
 doc(id='generated-'+(++sequence)){return new Ref(this.path+'/'+id);}
 where(k,op,v){assert.equal(op,'==');return new Ref(this.path,[...this.filters,[k,v]],this.max,this.fields);}
 limit(n){return new Ref(this.path,this.filters,n,this.fields);}
 select(...fields){return new Ref(this.path,this.filters,this.max,fields);}
 orderBy(){return this;}
 async get(){
  if(this.path.split('/').length%2===0){const value=stores.get(this.path);return{exists:value!==undefined,id:this.id,ref:this,data:()=>value};}
  const docs=[...stores].filter(([p,v])=>p.startsWith(this.path+'/')&&!p.slice(this.path.length+1).includes('/')&&this.filters.every(([k,x])=>v[k]===x)).slice(0,this.max).map(([p,v])=>({id:p.split('/').pop(),ref:new Ref(p),exists:true,data:()=>this.fields?Object.fromEntries(this.fields.filter(k=>k in v).map(k=>[k,v[k]])):v}));
  return {docs,size:docs.length,empty:!docs.length,forEach:fn=>docs.forEach(fn)};
 }
 async set(value,options){stores.set(this.path,options?.merge?merge(stores.get(this.path)||{},value):value);}
 async create(value){assert.ok(!stores.has(this.path));await this.set(value);}
 async update(value){assert.ok(stores.has(this.path));await this.set(value,{merge:true});}
 async add(value){const ref=this.doc();await ref.set(value);return ref;}
}
const db={collection:p=>new Ref(p),runTransaction:async fn=>{
 if(beforeTransaction){const hook=beforeTransaction;beforeTransaction=null;hook();}
 const ops=[];const result=await fn({get:async ref=>{assert.equal(ops.length,0,'all reads before writes');return ref.get();},set:(r,v,o)=>ops.push(()=>r.set(v,o)),update:(r,v)=>ops.push(()=>r.update(v)),create:(r,v)=>{assert.ok(!stores.has(r.path));ops.push(()=>r.set(v));}});
 for(const op of ops)await op();return result;
}};
class HttpsError extends Error{constructor(code,message){super(message);this.code=code;}}
// The crypto module is injected with the same synthetic environment used by this test.
const testVault={...vault,keyMaterial:()=>vault.keyMaterial(env),seal:(...a)=>vault.seal(...a,env),open:(...a)=>vault.open(...a,env)};
const context={exports:{},require:n=>n==='../lib/legal-readiness'?legal:n==='../lib/voting-admission'?require('../lib/voting-admission'):n==='../lib/election-policy'?policy:n==='../lib/ballot-vault'?testVault:n==='crypto'?crypto:n==='firebase-functions/v2/https'?{HttpsError}:n==='firebase-admin/app'?{getApps:()=>[{}]}:n==='firebase-admin/firestore'?{getFirestore:()=>db,FieldValue:{serverTimestamp:()=>new TestDate(),delete:()=>null,increment:x=>x},Timestamp:{fromMillis:ms=>({toMillis:()=>ms}),fromDate:d=>({toMillis:()=>+d})}}:{getAuth:()=>({})},console,Date:TestDate,Buffer,Intl,URL,Set,Map,process:{env}};
vm.createContext(context);vm.runInContext(fs.readFileSync('functions/core.js','utf8')+'\nexports._test={sanitizeStoredBallot,assertAllPublicationDeadlines,makeAggregateProjection,privacyArchitectureAssessment,configurationHash};',context);
const api=context.exports,path=(name,id)=>root+'/'+name+'_'+year.replace('/','_')+(id?'/'+id:'');
const configPath=root+'/config/yearly_settings_2026_2027',statePath=path('regolarita','state');
const profile=(date,period,from='09:00',to='11:00')=>({dedicated:true,period,kind:'RINNOVO',windows:[{date,from,to}],acts:[{authority:'Istituto',protocol:'TEST-'+period,date:'2026-09-01',subject:'Dati fittizi',url:'https://example.edu.test/atto'}]});
let config={annoScolastico:year,consultaAttiva:true,rappresentantiIstitutoAttivo:true,maxPrefConsulta:1,maxPrefIstituto:1,listeConsulta:{A:{candidati:['CANDIDATO FITTIZIO']}},listeIstituto:{B:{candidati:['ALTRO FITTIZIO']}},consultazioni:{consulta:profile('2026-10-10','OTTOBRE'),istituto:profile('2026-11-15','NOVEMBRE')}};
const pre=['annualCircularRecorded','commissionAppointed','voterRollFinal','candidateListsValidated','ballotApproved','privacyChecked','technicalTestPassed','softwareFrozen','backupPlanReady','incidentPlanReady','communicationPublished',...Object.keys(legal.CONTROLS)];
stores.set(configPath,config);stores.set(statePath,Object.fromEntries(pre.map(k=>[k,true])));
for(const role of ['COMMISSIONE','ASSISTENTE_TECNICO'])stores.set(path('gestione_accessi',role),{role,active:true});
const staff=(role,data={})=>({auth:{uid:role,token:{role,staffYear:year,staffAccountId:role,staffDisplayName:role==='COMMISSIONE'?'Presidente di prova':'Tecnico di prova',staffExpiresAt:2000000000}},data:{annoScolastico:year,...data}});
const commission=data=>staff('COMMISSIONE',data);
let issuedCodes=[];
async function token(){const id=issuedCodes.shift();assert.ok(id);return(await api.validateVoterToken({data:{token:id,annoScolastico:year}})).sessionId;}
async function report(){
 const ids=['identity','revokedAccess','duplicateVote','timeWindow','ballotValidation','configurationFreeze','outageRecovery','tally','restore','accessibility','anonymity','cloudSecurity'];
 return (await api.recordTechnicalTestReport(commission({softwareVersion:env.VERCEL_GIT_COMMIT_SHA,evidenceRef:'SYNTHETIC - no production certification',testEnvironment:'ISOLATED_TEST',tests:Object.fromEntries(ids.map(id=>[id,{outcome:'PASS',method:'Synthetic test fixture',expected:'Known assertion',observed:'Synthetic result',evidence:'fixture only',testedAt:new Date(clock).toISOString()}]))}))).id;
}
const proof={note:'SYNTHETIC workflow evidence, not a real independent review',protocolRef:'TEST-ONLY',evidenceSha256:'b'.repeat(64)};
async function propose(reportId){return api.advanceVotingReview(commission({action:'PROPOSE',reportId,...proof}));}
async function verify(){return api.advanceVotingReview(staff('ASSISTENTE_TECNICO',{action:'VERIFY',...proof}));}
async function authorize(){return api.advanceVotingReview(commission({action:'AUTHORIZE',...proof}));}
async function check(){
 const preGateStores=stores.size;
 assert.deepEqual(legal.structuralBlockers(),['structuralSecrecy']);
 const publicStatus=await api.getPublicServiceStatus();assert.equal(publicStatus.secretVotingEnabled,false);
 await assert.rejects(api.validateVoterToken({data:{annoScolastico:year,token:'TEST-NEVER-ACTUAL'}}),e=>e.code==='failed-precondition');
 await assert.rejects(api.castVote({data:{annoScolastico:year,sessionId:'TEST-NEVER-ACTUAL',ballots:{consulta:{lista:'A'}}}}),e=>e.code==='failed-precondition');
 assert.equal(stores.size,preGateStores,'admission must not create a session or ballot');
 const readiness=await api.getRegularityState(commission());assert.equal(readiness.readyForVoting,false);assert.ok(readiness.missing.includes('structuralSecrecy'));
 await assert.rejects(api.setRegularityControl(commission({control:'technicalTestPassed',value:true,note:'TEST',reportId:'TEST'})),e=>e.code==='failed-precondition');
 console.log('PASS: named credential mode cannot be admitted by checking documentary flags.');
 clock=+new Date('2026-09-20T07:00:00Z');
 config={...config,privacyMode:legal.ANONYMOUS_MODE};stores.set(configPath,config);
 await new Ref(path('tokens','named-one')).set({tipo:'STUDENTE',classe:'1A',nome:'SYNTHETIC PERSON ONE'});
 await new Ref(path('tokens','named-two')).set({tipo:'STUDENTE',classe:'1A',nome:'SYNTHETIC PERSON TWO'});
 await assert.rejects(api.createAnonymousCredentials(staff('ASSISTENTE_TECNICO',{tipo:'STUDENTE',classe:'1A',count:2,protocolRef:'TEST'})),e=>e.code==='permission-denied');
 const pool=await api.createAnonymousCredentials(commission({tipo:'STUDENTE',classe:'1A',count:2,protocolRef:'TEST'}));issuedCodes=[...pool.codes];
 assert.equal(pool.codes.length,2);assert.notEqual(pool.codes[0],pool.codes[1]);
 await assert.rejects(api.createAnonymousCredentials(commission({tipo:'STUDENTE',classe:'1A',count:1,protocolRef:'TEST'})),e=>e.code==='failed-precondition');
 const anonymous=await new Ref(path('credenziali_anonime')).get();assert.equal(anonymous.size,2);assert.ok(anonymous.docs.every(d=>!JSON.stringify(d.data()).includes('SYNTHETIC PERSON')&&!d.data().nome&&/^[a-f0-9]{64}$/.test(d.id)));
 const testReport=await report();
 await api.setRegularityControl(commission({control:'technicalTestPassed',value:true,note:'TEST',reportId:testReport}));
 await assert.rejects(authorize(),e=>e.code==='failed-precondition');
 await propose(testReport);
 await assert.rejects(api.advanceVotingReview(commission({action:'VERIFY',...proof})),e=>e.code==='permission-denied');
 await verify();await authorize();
 assert.equal((await api.getRegularityState(commission())).readyForVoting,true);
 await api.setEmergencySuspension(commission({suspended:true,reason:'Synthetic interruption'}));
 await assert.rejects(api.setEmergencySuspension(commission({suspended:false,reason:'Unreviewed resume'})),e=>e.code==='failed-precondition');
 await api.recordElectoralIncident(commission({title:'Unrelated incident',details:'Synthetic',suspend:false}));assert.equal(stores.get(statePath).emergencySuspended,true);
 await propose(testReport);await verify();await authorize();await api.setEmergencySuspension(commission({suspended:false,reason:'Reviewed recovery'}));
 assert.equal((await api.getRegularityState(commission())).readyForVoting,true);
 config={...config,assistenteTecnico:{postazione:'Changed synthetic station'}};stores.set(configPath,config);
 assert.equal((await api.getRegularityState(commission())).readyForVoting,false,'changed config invalidates admission');
 await assert.rejects(propose(testReport),e=>e.code==='failed-precondition');
 const newReport=await report();await propose(newReport);await verify();await authorize();
 clock=+new Date('2026-10-10T07:00:00Z');
 await assert.rejects(api.validateVoterToken({data:{token:'named-one',annoScolastico:year}}),e=>e.code==='not-found');
 console.log('PASS: actual anonymous pool, issuance limits, independent review, authorization, suspension/resume, stale-evidence rejection. All data and documentary claims are synthetic.');
 assert.equal(policy.localDate('2026-10-10','09:00').toISOString(),'2026-10-10T07:00:00.000Z');
 assert.equal(policy.localDate('2026-11-15','09:00').toISOString(),'2026-11-15T08:00:00.000Z');
 assert.equal(policy.localDate('2026-02-30','09:00'),null);assert.equal(policy.localDate('2026-03-29','02:30'),null);
 assert.equal(policy.phase(config,'consulta',clock-1),'BEFORE');assert.equal(policy.phase(config,'consulta',clock),'OPEN');assert.equal(policy.phase(config,'istituto',clock),'BEFORE');
 assert.equal(policy.phase(config,'consulta',+new Date('2026-10-10T09:00:00Z')),'CLOSED');
 const split=structuredClone(config);split.consultazioni.consulta.windows.push({date:'2026-10-11',from:'08:00',to:'12:00'});
 assert.equal(policy.phase(split,'consulta',+new Date('2026-10-10T10:00:00Z')),'PAUSED');
 assert.equal(policy.globalPhase(config,+new Date('2026-10-20T10:00:00Z')),'PAUSED');
 policy.validateProfile(config.consultazioni.consulta);
 assert.throws(()=>policy.validateProfile({...config.consultazioni.consulta,acts:[]}));
 assert.throws(()=>policy.validateProfile({...config.consultazioni.consulta,windows:[{date:'2026-10-10',from:'09:00',to:'08:00'}]}));
 const clear={lista:'A',p1:'CANDIDATO FITTIZIO',tipo:'STUDENTE'},a=vault.seal(clear,year,'voti_consulta',env),b=vault.seal(clear,year,'voti_consulta',env);
 assert.notEqual(a.ciphertext,b.ciphertext);assert.equal(a.ciphertext.length,vault.seal({isBianca:true},year,'voti_consulta',env).ciphertext.length);
 assert.deepEqual(vault.open(a,year,'voti_consulta',env),clear);assert.ok(!JSON.stringify(a).includes('CANDIDATO'));assert.ok(!('tipo'in a));
 assert.throws(()=>vault.open(a,'2027/2028','voti_consulta',env));assert.throws(()=>vault.open(a,year,'voti_istituto',env));
 const tampered={...a,tag:Buffer.alloc(16).toString('base64')};assert.throws(()=>vault.open(tampered,year,'voti_consulta',env));
 assert.throws(()=>vault.open(a,year,'voti_consulta',{BALLOT_ENCRYPTION_KEY:crypto.randomBytes(32).toString('base64')}));
 assert.deepEqual(Object.keys(api._test.sanitizeStoredBallot({...clear,token:'SECRET',uid:'PERSON',timestamp:clock})),Object.keys(clear));
 const sessionId=await token('TEST-ONE'),vote={data:{sessionId,annoScolastico:year,ballots:{consulta:{lista:'A',p1:'CANDIDATO FITTIZIO'}}}};
 await assert.rejects(api.castVote({...vote,data:{...vote.data,ballots:{istituto:{lista:'B'}}}}),e=>e.code==='failed-precondition');
 assert.equal((await new Ref(path('voti_consulta')).get()).size,0);
 assert.equal((await api.getVoterSessionStatus({data:{sessionId,annoScolastico:year}})).status,'PENDING');
 const result=await api.castVote(vote);assert.equal((await api.getVoterSessionStatus({data:{sessionId,annoScolastico:year}})).status,'COMMITTED');assert.equal(result.recordedBallots,1);assert.equal(result.fullyCompleted,false);
 const ballot=(await new Ref(path('voti_consulta')).get()).docs[0].data();assert.equal(ballot.schema,'LEVI_SEALED_V1');assert.deepEqual(vault.open(ballot,year,'voti_consulta',env),clear);
 assert.ok(!stores.get(path('tokens','named-one')).hasVoted,'nominal register not updated by voting');const participation=await api.getAnonymousParticipation(commission());assert.equal(participation.totalParticipated,1);assert.equal(participation.totalEligible,2);assert.equal(participation.stats.STUDENTE.completed,0);assert.ok(!JSON.stringify(participation).includes('SYNTHETIC PERSON'));
 await assert.rejects(api.castVote(vote));assert.equal((await new Ref(path('voti_consulta')).get()).size,1);
 const live=await api.getAnonymousBallots(commission({collection:'voti_consulta'}));assert.equal(live.phase,'OPEN');assert.ok(live.ballots.every(b=>!b.p1&&!b.lista));
 const closingSession=await token('TEST-TWO');beforeTransaction=()=>{clock=+new Date('2026-10-10T09:00:00Z');};
 await assert.rejects(api.castVote({data:{sessionId:closingSession,annoScolastico:year,ballots:{consulta:{lista:'A'}}}}),e=>e.code==='failed-precondition');
 assert.equal((await new Ref(path('voti_consulta')).get()).size,1);
 const closed=await api.getAnonymousBallots(commission({collection:'voti_consulta'}));assert.equal(closed.phase,'CLOSED');assert.equal(closed.ballots[0].p1,clear.p1);assert.ok(!('id'in closed.ballots[0]));
 assert.equal(closed.aggregateOnly,true);assert.equal(closed.representation,'SYNTHETIC_AGGREGATES');assert.equal(closed.ballots[0]._synthetic,true);
 const rawAttempt=await api.getAnonymousBallots(commission({collection:'voti_consulta',raw:true,aggregateOnly:false}));assert.equal(rawAttempt.aggregateOnly,true);
 const pairingA=[{lista:'A',p1:'A',p2:'B'},{lista:'A',p1:'C',p2:'D'}],pairingB=[{lista:'A',p1:'A',p2:'C'},{lista:'A',p1:'B',p2:'D'}];
 const projectedA=api._test.makeAggregateProjection(pairingA,'voti_consulta'),projectedB=api._test.makeAggregateProjection(pairingB.reverse(),'voti_consulta');
 assert.equal(JSON.stringify(projectedA),JSON.stringify(projectedB),'equal marginals must not reveal original pairings');
 const counts=rows=>rows.flatMap(r=>Object.entries(r).filter(([k])=>/^p\d+$/.test(k)).map(([,v])=>v)).sort();
 assert.equal(JSON.stringify(counts(projectedA)),JSON.stringify(counts(pairingA)));
 const classes=[{classe:'1A',candidate1:'A',candidate2:'B'},{classe:'1A',candidate1:'C'},{classe:'1A',isBianca:true},{classe:'2A',candidate1:'D'}];
 const projectedClasses=api._test.makeAggregateProjection(classes,'voti_classe_studenti');assert.equal(projectedClasses.length,4);assert.equal(projectedClasses.filter(r=>r.classe==='1A').length,3);assert.equal(projectedClasses.filter(r=>r.isBianca).length,1);
 const assessment=api._test.privacyArchitectureAssessment();assert.equal(assessment.structuralAnonymityVerified,false);assert.equal(assessment.originalBallotsExposedByApi,false);assert.equal(assessment.independentDecryptionTrustees,false);
 await api.recordResultsPublication(commission({electionKey:'consulta',protocolRef:'PUB-OTTOBRE',appealDeadline:'2026-10-20'}));
 assert.equal(stores.get(statePath).publications.consulta.resultsPublicationProtocol,'PUB-OTTOBRE');assert.ok(!stores.get(statePath).publications.istituto);
 await assert.rejects(api.recordResultsPublication(commission({electionKey:'istituto',protocolRef:'PREMATURO',appealDeadline:'2026-12-01'})));
 assert.throws(()=>api._test.assertAllPublicationDeadlines(config,stores.get(statePath)));
 await assert.rejects(api.resolveTechnicalIssue(staff('ASSISTENTE_TECNICO',{action:'protectDatabase'})),e=>e.code==='permission-denied');
 await assert.rejects(api.resolveTechnicalIssue(commission({action:'protectDatabase'})),e=>e.code==='failed-precondition');
 const changed=structuredClone(config);changed.consultazioni.consulta.acts[0].protocol='MODIFICATO';await assert.rejects(api.saveElectionConfig(commission({config:changed})),e=>e.code==='failed-precondition');
 const freezeBefore=structuredClone(config);freezeBefore.consultazioni.istituto.frozen=true;stores.set(configPath,freezeBefore);
 const unfreeze=structuredClone(freezeBefore);unfreeze.consultazioni.istituto.frozen=false;await assert.rejects(api.saveElectionConfig(commission({config:unfreeze})),e=>e.code==='failed-precondition');
 stores.set(configPath,config);clock=+new Date('2026-11-20T10:00:00Z');
 await new Ref(path('voti_consulta','LEGACY')).set({...clear,token:'OLD_IDENTIFIER',timestamp:123});
 const migration=await api.resolveTechnicalIssue(commission({action:'protectDatabase'}));assert.equal(migration.processed,1);assert.equal(migration.more,false);
 const migrated=stores.get(path('voti_consulta','LEGACY'));assert.ok(!('token'in migrated));assert.deepEqual(vault.open(migrated,year,'voti_consulta',env),clear);
 assert.equal((await api.resolveTechnicalIssue(commission({action:'protectDatabase'}))).processed,0);
 stores.get(path('voti_consulta','LEGACY')).tag=Buffer.alloc(16).toString('base64');await assert.rejects(api.getAnonymousBallots(commission({collection:'voti_consulta'})));
 console.log('PASS: Rome time boundaries/DST, split sessions, October/November isolation, per-election publications and freeze.');
 console.log('PASS: sealed vote round trip, tamper/wrong-key rejection, no cleartext identity, repeat submission, closing race and live result embargo.');
 console.log('PASS: technician denied migration; migration blocked between elections, lossless verified migration and idempotent retry.');
 console.log('PASS: Commission receives aggregate projections only; original pairings cannot affect the response; counts, groups and blank totals preserved; architectural limitations remain explicit.');
}
check().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{global.Date=RealDate;});
