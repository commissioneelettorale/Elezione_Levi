'use strict';
const fs=require('node:fs'), assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
const code=fs.readFileSync('lib/privacy-review-ui.js','utf8');
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://localhost/',runScripts:'outside-only'});
const w=dom.window,downloadClicks=[];let pdfCodes=[],issues=0, revoked=[];
w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
w.confirm=()=>true;
w.URL.createObjectURL=()=> 'blob:private-'+(++w.__blobCounter|| (w.__blobCounter=1));
w.URL.revokeObjectURL=u=>revoked.push(u);
w.HTMLAnchorElement.prototype.click=function(){downloadClicks.push({file:this.download,href:this.href});};
w.jspdf={jsPDF:class{
 constructor(){this.lines=[];}setFontSize(){}addPage(){}line(){}
 text(t){this.lines.push(t);pdfCodes.push(t);}
 output(){return new w.Blob(['%PDF-1.4\nSYNTHETIC ONLY\n'+this.lines.join('\n')],{type:'application/pdf'});}
}};
w.eval(code);
const batch=[{tipo:'STUDENTE',classe:'1A',count:1,electionKey:''}];
const profile={fields:{}};
const view={role:'COMMISSIONE',year:'2026/2027',privacyMode:'PRESENTIAL_UNLINKED_V1',batches:[],review:{stage:'PREPARATION'},assessment:{admittedToSecretVoting:false},release:{commit:'test'},configurationSha256:'test',privacy:{limitation:'TEST',credentialMode:'PRESENTIAL_UNLINKED_V1',structuralAnonymityVerified:false}};
const api={
 getVotingReview:async()=>({data:view}),
 getDpoReviewProfile:async()=>({data:profile}),
 getDpoDossierMaterials:async()=>({data:{version:'test',sections:[],fields:{}}}),
 createAnonymousCredentials:async()=>{issues++;return{data:{codes:['STU-ABC123'],tipo:'STUDENTE',classe:'1A',electionKey:''}};}
};
const next=()=>new Promise(resolve=>setTimeout(resolve,35));
(async()=>{
 w.LeviPrivacyReview.configure({api,config:()=>({annoScolastico:'2026/2027'}),notify:()=>{},logs:async()=>({}),saveMode:async()=>{}});
 await w.LeviPrivacyReview.show();
 const form=w.document.querySelector('[data-batch]');assert.ok(form);
 form.elements.tipo.value='STUDENTE';form.elements.classe.value='1A';
 form.elements.count.value='1';form.elements.protocolRef.value='TEST-SYNTHETIC';
 const button=form.querySelector('button:not([type])');
 form.onsubmit({preventDefault(){},submitter:button,target:form});
 await next();
 let link=w.document.querySelector('[data-credential-retry],[data-credentialRetry],[data-credential-retry]')||w.document.querySelector('[data-credential-retry]');
 assert.ok(link,'A retained PDF retry link is visible after the dialog refresh');
 assert.match(link.download,/Cedolini_non_nominativi_STUDENTE/);
 assert.equal(issues,1,'Only one credential batch is emitted');
 assert.equal(downloadClicks.length,1,'Automatic download attempted');
 assert.ok(pdfCodes.includes('STU-ABC123'),'The PDF contains the single synthetic credential');
 link.click();assert.equal(downloadClicks.length,2,'User can retry download without new server issuance');
 assert.equal(issues,1);
 const b2=w.document.querySelector('[data-batch]');
 b2.onsubmit({preventDefault(){},submitter:b2.querySelector('button:not([type])'),target:b2});
 assert.equal(issues,1,'No repeated issuance until the PDF is confirmed');
 const done=w.document.querySelector('[data-confirm-receipt]');
 assert.ok(done,'The operator must acknowledge receipt');
 done.click();
 await next();
 assert.ok(revoked.length>=1,'Private browser object URL is revoked after acknowledgment');
 w.LeviPrivacyReview.clear();
 assert.ok(!w.document.getElementById('privacy-review-dialog'),'Close clears the private dialog');
 console.log('PASS: single-code PDF, manual retry, no second issuance, explicit custody confirmation, private URL cleanup. Synthetic test only.');
})().catch(e=>{console.error(e);process.exitCode=1;});
