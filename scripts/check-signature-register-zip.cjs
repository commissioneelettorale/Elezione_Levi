'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const lib=require('../lib/signature-register-export');
const raw=[
 {id:'STU-ABC123',tipo:'STUDENTE',nome:'ROSSI LUCA',classe:'1A',token:'STU-ABC123',ref:'REF-X',password:'NON-USARE'},
 {id:'GEN-234XYZ',tipo:'GENITORE',nome:'BIANCHI MARIA',classe:'1A',token:'GEN-234XYZ',indirizzo:'RISERVATO'},
 {id:'GEN-XXAAA2',tipo:'GENITORE',nome:'DE LUCA ANNA MARIA',classe:'2B',hasVoted:true},
 {id:'DOC-222333',tipo:'DOCENTE',nome:'DOCENTE TEST',classe:'GEN'}
];
const groups=lib.groupRows(raw);
assert.deepEqual(groups.map(x=>x.tipo+' '+x.classe),['GENITORE 1A','GENITORE 2B','STUDENTE 1A']);
assert.deepEqual(Object.keys(groups[0]),['tipo','classe','nominativi']);
assert.equal(JSON.stringify(groups).includes('GEN-234XYZ'),false);
assert.equal(JSON.stringify(groups).includes('STU-ABC123'),false);
assert.equal(JSON.stringify(groups).includes('REF-X'),false);
assert.equal(JSON.stringify(groups).includes('RISERVATO'),false);
assert.equal(JSON.stringify(groups).includes('hasVoted'),false);
assert.deepEqual(lib.groupRows([{tipo:'GENITORE',classe:'1A',nome:'BIANCHI MARIA'},{tipo:'GENITORE',classe:'1A',nome:'BIANCHI MARIA'}])[0].nominativi,['BIANCHI MARIA','BIANCHI MARIA'],'Do not silently discard duplicate database rows');
assert.throws(()=>lib.assertGroups([{tipo:'GENITORE',classe:'1A',nominativi:['BIANCHI MARIA']}]),/entrambi/);
const textLines=[];
class MockPDF {
 constructor(){this.lines=[]}
 setFont(){}setFontSize(){}setDrawColor(){}setLineWidth(){}rect(){}addPage(){}
 splitTextToSize(t){return [t]}
 text(t){textLines.push(...(Array.isArray(t)?t:[t]))}
 output(){return new ArrayBuffer(10)}
}
class MockZip {
 constructor(){this.files=[]}
 file(path,data){this.files.push(path);assert.ok(data instanceof ArrayBuffer);}
 async generateAsync(){return {files:this.files}}
}
(async()=>{
 const zipped=await lib.createZip({groups},{JSZip:MockZip,jsPDF:MockPDF});
 assert.equal(zipped.files.length,3);
 assert.deepEqual(zipped.files.sort(),[
  'GENITORI/REGISTRO_GENITORI_CLASSE_1A.pdf',
  'GENITORI/REGISTRO_GENITORI_CLASSE_2B.pdf',
  'STUDENTI/REGISTRO_STUDENTI_CLASSE_1A.pdf'
 ]);
 assert.ok(textLines.includes('FIRMA'));
 assert.ok(textLines.includes('COGNOME E NOME'));
 assert.ok(textLines.includes('BIANCHI MARIA'));
 assert.ok(textLines.includes('DE LUCA ANNA MARIA'));
 assert.doesNotMatch(textLines.join('|'),/STU-ABC123|GEN-234XYZ|REF-X|RISERVATO|hasVoted|INDIRIZZO|TOKEN/);
 const core=fs.readFileSync('functions/core.js','utf8'),api=fs.readFileSync('api/call.js','utf8'),html=fs.readFileSync('index.html','utf8');
 const a=core.indexOf('exports.exportSignatureRegisters = async'),b=core.indexOf('exports.getVoterRegisterSummary=',a);
 assert.ok(a>0&&b>a);
 const fn=core.slice(a,b);
 assert.match(fn,/requireAuth\(request, \['COMMISSIONE'\]\)/);
 assert.match(fn,/\.select\('nome','classe','tipo'\)/);
 assert.doesNotMatch(fn,/\.update\(|tx\.create\(|tx\.set\(|\.delete\(|\.add\(|\.where\(/);
 assert.doesNotMatch(fn,/\.doc\.id|\.id\b.*return/);
 assert.match(api,/"exportSignatureRegisters"/);
 assert.match(html,/window\.downloadAllSignatureRegistersZip=async function/);
 assert.match(html,/id="signature-zip-button"/);
 assert.match(html,/<script src="lib\/signature-register-export\.js"><\/script>/);
 console.log('PASS: no token/REF/ID, no ballots, per-class parents/students PDF ZIP and only Commission reads projected Firestore records.');
})().catch(e=>{console.error(e);process.exitCode=1;});
