'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {spawnSync}=require('node:child_process');
const core=fs.readFileSync('functions/core.js','utf8');
const ui=fs.readFileSync('lib/privacy-review-ui.js','utf8');
const html=fs.readFileSync('index.html','utf8');
assert.match(core,/structuralAnonymityVerified:false/,'Do not certify structural secrecy without proof');
assert.match(core,/clientSideBallotEncryption:false/,'Do not claim E2E encryption');
assert.match(core,/independentDecryptionTrustees:false/,'Do not claim independent key custody');
assert.match(core,/databaseTransactionCorrelationPossible:true/,'Do not hide transaction correlation');
assert.match(ui,/MODALITÀ PREVISTA NEL BACKEND/);
assert.match(ui,/NON DIMOSTRATA/);
assert.match(ui,/NON VERIFICATA — non modificabile/);
assert.match(html,/Valutazione indipendente della segretezza strutturale/);
const admission=fs.readFileSync('lib/voting-admission.js','utf8');
assert.match(admission,/structuralBlockers/);
assert.match(admission,/stage!=='AUTHORIZED'/);
for(const path of ['lib/privacy-review-ui.js','functions/core.js']){
 const out=spawnSync(process.execPath,['--check',path],{encoding:'utf8'});
 assert.equal(out.status,0,out.stderr);
}
console.log('PASS: accurate code-vs-independent assessment; strict vote admission and technical report preserved.');
