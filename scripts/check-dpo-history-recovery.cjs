'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{spawnSync}=require('node:child_process');
const src=fs.readFileSync('lib/privacy-review-ui.js','utf8');
const syntax=spawnSync(process.execPath,['--check','lib/privacy-review-ui.js'],{encoding:'utf8'});
assert.equal(syntax.status,0,syntax.stderr);
const begin=src.indexOf('async function recoverRegisteredHistory('),finish=src.indexOf('function renderReadiness(view)',begin);
assert.ok(begin>=0&&finish>begin,'Archive helpers missing');
const events=[];
for(let n=0;n<510;n++)events.push({id:'event-'+n,type:'CONTROL_UPDATE',control:'flag',value:true,at:'2026-10-08T12:00:00Z'});
events.push({id:'old-proposal',type:'VOTING_REVIEW_PROPOSE',at:'2026-10-07T09:00:00Z',review:{stage:'PROPOSED',commit:'a'.repeat(40),proposal:{protocolRef:'PROT-OLD',evidenceSha256:'f'.repeat(64),note:'Evidence recorded'}}});
const log={id:'old-report',event:'COLLAUDO',technicianName:'Michele Parente',at:'2026-10-08T12:00:00Z',result:'PROVE_DICHIARATE_SUPERATE',release:{commit:'a'.repeat(40)},configurationSha256:'a'.repeat(64),report:{softwareVersion:'a'.repeat(40),evidenceRef:'9507/2.1',tests:[]}};
const calls=[];
const context={escape:val=>String(val??'').replace(/&/g,'&amp;').replace(/</g,'&lt;'),Date,Number,Boolean,Array,String,Set,Error,
 call:async(name,args)=>{
  assert.ok(['getVotingReviewEvents','getTechnicalLogs'].includes(name),'history must remain read-only');
  calls.push({name,args});
  const all=name==='getTechnicalLogs'?[log]:events,offset=args.cursor?Number(args.cursor.replace('cursor-','')):0,rows=all.slice(offset,offset+100);
  return{events:name==='getVotingReviewEvents'?rows:undefined,logs:name==='getTechnicalLogs'?rows:undefined,
   snapshotUntil:args.snapshotUntil||'2026-10-11T18:00:00.000Z',
   nextCursor:offset+100<all.length?'cursor-'+(offset+100):null};
 }};
vm.runInNewContext(src.slice(begin,finish)+'\nthis.TEST={recoverRegisteredHistory,findRecordedProposal,archivedReferences};',context);
(async()=>{
 const first=await context.TEST.recoverRegisteredHistory('events',{maxPages:4,stopAtProposal:true});
 assert.equal(first.complete,false);assert.equal(first.scanned,400);
 assert.equal(context.TEST.findRecordedProposal(first.events),null);
 const full=await context.TEST.recoverRegisteredHistory('events',{maxPages:12,stopAtProposal:true});
 assert.equal(full.complete,true);assert.equal(full.scanned,511);
 assert.equal(context.TEST.findRecordedProposal(full.events).id,'old-proposal');
 assert.equal(calls.filter(x=>x.name==='getVotingReviewEvents'&&x.args.snapshotUntil).every(x=>x.args.snapshotUntil==='2026-10-11T18:00:00.000Z'),true);
 const tech=await context.TEST.recoverRegisteredHistory('technical');
 const view={assessment:{controls:Array.from({length:20},(_,i)=>({id:'control'+i,status:'DICHIARATO_VERIFICATO',note:'Verbale '+i,evidence:{historyId:'ID'+i}}))},release:{commit:'b'.repeat(40)},configurationSha256:'b'.repeat(64)};
 const html=context.TEST.archivedReferences(view,full,tech);
 assert.match(html,/20\/20/);assert.match(html,/Michele Parente/);
 assert.match(html,/PROT-OLD/);assert.match(html,/Documento storico/);
 assert.match(html,/non corrispondono automaticamente/);
 assert.ok(!calls.some(c=>/save|advance|set/.test(c.name)),'History must not mutate any record');
 assert.match(src,/const previous=found\.review\?\.proposal\|\|found\.previousReview\?\.proposal/);
 console.log('PASS: DPO finds proposals beyond four pages, shows 20/20 and Michele technical history without authorizing an older release.');
})().catch(e=>{console.error(e);process.exitCode=1});
