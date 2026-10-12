'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {JSDOM}=require(process.env.LEVI_JSDOM||'jsdom');
const {spawnSync}=require('node:child_process');
const html=fs.readFileSync('index.html','utf8');
const block=html.match(/<script type="module">([\s\S]*?)<\/script>/);
assert.ok(block,'App module missing');
const js=spawnSync(process.execPath,['--check','--input-type=module'],{input:block[1],encoding:'utf8'});
assert.equal(js.status,0,'App syntax: '+js.stderr);
const backend=spawnSync(process.execPath,['--check','functions/core.js'],{encoding:'utf8'});
assert.equal(backend.status,0,'Server syntax: '+backend.stderr);
const dom=new JSDOM('<section id="target"></section>',{url:'https://example.test/',runScripts:'outside-only'});
const d=dom.window.document;
const calls=[];
const ctx={
 window:dom.window,document:d,FormData:dom.window.FormData,Date,Intl,
 LeviElectionPolicy:require('../lib/election-policy'),
 SECURE_API:{recordTechnicalTestReport:async data=>{calls.push(data);return {data:{id:'TEST-REPORT',result:'NON_COMPLETO'}};}},
 configElezioni:{annoScolastico:'2026/2027'},currentTechnicalData:null,
 technicalEscape:s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;'),
 renderPrivacyGuidance:()=>''
};
vm.createContext(ctx);
let start=html.indexOf('        const TECHNICAL_TEST_LABELS');
let end=html.indexOf('        async function fetchCompleteTechnicalLog()',start);
assert.ok(start>=0&&end>start);
vm.runInContext(html.slice(start,end),ctx);
d.querySelector('#target').innerHTML=ctx.renderTechnicalEvidenceForm();
const form=d.getElementById('technical-evidence-form');
assert.ok(form);
assert.equal(form.querySelectorAll('input[name^="testedAt_"]').length,12);
assert.equal(form.querySelectorAll('button[onclick^="window.fillTechnicalTestNow"]').length,12);
const identity=form.elements.namedItem('outcome_identity');
const field=n=>form.elements.namedItem(n);
field('softwareVersion').value='9'.repeat(40);
field('evidenceRef').value='VERBALE-TEST/2026';
field('testEnvironment').checked=true;
identity.value='PASS';
field('evidence_identity').value='Allegato prova fittizia 01';
field('method_identity').value='Verifica con credenziali fittizie';
field('expected_identity').value='Un accesso consentito';
field('observed_identity').value='Una autenticazione registrata';
(async()=>{
 // Critical: imported narratives do not imply any test has been performed today.
 await ctx.window.saveTechnicalTestReport(form);
 assert.equal(calls.length,0);
 const status=form.querySelector('[data-report-status]');
 assert.match(status.textContent,/Identificazione e consegna personale/);
 assert.match(status.textContent,/data e ora/);
 assert.equal(identity.closest('fieldset').querySelector('details').open,true);
 const when=field('testedAt_identity');
 assert.equal(when.value,'');
 when.value='2037-10-08T10:00';
 await ctx.window.saveTechnicalTestReport(form);
 assert.equal(calls.length,0);
 assert.match(status.textContent,/non futura/);
 const button=identity.closest('fieldset').querySelector('button[onclick^="window.fillTechnicalTestNow"]');
 ctx.window.fillTechnicalTestNow(button);
 assert.match(when.value,/^20\d\d-\d\d-\d\dT\d\d:\d\d$/);
 await ctx.window.saveTechnicalTestReport(form);
 assert.equal(calls.length,1,'Exactly one backend call when fields are complete');
 assert.equal(calls[0].tests.identity.outcome,'PASS');
 assert.match(calls[0].tests.identity.testedAt,/Z$/);
 assert.equal(calls[0].tests.anonymity.outcome,'NOT_TESTED');
 assert.equal(calls[0].tests.anonymity.testedAt,'');
 console.log('PASS: timezone-aware test date, targeted missing-field guidance, no premature submission, no fabricated PASS from import.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>dom.window.close());
