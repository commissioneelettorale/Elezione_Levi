'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm'),{spawnSync}=require('node:child_process');
const html=fs.readFileSync('index.html','utf8');
const appModule=html.match(/<script type="module">([\s\S]*?)<\/script>/);
assert.ok(appModule,'Missing main application module');
const syntax=spawnSync(process.execPath,['--input-type=module','--check'],{input:appModule[1],encoding:'utf8'});
assert.equal(syntax.status,0,syntax.stderr);
const source=appModule[1];
const a=source.indexOf('window.checkRealVotingOpening = async function()');
const b=source.indexOf('function renderOpeningTab(container)',a);
assert.ok(a>=0&&b>a,'Missing server-confirmed one-button status');
const opening=source.slice(a,b);
assert.ok(opening.includes('SECURE_API.getPublicServiceStatus()'),'Must consult authoritative server status');
for(const forbidden of ['saveConfigToDB(', 'setRegularityControl(', 'modalitaProva=false','setEmergencySuspension(', 'validateVoterToken(', 'submitFinalVotes(', 'openElectionNow(']){
  assert.ok(!opening.includes(forbidden),'Opening status must not bypass security or change election state: '+forbidden);
}
const ui=source.slice(b,source.indexOf('window.openElectionNow =',b));
assert.ok(ui.includes('id="real-voting-check-button"')&&ui.includes('id="real-voting-check-result"'));
assert.ok(!ui.includes('refreshOpeningStatus();'),'Rendering opening screen must not make automatic Firestore reads');
const button={disabled:false},result={textContent:'',className:''},alerts=[];
let apiCalls=0,answer=null,apiError=null,authorized=true;
const context={window:{},document:{getElementById(id){return id==='real-voting-check-button'?button:id==='real-voting-check-result'?result:null;}},auth:{get currentUser(){return authorized?{}:null;}},get commissionSessionReady(){return authorized;},SECURE_API:{async getPublicServiceStatus(){apiCalls++;if(apiError)throw apiError;return {data:answer};}},technicalEscape:v=>String(v),LeviLegalReadiness:{BLOCKER_LABELS:{}},REGULARITY_LABELS:{},showNotification:(...a)=>alerts.push(a)};
vm.createContext(context);
vm.runInContext(opening,context);
async function run(data,expected){answer=data;apiError=null;result.textContent='';await context.window.checkRealVotingOpening();assert.match(result.textContent,expected);assert.equal(button.disabled,false);}
(async()=>{
 await run({ok:true,serviceState:'ADMITTED',secretVotingEnabled:true,phase:'OPEN'},/VOTAZIONI REALI APERTE/);
 await run({ok:true,serviceState:'ADMITTED',secretVotingEnabled:true,phase:'BEFORE'},/ATTESA DELLA FASCIA/);
 await run({ok:true,serviceState:'PREPARATION_ONLY',secretVotingEnabled:false,blockerCodes:['structuralSecrecy','privacyReviewPending']},/Separazione dei codici/);
 await run({ok:true,serviceState:'SUSPENDED',secretVotingEnabled:false},/VOTAZIONI SOSPESE/);
 apiError=Error('Resource exhausted');await context.window.checkRealVotingOpening();assert.match(result.textContent,/STATO NON VERIFICABILE/);apiError=null;
 const count=apiCalls;authorized=false;await context.window.checkRealVotingOpening();assert.equal(apiCalls,count,'No API request without Commission session');
 assert.equal(alerts.filter(a=>a[0]==='Voto reale disponibile').length,1);
 console.log('PASS: real voting button reads authoritative state, never mutates vote, handles authorized/open, scheduled, blocked, suspended, Firebase errors and unauthenticated access');
})().catch(e=>{console.error(e);process.exitCode=1;});