'use strict';
// Static and stubbed checks only: no Firebase/Vercel live load or real votes.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const source=fs.readFileSync('functions/core.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const begin=source.indexOf('exports.getTechnicalStatus = async (request) => {');
const finish=source.indexOf('exports.recordTechnicalCheckpoint = async (request) => {',begin);
assert.ok(begin>0&&finish>begin,'Backend status handler boundaries');
let auditReadCount=0;
const actor={role:'COMMISSIONE',claims:{staffYear:'2026/2027'}};
const test={exports:{},
  requireAuth:async()=>actor, enforceTechnicalYear:()=>{}, loadElectionConfig:async()=>({}),
  loadRegularityState:async()=>({}), electionPhase:()=> 'BEFORE',
  technicalStation:()=> 'CAD-1',technicalActorName:()=> 'TEST ONLY',
  technicalControls:()=>({backendReachable:true}),technicalDiagnostics:async()=>[],
  privacyArchitectureAssessment:()=>({}),legalAssessment:()=>({}),
  timestampIso:value=>value,
  yearlyCollection:()=>({orderBy:()=>({limit:()=>({get:async()=>{
    auditReadCount++;return{docs:[{id:'checkpoint-fixture',data:()=>({event:'OPENING',technicianName:'TEST ONLY',at:'2026-10-09T08:00:00Z'})}]};
  }})})})
};
vm.createContext(test);
vm.runInContext(source.slice(begin,finish),test);
(async()=>{
 const run=(data)=>test.exports.getTechnicalStatus({auth:{},data:{annoScolastico:'2026/2027',...data}});
 const fast=await run({includeRecentEvents:false});
 assert.equal(auditReadCount,0,'status must skip redundant audit query');
 assert.equal(fast.recentEvents.length,0);
 const original=await run({});
 assert.equal(auditReadCount,1,'legacy callers must retain audit data');
 assert.equal(original.recentEvents.length,1);
 assert.match(html,/let voterLoginPending = false/);
 assert.match(html,/if\(voterLoginPending\)return/);
 assert.match(html,/finally \{voterLoginPending=false;btn.disabled=false;\}/);
 assert.match(html,/interval=setInterval\(\(\)=>\{if\(dialog.open&&!document.hidden\)void refresh\(\);\},60000\)/);
 assert.match(source,/const pageSize=Number\.isInteger\(requestedPageSize\)/);
 assert.match(source,/query\.limit\(pageSize\+1\)/);
 assert.equal((html.match(/getTechnicalLogs\(\{[^\n]*pageSize:20\s*\}\)/g)||[]).length,2,'Only the two dashboard reads should be limited to 20.');
 assert.match(html,/window\.loadCompleteTechnicalCheckpointHistory=/);
 assert.match(html,/window\.findOlderCommissionTechnicalReport=/);
 const moduleSource=html.match(/<script type="module">([\s\S]*?)<\/script>/);
 assert.ok(moduleSource);
 const syntax=spawnSync(process.execPath,['--input-type=module','--check'],{input:moduleSource[1],encoding:'utf8'});
 assert.equal(syntax.status,0,'Frontend JS syntax: '+syntax.stderr);
 const backendSyntax=spawnSync(process.execPath,['--check','functions/core.js'],{encoding:'utf8'});
 assert.equal(backendSyntax.status,0,backendSyntax.stderr);
 console.log('PASS: no redundant backend audit query, default compatibility, voter dedup, 60s info polling and JS syntax. No production traffic.');
})().catch(error=>{console.error(error);process.exitCode=1;});
