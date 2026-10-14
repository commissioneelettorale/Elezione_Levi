'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const content=fs.readFileSync('lib/accesso-atti.js','utf8');
const first=content.indexOf('function clean(v)');
const last=content.indexOf('function report(title,message,kind)',first);
assert.ok(first>0&&last>first,'Signature-only grouping and PDF renderer must exist');
const lines=[];
const runtime=vm.createContext({Intl,Map,Set,Error,String});
vm.runInContext(content.slice(first,last),runtime);
const actual=vm.runInContext('buildGroups',runtime);
const makePdf=vm.runInContext('makePdf',runtime);
const rows=[
 {nome:'ROSSI MARIA',classe:'1A',tipo:'GENITORE',id:'GEN-123AAA',token:'GEN-123AAA',ref:'REF-77',voted_istituto:true},
 {nome:'BIANCHI ANNA',classe:'1A',tipo:'GENITORE'},
 {nome:'VERDI MARCO',classe:'1A',tipo:'STUDENTE',token:'STU-45AA66'},
 {nome:'COLOMBO LUCA',classe:'2B',tipo:'STUDENTE'},
 {nome:'DOCENTE TEST',classe:'GEN',tipo:'DOCENTE'}
];
const groups=actual(rows);
assert.equal(groups.length,3);
assert.deepEqual(JSON.parse(JSON.stringify(groups.map(g=>g.tipo+'|'+g.classe))),['GENITORE|1A','STUDENTE|1A','STUDENTE|2B']);
assert.deepEqual(JSON.parse(JSON.stringify(groups[0].nominativi)),['BIANCHI ANNA','ROSSI MARIA']);
assert.ok(!JSON.stringify(groups).includes('REF-77'));
assert.ok(!JSON.stringify(groups).includes('GEN-123AAA'));
assert.ok(!JSON.stringify(groups).includes('STU-45AA66'));
assert.ok(!JSON.stringify(groups).includes('voted_istituto'));
assert.throws(()=>actual([{tipo:'GENITORE',nome:'ROSSI',classe:'1A'}]),/Mancano/);
const parents=actual(rows,'GENITORE');
const students=actual(rows,'STUDENTE');
assert.equal(parents.length,1,'Genitori: un registro per classe');
assert.equal(students.length,2,'Studenti: un registro per classe');
assert.ok(parents.every(g=>g.tipo==='GENITORE'));
assert.ok(students.every(g=>g.tipo==='STUDENTE'));
assert.deepEqual(JSON.parse(JSON.stringify(students.map(g=>g.classe))),['1A','2B']);
assert.throws(()=>actual(rows,'DOCENTE'),/Componente registro non valida/);
assert.throws(()=>actual([{tipo:'STUDENTE',classe:'1A',nome:'VERDI'}],'GENITORE'),/Nessun nominativo/);
assert.throws(()=>actual([{tipo:'STUDENTE',nome:'',classe:'1A'}]),/incompleto/);
class FakePDF{
 setFont(){}setFontSize(){}setLineWidth(){}rect(){}addPage(){}
 splitTextToSize(text){return [text];}
 text(value){lines.push(...(Array.isArray(value)?value:[value]));}
 output(){return new ArrayBuffer(7);}
}
const pdf=makePdf(groups[0],FakePDF);
assert.ok(pdf instanceof ArrayBuffer);
assert.ok(lines.includes('COGNOME E NOME'));
assert.ok(lines.includes('FIRMA'));
assert.ok(lines.includes('BIANCHI ANNA'));
assert.ok(lines.includes('ROSSI MARIA'));
assert.doesNotMatch(lines.join('\n'),/GEN-123AAA|REF-77|token|voted_istituto/i);
assert.match(content,/claims\.role!=='COMMISSIONE'/);
assert.match(content,/getDocsFromServer/);
assert.match(content,/showSaveFilePicker/);
assert.match(content,/createWritable\(\)/);
assert.match(content,/link\.download='REGISTRI_FIRME_'\+typeLabel/);
assert.match(content,/registri-firme-zip-download/);
assert.match(content,/const typeLabel=onlyType==='GENITORE'/);
assert.match(content,/for\(const type of \['GENITORE','STUDENTE'\]\)/);
assert.match(content,/const id='registri-firme-zip-'\+type/);
assert.match(content,/button\.addEventListener\('click',\(\)=>download\(type\)\)/);
assert.match(content,/button\.addEventListener\('click',\(\)=>download\(\)\)/);
assert.match(content,/pdfClassSelect_/);
assert.match(content,/panel\.appendChild\(wrap\)/);
const appended=content.slice(content.indexOf('// Funzione di stampa amministrativa:'));
assert.doesNotMatch(appended,/setDoc|updateDoc|deleteDoc|addDoc|writeBatch|runTransaction/);

// La Commissione non riceve normalmente staffExpiresAt dal server.
const server=fs.readFileSync('functions/core.js','utf8');
const rules=fs.readFileSync('firestore.rules','utf8');
assert.match(server,/const MANAGEMENT_ROLES = new Set\(\['DIRIGENTE'/);
assert.doesNotMatch(server.match(/const MANAGEMENT_ROLES = new Set\((.*?)\);/s)?.[1]||'',/COMMISSIONE/);
assert.match(rules,/function isCommission\(\)/);
assert.match(rules,/account\.get\('sessionVersion', 0\) == request\.auth\.token\.get\('sessionVersion', 0\)/);
assert.match(rules,/collectionId == 'tokens_'/);
const guardStart=content.indexOf('if(claims.staffExpiresAt !== undefined && claims.staffExpiresAt !== null)');
const guardEnd=content.indexOf('if(!root.JSZip',guardStart);
assert.ok(guardStart>=0&&guardEnd>guardStart);
const expiryGuard=content.slice(guardStart,guardEnd);
function expiryAllows(claims){
 try {
  vm.runInNewContext(expiryGuard,{claims,Date:{now:()=>1_797_000_000_000},Number,Error});
  return true;
 }catch(e){return false;}
}
assert.equal(expiryAllows({role:'COMMISSIONE'}),true,'Sessione Commissione senza claim scadenza prevista dal server');
assert.equal(expiryAllows({role:'COMMISSIONE',staffExpiresAt:null}),true);
assert.equal(expiryAllows({role:'COMMISSIONE',staffExpiresAt:1_798_000_000}),true);
assert.equal(expiryAllows({role:'COMMISSIONE',staffExpiresAt:1_796_000_000}),false);
assert.equal(expiryAllows({role:'COMMISSIONE',staffExpiresAt:'invalid'}),false);
assert.equal(expiryAllows({role:'COMMISSIONE',staffExpiresAt:0}),false);
assert.match(content,/claims\.role!=='COMMISSIONE'/);
assert.match(content,/getIdTokenResult\(true\)/);
assert.match(content,/getDocsFromServer/);

// Il Registro Studenti deve poter stampare anche con statistiche/urne assenti.
const html=fs.readFileSync('index.html','utf8');
const regStart=html.indexOf('async function renderRegisterTab(');
const regEnd=html.indexOf('window.generateClassTokensPDF',regStart);
assert.ok(regStart>0&&regEnd>regStart);
const registerTab=html.slice(regStart,regEnd);
assert.match(registerTab,/anonSummary=await Promise\.race/);
assert.doesNotMatch(registerTab,/Riepilogo non disponibile: riprovare/);
assert.match(registerTab,/voted===null\?'—':voted/);
assert.match(html,/onSnapshot\(q, \{includeMetadataChanges:true\}/);
assert.match(html,/tokensListenerServerReady = snapshot\.metadata\?\.fromCache === false/);
// Nessuna credenziale o ID nel bridge tra registro autorizzato e ZIP.
const bridgeStart=html.indexOf('window.getAuthorizedSignatureRegisterSnapshot = async function(');
const bridgeEnd=html.indexOf('function collectConfigFormFields()',bridgeStart);
assert.ok(bridgeStart>0&&bridgeEnd>bridgeStart);
const bridge=html.slice(bridgeStart,bridgeEnd);
assert.match(bridge,/getIdTokenResult\(true\)/);
assert.match(bridge,/tokensListenerServerReady/);
assert.match(bridge,/commissionSessionReady/);
assert.match(bridge,/\.map\(row=>\(\{nome:row\.nome,classe:row\.classe,tipo:row\.tipo\}\)\)/);
assert.doesNotMatch(bridge,/token:row\.|id:row\.|ref:row\.|hasVoted:row\./);
assert.match(content,/getAuthorizedSignatureRegisterSnapshot\(onlyType\)/);
assert.match(content,/if\(onlyType && typeof root\.getAuthorizedSignatureRegisterSnapshot/);
// Browser-side authorization tests on synthetic entries only.
const claim={role:'COMMISSIONE',staffYear:'2026/2027'};
const browser={
 window:{}, auth:{currentUser:{getIdTokenResult:async()=>({claims:claim})}},
 commissionSessionReady:true,configElezioni:{annoScolastico:'2026/2027'},
 tokensListenerReady:true,tokensListenerServerReady:true,tokensListenerError:'',
 unsubscribeTokens:()=>{},activeTokensList:rows,Date,Number,Error
};
vm.runInNewContext(bridge,browser);
(async()=>{
 const data=await browser.window.getAuthorizedSignatureRegisterSnapshot('STUDENTE');
 assert.equal(data.records.length,2);
 assert.deepEqual(Object.keys(data.records[0]),['nome','classe','tipo']);
 assert.doesNotMatch(JSON.stringify(data),/STU-45AA66|GEN-123AAA|REF-77|voted_istituto/);
 browser.tokensListenerServerReady=false;
 await assert.rejects(browser.window.getAuthorizedSignatureRegisterSnapshot('STUDENTE'),/Registro non ancora confermato/);
 browser.tokensListenerServerReady=true;
 claim.role='REFERENTE';
 await assert.rejects(browser.window.getAuthorizedSignatureRegisterSnapshot('STUDENTE'),/non autorizzata/);
 console.log('PASS: ZIP firme genitori e studenti; registro confermato dal server; nessuna seconda lettura; nessun codice o REF; indipendente dai conteggi.');
})().catch(e=>{console.error(e);process.exitCode=1;});

