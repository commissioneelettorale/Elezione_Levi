'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');
const between=(a,b)=>html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)));
const collaudo=between('function renderCollaudoTab(container)', 'window.setElectionTestMode =');
const tecnico=between('function renderTechnicalDashboard(container)', 'window.refreshTechnicalDashboard =');
const scrutinio=between('async function renderScrutinioTab(container)', 'window.setClassNoElected=');
assert.ok(!collaudo.includes("downloadDhondtMinutesDocx"),'Quotient minutes must not be in collaudo');
assert.ok(!collaudo.includes("renderTechnicalEvidenceForm()"),'No duplicate report in Commission area');
assert.ok(collaudo.includes('school-test-users'),'Commission simulation retained');
assert.ok(tecnico.includes("renderTechnicalEvidenceForm()"),'Technical report must be under technical login');
assert.ok(scrutinio.includes("downloadDhondtMinutesDocx"),'Quotient minutes must be in scrutiny');
assert.ok(scrutinio.includes("generateElectionMinutesDocx"),'Results minutes must be in scrutiny');
assert.ok(html.includes("Unico verbale generale del tecnico"),'Missing simplified report heading');
assert.ok(collaudo.includes("Apri verifica ed evidenze DPO"),'Guided privacy action must appear in Collaudo');
assert.ok(collaudo.includes("Scarica bozza per il verbale"),'Local draft minute action must appear in Collaudo');
assert.ok(html.includes("window.downloadPendingPrivacyChecksMemo = function()"),'Draft generator missing');
assert.ok(html.includes("return window.openPrivacyReview({focus:'anonymity'})"),'DPO button must focus evidence review');
assert.ok(!collaudo.includes("setRegularityControl({"),'Collaudo display must not bypass admission');
assert.ok(html.includes("non autorizza l’apertura delle votazioni"),'Pending verification must not be described as authorized');

assert.match(collaudo,/openMimPrivacyCheck\(&quot;\$\{k\}&quot;\)/,'Sensitive privacy checks must have actionable buttons');
assert.ok(!collaudo.includes('disabled title="Verifica nel fascicolo DPO"'),'Sensitive checkboxes must not be inert');
assert.match(html,/Verifica indipendente non attestata automaticamente/,'Do not present privacy checks as passed');
assert.match(html,/return window\.openPrivacyReview\(\)/,'Clicking privacy checks must open actual DPO review');
assert.match(html,/if\(\['metadataUnlinkabilityReviewed','structuralSeparationReviewed'\]\.includes\(control\)\)return window\.openPrivacyReview\(\)/,'Existing sensitive settings must not be self-attested');

console.log('PASS: unique technical report, Commission simulation and election minutes in scrutiny');
