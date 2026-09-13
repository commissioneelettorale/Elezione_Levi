'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {jsPDF}=require('../vendor/jspdf.umd.min.js');require('../vendor/jspdf.plugin.autotable.min.js').applyPlugin(jsPDF);
const JSZip=require('../vendor/jszip.min.js'),definition=require('../lib/dpo-dossier');
let blobs=[],notifications=[],failResource=false;
class Url extends URL{static createObjectURL(blob){blobs.push(blob);return 'blob:test-only';}static revokeObjectURL(){}}
const review={year:'2026/2027',release:{commit:'a'.repeat(40),environment:'SYNTHETIC TEST'},configurationSha256:'b'.repeat(64),review:{stage:'PREPARATION'},assessment:{admittedToSecretVoting:false,controls:[{id:'backupPlanReady',status:'NON_VERIFICATO',note:''}]}};
const profile={fields:{},dpo:{name:'Vargiu Scuola S.r.l.',email:'dpo@vargiuscuola.it'}};
const data={generatedAt:'2026-09-13T12:00:00Z',review,profile,technical:{snapshotUntil:'2026-09-13T12:00:00Z',logs:[{id:'TEST-REPORT',technicianName:'Tecnico fittizio',at:'2026-09-13T11:00:00Z',release:review.release,configurationSha256:review.configurationSha256,result:'NON_COMPLETO',report:{tests:[{id:'restore',outcome:'NOT_TESTED',evidence:'',method:'',observed:'',expected:''}]}}]}};
const context={window:{jspdf:{jsPDF},JSZip,LeviDpoDossier:definition},URL:Url,Blob,TextEncoder,crypto:crypto.webcrypto,Uint8Array,ArrayBuffer,Date,console,setTimeout:()=>0,document:{baseURI:'https://example.test/',createElement:()=>({click(){}})},fetch:async url=>{
 const path=new URL(url).pathname.slice(1);if(failResource&&path==='anonimato.html')return {ok:false};
 const value=path==='docs/verifiche-sviluppo.json'?'{"scope":"SYNTHETIC EXPORT TEST"}':fs.readFileSync(path,'utf8');
 return {ok:true,text:async()=>value,json:async()=>JSON.parse(value)};
}};
vm.createContext(context);vm.runInContext(fs.readFileSync('lib/privacy-review-ui.js','utf8'),context);
const ui=context.window.LeviPrivacyReview;ui.configure({api:{getVotingReview:async()=>({data:review}),getDpoReviewProfile:async()=>({data:profile}),getVotingReviewEvents:async()=>({data:{snapshotUntil:data.technical.snapshotUntil,events:[],nextCursor:null}})},logs:async()=>data.technical,config:()=>({annoScolastico:'2026/2027'}),notify:(...n)=>notifications.push(n)});
(async()=>{
 const pdf=Buffer.from(await ui.makePdf(data));assert.ok(pdf.length>30000);
 const folder=process.env.LEVI_DOCUMENT_TEST_DIR;if(folder){fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(folder+'/fascicolo-dpo.pdf',pdf);}
 const button={textContent:'Download',disabled:false};await ui.exportDossier(button);
 assert.equal(blobs.length,1,JSON.stringify(notifications));assert.equal(button.disabled,false);
 const zip=await JSZip.loadAsync(Buffer.from(await blobs[0].arrayBuffer()));
 const manifest=JSON.parse(await zip.file('MANIFEST_SHA256.json').async('string'));assert.equal(manifest.files.length,10);
 for(const entry of manifest.files){const bytes=await zip.file(entry.name).async('nodebuffer');assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),entry.sha256,entry.name);}
 const matrix=JSON.parse(await zip.file('matrice-conformita.json').async('string'));assert.equal(matrix.admittedToSecretVoting,false);assert.equal(matrix.controls[0].status,'NON_VERIFICATO');
 if(folder)fs.writeFileSync(folder+'/fascicolo-dpo.zip',Buffer.from(await blobs[0].arrayBuffer()));
 failResource=true;await ui.exportDossier(button);assert.equal(blobs.length,1,'missing file must not produce a partial archive');assert.equal(notifications.at(-1)[2],'error');
 assert.ok(definition.sections.length>=14);assert.ok(definition.reviewSections(data).some(s=>(s.paragraphs||[]).some(p=>p.includes('NON DOCUMENTATO'))));
 console.log('PASS: actual DPO PDF and ZIP, ten entries with matching SHA-256, missing evidence remains unverified, interrupted export creates no archive.');
})().catch(e=>{console.error(e);process.exitCode=1;});
