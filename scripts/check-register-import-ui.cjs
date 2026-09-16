'use strict';
// Complete application in jsdom, real SheetJS workbook, simulated authenticated API.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {JSDOM}=require(process.env.LEVI_JSDOM||'jsdom');
const XLSX=require('../vendor/xlsx.full.min.js');
const html=fs.readFileSync('index.html','utf8'),dom=new JSDOM(html,{url:'https://example.test/?view=commission',runScripts:'outside-only'}),w=dom.window,d=w.document;
const fixture=fs.readFileSync('scripts/check-dpo-download-browser.cjs','utf8'),context={};
vm.createContext(context);vm.runInContext(fixture.slice(fixture.indexOf('const stubs='),fixture.indexOf('(async()=>{'))+'this.fixture=stubs;',context);
const calls=[],receipts=new Map(),errors=[];let rejectNext=null,loseReplyAt=-1,hold=null,release=null;
w.addEventListener('error',event=>errors.push(event.message));
w.lucide={createIcons(){}};w.scrollTo=()=>{};w.TextEncoder=TextEncoder;
Object.defineProperty(w,'crypto',{value:crypto.webcrypto});
w.fetch=async(url,options)=>{
 assert.equal(url,'https://elezione-levi.vercel.app/api/call');const payload=JSON.parse(options.body);calls.push(payload);
 if(payload.name==='commissionLogin')return{ok:true,json:async()=>({data:{customToken:'SYNTHETIC-CUSTOM-TOKEN',profile:{role:'COMMISSIONE',mustChangePassword:false}}})};
 assert.equal(payload.name,'importVoterRegister');assert.equal(options.headers.Authorization,'Bearer SYNTHETIC-ID-TOKEN');
 assert.equal(options.credentials,'omit');assert.equal(options.cache,'no-store');
 if(hold)await hold;
 if(rejectNext){const error=rejectNext;rejectNext=null;return{ok:false,json:async()=>({error})};}
 const key=payload.data.importId+'_'+payload.data.offset;
 const created=receipts.has(key)?0:payload.data.rows.length;receipts.set(key,payload.data.rows.length);
 if(payload.data.offset===loseReplyAt){loseReplyAt=-1;throw Error('Connessione interrotta (simulazione)');}
 return{ok:true,json:async()=>({data:{confirmed:payload.data.rows.length,created}})};
};
function workbook(rows){const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),'Registro');return XLSX.write(wb,{type:'buffer',bookType:'xlsx'});}
function inputFile(bytes,size=bytes.length){const input=d.getElementById('excelFile_STUDENTE');assert.ok(input);Object.defineProperty(input,'files',{configurable:true,value:[{size,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)}]});return input;}
const importCalls=()=>calls.filter(call=>call.name==='importVoterRegister');
const title=()=>d.getElementById('custom-alert-title').textContent;
const message=()=>d.getElementById('custom-alert-message').textContent;
const tick=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
 for(const file of ['election-policy','legal-readiness','election-sandbox','election-sandbox-ui','voter-register'])w.eval(fs.readFileSync('lib/'+file+'.js','utf8'));
 w.eval(fs.readFileSync('vendor/xlsx.full.min.js','utf8'));
 const main=html.match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(/^\s*import .*;\s*$/gm,'');
 w.eval(Object.values(context.fixture).join('\n').replace(/\bexport /g,'')+'\n'+main);
 const boot=w.onload;w.onload=null;await boot();await tick();
 d.getElementById('adminUsername').value='synthetic-commission';d.getElementById('adminPwd').value='SYNTHETIC-ONLY';await w.checkAdminLogin();await tick();
 w.switchAdminTab('cred_STUDENTE');await tick();
 const bytes=workbook(Array.from({length:805},(_,i)=>({Cognome:'PROVA',Nome:'ALUNNO '+i,Classe:'1A',Indirizzo:'LICEO'})));
 inputFile(bytes);await w.importExcelRegister('STUDENTE');await tick();
 assert.equal(title(),'Successo');assert.match(message(),/805 elettori confermati, 805 nuovi/);
 assert.deepEqual(importCalls().map(call=>call.data.rows.length),[400,400,5]);
 assert.equal(d.getElementById('excelFile_STUDENTE').disabled,false);
 inputFile(bytes);await w.importExcelRegister('STUDENTE');await tick();assert.match(message(),/805 elettori confermati, 0 nuovi/);
 console.log('PASS: real XLSX, all 805 rows through authenticated API, same-file replay, input re-enabled; direct database writes throw in this fixture.');
 const previous=importCalls().length;
 inputFile(Buffer.from('invalid'));await w.importExcelRegister('STUDENTE');await tick();assert.equal(title(),'Errore importazione');assert.equal(importCalls().length,previous);
 inputFile(bytes,11*1024*1024);await w.importExcelRegister('STUDENTE');await tick();assert.match(message(),/10 MB/);assert.equal(importCalls().length,previous);
 const invalidRows=Array.from({length:401},()=>({Nome:'TEST'}));invalidRows[400]={Nome:'<>',Classe:'1A'};inputFile(workbook(invalidRows));await w.importExcelRegister('STUDENTE');await tick();assert.equal(title(),'Errore importazione');assert.equal(importCalls().length,previous);
 console.log('PASS: malformed/oversized files and invalid later rows fail visibly before sending a batch.');
 rejectNext={code:'permission-denied',message:'Missing or insufficient permissions.'};inputFile(bytes);await w.importExcelRegister('STUDENTE');await tick();assert.equal(title(),'Errore importazione');assert.match(message(),/Commissione/);assert.match(message(),/Confermate 0 righe/);assert.doesNotMatch(message(),/Missing or insufficient/);
 rejectNext={code:'failed-precondition',message:'Elenchi elettorali definitivi: importazione bloccata.'};inputFile(bytes);await w.importExcelRegister('STUDENTE');await tick();assert.match(message(),/Elenchi elettorali definitivi/);
 console.log('PASS: session/permission errors are clear; the server reason for a frozen register remains visible.');
 const other=workbook(Array.from({length:805},(_,i)=>({Nome:'ALTRO '+i,Classe:'2A'})));
 loseReplyAt=400;inputFile(other);await w.importExcelRegister('STUDENTE');await tick();assert.equal(title(),'Errore importazione');assert.match(message(),/Confermate 400 righe su 805/);
 inputFile(other);await w.importExcelRegister('STUDENTE');await tick();assert.match(message(),/805 elettori confermati, 5 nuovi/);
 const before=importCalls().length;hold=new Promise(resolve=>{release=resolve;});inputFile(bytes);const first=w.importExcelRegister('STUDENTE');
 await w.importExcelRegister('STUDENTE');await tick();assert.equal(title(),'Importazione in corso');release();hold=null;await first;await tick();assert.equal(importCalls().length,before+3);
 console.log('PASS: lost response recovery, partial progress, and duplicate-click guard.');
 d.getElementById('bulkQty').value='2';d.getElementById('bulkClasse').value='3A';d.getElementById('bulkIndirizzo').value='LICEO';
 loseReplyAt=0;await w.generateBulkTokens('STUDENTE');await tick();const lostId=importCalls().at(-1).data.importId;
 d.getElementById('bulkQty').value='2';d.getElementById('bulkClasse').value='3A';d.getElementById('bulkIndirizzo').value='LICEO';
 await w.generateBulkTokens('STUDENTE');await tick();assert.equal(title(),'Successo');assert.equal(importCalls().at(-1).data.importId,lostId);
 d.getElementById('bulkQty').value='2';d.getElementById('bulkClasse').value='3A';d.getElementById('bulkIndirizzo').value='LICEO';
 await w.generateBulkTokens('STUDENTE');await tick();assert.notEqual(importCalls().at(-1).data.importId,lostId);assert.equal(title(),'Successo');
 assert.deepEqual(errors,[]);
 console.log('PASS: manual generation uses the same guarded API, retries its operation, and gives a fresh operation to a subsequent intentional generation.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>w.close());
