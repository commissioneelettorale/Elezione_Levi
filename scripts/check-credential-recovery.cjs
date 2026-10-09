'use strict';
// Synthetic DOM/API only: never issues real credentials or changes an election.
const fs=require('node:fs'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
const source=fs.readFileSync(process.env.LEVI_PRIVACY_UI_SOURCE||'lib/privacy-review-ui.js','utf8');
const tick=()=>new Promise(resolve=>setTimeout(resolve,20));
function fixture(){
 const dom=new JSDOM('<!doctype html><body></body>',{url:'https://example.test/',runScripts:'outside-only'}),w=dom.window;
 const state={reads:0,issues:0,downloads:0,failRead:false,failPdf:false,hold:false,releases:[],revoked:[],confirmations:0};
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 w.confirm=()=>{state.confirmations++;return false;};
 w.URL.createObjectURL=()=> 'blob:synthetic-only';w.URL.revokeObjectURL=url=>state.revoked.push(url);
 w.HTMLAnchorElement.prototype.click=function(){state.downloads++;};
 // Use the vendored PDF engine, not a fake serializer.
 w.eval(fs.readFileSync('vendor/jspdf.umd.min.js','utf8'));
 const PDF=w.jspdf.jsPDF;
 w.jspdf.jsPDF=function(...args){if(state.failPdf)throw Error('Synthetic PDF failure');return new PDF(...args);};
 const view={role:'COMMISSIONE',year:'2026/2027',privacyMode:'LEGACY_NAMED',batches:[],review:{stage:'PREPARATION'},assessment:{admittedToSecretVoting:false,controls:[{id:'technicalTestPassed',status:'NON_VERIFICATO'}],blockers:[{id:'structuralSecrecy'},{id:'testModeActive'},{id:'privacyReviewPending'}]},privacy:{},release:{commit:'test'}};
 const api={
  getVotingReview:async()=>{state.reads++;if(state.failRead)throw Error('RESOURCE_EXHAUSTED: synthetic read failure');return {data:view};},
  getDpoReviewProfile:async()=>{state.reads++;return {data:{fields:{}}};},
  getDpoDossierMaterials:async()=>{state.reads++;return {data:{fields:{},sections:[]}};},
  createAnonymousCredentials:async()=>{state.issues++;if(state.hold)await new Promise(resolve=>state.releases.push(resolve));return {data:{codes:['STU-ABC123'],tipo:'STUDENTE',classe:'1A',electionKey:''}};}
 };
 w.eval(source);w.LeviPrivacyReview.configure({api,config:()=>({annoScolastico:view.year}),saveMode:async()=>{},notify:()=>{}});
 const q=selector=>w.document.querySelector(selector);
 function submit(){const form=q('[data-batch]');form.elements.count.value='1';form.elements.classe.value='1A';form.elements.protocolRef.value='SYNTHETIC-ONLY';return form.onsubmit({preventDefault(){},target:form,submitter:form.querySelector('button:not([type])')});}
 return {w,state,view,q,submit,close:()=>{w.LeviPrivacyReview.clear();dom.window.close();}};
}
(async()=>{
 // Issuance success must not depend on another database read.
 const f=fixture();await f.w.LeviPrivacyReview.show();const before=f.state.reads;f.state.failRead=true;
 await f.submit();await tick();
 assert.ok(f.q('[data-credential-retry]'),'Successful issuance must immediately expose its PDF even if all subsequent reads fail');
 assert.equal(f.state.reads,before,'Preparing a receipt must not refresh the DPO APIs');
 assert.equal(f.q('[data-issued-count]').textContent,'1','Issued count updates without a cloud read');
 assert.equal(f.q('[data-review] button').disabled,true,'Confirm PDF custody before proceeding with a review invalidated by issuance');
 assert.equal(f.state.downloads,1);assert.equal(f.state.issues,1);
 // A manual refresh may fail, but the already issued receipt must survive.
 await f.w.LeviPrivacyReview.show();assert.match(f.q('[role="alert"]').textContent,/RESOURCE_EXHAUSTED/);
 assert.ok(f.q('[data-credential-retry]'),'Keep the receipt on the error screen');
 f.q('[data-close]').click();assert.equal(f.q('dialog').open,true,'Discard confirmation also protects an error screen');
 f.q('[data-credential-retry]').click();assert.equal(f.state.issues,1);
 const unload=new f.w.Event('beforeunload',{cancelable:true});f.w.dispatchEvent(unload);assert.equal(unload.defaultPrevented,true);
 f.close();assert.ok(f.state.revoked.length);
 console.log('PASS: real PDF generation survives cloud failure; retry does not issue another batch; close/reload protection.');

 // Recover a local PDF error without reading the cloud or issuing again.
 const p=fixture();await p.w.LeviPrivacyReview.show();p.state.failPdf=true;await p.submit();await tick();
 assert.match(p.q('[data-credential-receipt]').textContent,/Synthetic PDF failure/);
 assert.equal(p.q('[data-confirm-receipt]').disabled,true,'Cannot confirm a PDF that could not be prepared');
 p.state.failPdf=false;p.state.failRead=true;const reads=p.state.reads;
 [...p.q('[data-credential-receipt]').querySelectorAll('button')].find(b=>b.textContent.includes('Riprova')).click();
 await tick();assert.ok(p.q('[data-credential-retry]'));assert.equal(p.state.reads,reads);assert.equal(p.state.issues,1);p.close();
 console.log('PASS: local PDF retry needs no backend; custody confirmation stays disabled until a file exists.');

 // Double click and close during issuance must not create/loss a second batch.
 const d=fixture();await d.w.LeviPrivacyReview.show();d.state.hold=true;
 const first=d.submit();await tick();const second=d.submit();await tick();assert.equal(d.state.issues,1);
 d.q('[data-close]').click();assert.equal(d.q('dialog').open,true);
 const cancel=new d.w.Event('cancel',{cancelable:true});d.q('dialog').dispatchEvent(cancel);assert.equal(cancel.defaultPrevented,true);
 const pendingUnload=new d.w.Event('beforeunload',{cancelable:true});d.w.dispatchEvent(pendingUnload);assert.equal(pendingUnload.defaultPrevented,true);
 d.state.releases.forEach(resolve=>resolve());await Promise.all([first,second]);await tick();
 assert.ok(d.q('[data-credential-retry]'));assert.equal(d.state.issues,1);d.close();
 console.log('PASS: duplicate submission and close are blocked while the one-time response is pending.');

 // Explain authoritative blockers; do not grant admission or fabricate evidence.
 const g=fixture();await g.w.LeviPrivacyReview.show();let guide=g.q('[data-readiness]').textContent;
 assert.match(guide,/codici non nominativi/);assert.match(guide,/disattiva la modalità prova/);assert.match(guide,/persona diversa/);assert.match(guide,/Collaudo tecnico/);
 for(const [stage,action]of [['PROPOSED','VERIFY'],['VERIFIED','AUTHORIZE']]){
  g.view.review={stage,reportId:'SYNTHETIC-REPORT'};await g.w.LeviPrivacyReview.show();
  assert.equal(g.q('[data-review]').elements.action.value,action);assert.equal(g.q('[data-review]').elements.reportId.value,'SYNTHETIC-REPORT');
  assert.equal(g.q('[data-review]').elements.evidenceSha256.value,'','Evidence is never invented');
 }
 assert.equal(g.state.issues,0);assert.equal(g.view.assessment.admittedToSecretVoting,false);g.close();
 console.log('PASS: guided blockers and next review step use server state, without authorization or synthetic evidence.');
})().catch(e=>{console.error(e);process.exitCode=1;});
