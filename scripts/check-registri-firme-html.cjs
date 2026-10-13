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
assert.match(content,/link\.download='REGISTRI_FIRME_GENITORI_STUDENTI_/);
assert.match(content,/registri-firme-zip-download/);
assert.match(content,/REGISTRI_FIRME_GENITORI_STUDENTI_/);
const appended=content.slice(content.indexOf('// Funzione di stampa amministrativa:'));
assert.doesNotMatch(appended,/setDoc|updateDoc|deleteDoc|addDoc|writeBatch|runTransaction/);

// Verificare la scadenza firmata senza eccezioni che estendano un incarico.
const guardStart=content.indexOf('if(claims.staffExpiresAt == null)');
const guardEnd=content.indexOf('if(!root.JSZip',guardStart);
assert.ok(guardStart>=0&&guardEnd>guardStart);
const expiryGuard=content.slice(guardStart,guardEnd);
function expiryAllows(claims){
 try {
  vm.runInNewContext(expiryGuard,{claims,Date:{now:()=>1_797_000_000_000},Number,Error});
  return true;
 }catch(e){return false;}
}
assert.equal(expiryAllows({role:'COMMISSIONE'}),false,'Older Commission sessions require new login');
assert.equal(expiryAllows({role:'COMMISSIONE',staffExpiresAt:1_798_000_000}),true);
assert.equal(expiryAllows({role:'COMMISSIONE',staffExpiresAt:1_796_000_000}),false);
assert.equal(expiryAllows({role:'COMMISSIONE',staffExpiresAt:'invalid'}),false);
assert.match(content,/getIdTokenResult\(true\)/);
assert.match(content,/Accesso Commissione da aggiornare/);
assert.match(content,/getDocsFromServer/);
console.log('PASS: ZIP download embedded in existing HTML assets; Commission-only; separate parent/student class PDFs; names and blank signatures only.');
