'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{spawnSync}=require('node:child_process'),crypto=require('node:crypto');
for(const file of ['functions/core.js','lib/privacy-review-ui.js']){
 const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
 assert.equal(result.status,0,file+': '+result.stderr);
}
const text=fs.readFileSync('functions/core.js','utf8');
const ui=fs.readFileSync('lib/privacy-review-ui.js','utf8');
assert.match(ui,/data-confirm-profile/);
assert.match(ui,/data-reuse-proposal/);
assert.match(ui,/data-confirm-reuse/);
assert.match(ui,/getVotingReviewEvents/);
assert.match(ui,/form\.dataset\.reusedEvidence&&!reuseConfirm\.checked/);
const start=text.indexOf('exports.saveDpoReviewProfile=async request=>{');
const end=text.indexOf('exports.setRegularityControl = async',start);
assert.ok(start>0&&end>start);
const keys=['legalBasis','dpoOpinion','providers','backups','retention','riskAssessment','incidentResponse','stationProcedure','evidenceCustody','accessibility'];
const baseline=Object.fromEntries(keys.map(k=>[k,'Documento verificabile per '+k]));
let writes=[];
const tx={
 get:async ref=>ref.name==='profile'?{exists:true,data:()=>({fields:baseline})}:{exists:true,data:()=>({})},
 set:(...args)=>writes.push(['set',...args]),
 create:(...args)=>writes.push(['create',...args])
};
const context={
 exports:{},DPO_PROFILE_FIELDS:keys,HttpsError:class extends Error{},
 requireAuth:async()=>({claims:{staffYear:'2026/2027',staffAccountId:'commission-test'},uid:'synthetic'}),
 evidenceText:(v,n)=>String(v||'').trim().slice(0,n),
 yearlyCollection:()=>({doc:()=>({name:'profile'})}),
 regularityEvents:()=>({doc:()=>({name:'event'})}),
 regularityStateRef:()=>({name:'state'}),
 yearlyConfigRef:()=>({name:'config'}),
 db:{runTransaction:async fn=>fn(tx)},
 electionPhase:()=> 'BEFORE',
 reviewPerson:()=>({name:'commission test'}),
 sha256:value=>crypto.createHash('sha256').update(value).digest('hex'),
 FieldValue:{serverTimestamp:()=> 'NOW'},
 crypto:{randomUUID:()=> 'synthetic-uuid'}
};
vm.runInNewContext(text.slice(start,end),context);
(async()=>{
 const read=await context.exports.saveDpoReviewProfile({data:{fields:{...baseline}}});
 assert.equal(read.ok,true);assert.equal(read.unchanged,true);assert.equal(writes.length,0,'Confirming identical text must not write/reset review');
 const changed=await context.exports.saveDpoReviewProfile({data:{fields:{...baseline,accessibility:'Documento sostituito'}}});
 assert.equal(changed.ok,true);assert.equal(changed.unchanged,false);
 assert.equal(writes.length,3,'Changes must still audit and reset revision');
 assert.equal(writes.find(x=>x[1].name==='state')[2].votingReview.stage,'PREPARATION');
 console.log('PASS: unchanged DPO text leaves review intact; edits remain audited and reset review; UI scripts parse.');
})().catch(error=>{console.error(error);process.exitCode=1;});
