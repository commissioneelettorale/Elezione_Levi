'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{JSDOM}=require(process.env.LEVI_JSDOM||'jsdom');
const html=fs.readFileSync('index.html','utf8');
const original=html.indexOf('        // Lo storico si consulta soltanto su richiesta.');
const final=html.indexOf('        window.saveTechnicalTestReport = async function(form) {',original);
assert.ok(original>0&&final>original);
const scope=html.slice(original,final);
const labels={identity:'Identificazione',revokedAccess:'Ruoli'};
const dom=new JSDOM('<button id="load"></button><select id="technical-import-select"></select><label id="technical-import-select-wrap" hidden></label><p id="technical-import-status"></p><form id="technical-evidence-form"><input name="softwareVersion"><input name="evidenceRef"><textarea name="note"></textarea><input type="checkbox" name="testEnvironment"></form>',{url:'https://example.test'});
const d=dom.window.document,form=d.getElementById('technical-evidence-form');
for(const id of Object.keys(labels)){
  form.insertAdjacentHTML('beforeend','<input name="method_'+id+'"><input name="expected_'+id+'"><input name="observed_'+id+'"><input name="evidence_'+id+'"><input name="testedAt_'+id+'"><select name="outcome_'+id+'"><option value="NOT_TESTED">No</option><option value="PASS">Yes</option></select><p data-previous-outcome="'+id+'"></p>');
}
const past='a'.repeat(40),current='b'.repeat(40);
const report={id:'history_01',event:'COLLAUDO',result:'PROVE_DICHIARATE_SUPERATE',technicianName:'TECNICO DI PROVA',at:'2026-10-08T09:00:00Z',release:{commit:past},configurationSha256:'pastconfig',note:'Nota del vecchio rapporto',report:{softwareVersion:past,evidenceRef:'Verbale collaudo 2026',tests:[{id:'identity',outcome:'PASS',method:'Metodologia',expected:'Esito atteso',observed:'Esito storico',evidence:'Documento scuola',testedAt:'2026-10-08T08:00:00Z'}]}};
let calls=0,writes=0;
const context={window:dom.window,document:d,console,configElezioni:{annoScolastico:'2026/2027'},TECHNICAL_TEST_LABELS:labels,TECHNICAL_OUTCOME_LABELS:{PASS:'Superata'},currentTechnicalStatus:{legalAssessment:{release:{commit:current},configurationSha256:'newconfig'}},SECURE_API:{getTechnicalLogs:async()=>{calls++;return {data:{ok:true,logs:[report],nextCursor:null,snapshotUntil:'2026-10-09T10:00:00Z'}}},recordTechnicalTestReport:async()=>{writes++}}};
vm.createContext(context);vm.runInContext(scope,context);
(async()=>{
  await context.window.loadPreviousTechnicalReports(d.getElementById('load'));
  assert.equal(calls,1,'Only one audit page requested');
  assert.equal(writes,0,'An import cannot register a report');
  assert.equal(form.elements.namedItem('softwareVersion').value,current);
  assert.equal(form.elements.namedItem('evidenceRef').value,'Verbale collaudo 2026');
  assert.equal(form.elements.namedItem('method_identity').value,'Metodologia');
  assert.equal(form.elements.namedItem('observed_identity').value,'Esito storico');
  assert.equal(form.elements.namedItem('evidence_identity').value,'Documento scuola');
  for(const id of Object.keys(labels)){
    assert.equal(form.elements.namedItem('outcome_'+id).value,'NOT_TESTED','No prior PASS is accepted automatically');
    assert.equal(form.elements.namedItem('testedAt_'+id).value,'','Historical times cannot become times of new tests');
  }
  assert.equal(form.elements.namedItem('testEnvironment').checked,false);
  assert.match(d.getElementById('technical-import-status').textContent,/configurazioni non sono attestate/);
  assert.match(d.querySelector('[data-previous-outcome="identity"]').textContent,/Storico|Esito storico/);
  assert.equal(d.getElementById('technical-import-select-wrap').hidden,false);
  console.log('PASS: import only one historical audit page; text copied, 0 writes, historical PASS and dates not propagated, current release shown.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>dom.window.close());
