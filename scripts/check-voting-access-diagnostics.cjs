'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {summarize}=require('../lib/voting-access-diagnostics');
const core=fs.readFileSync('functions/core.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const api=fs.readFileSync('api/call.js','utf8');
const example=summarize({
 year:'2026/2027',privacyMode:'PRESENTIAL_UNLINKED_V1',registered:899,anonymousIssued:0,
 suspended:true,closed:false,locked:true,reviewStage:'PROPOSED',
 blockerCodes:['privacyReviewPending'],phase:'OPEN'
});
assert.equal(example.registered,899);
assert.equal(example.anonymousIssued,0);
assert.equal(example.readyForVoting,false);
assert.ok(example.messages.some(x=>x.includes('sospese')));
assert.ok(example.messages.some(x=>x.includes('I token nominativi')));
assert.ok(example.messages.some(x=>x.includes('Revisione privacy')));
assert.equal(summarize({privacyMode:'LEGACY_NAMED',registered:899,anonymousIssued:0}).readyForVoting,false);
const ready=summarize({privacyMode:'PRESENTIAL_UNLINKED_V1',registered:2,anonymousIssued:2,reviewStage:'AUTHORIZED',blockerCodes:[],suspended:false,closed:false,migrationPending:false});
assert.equal(ready.readyForVoting,true);
assert.match(core,/exports\.getVotingAccessDiagnostics = async \(request\)/);
const f=core.slice(core.indexOf('exports.getVotingAccessDiagnostics ='),core.indexOf('exports.getVoterRegisterSummary=',core.indexOf('exports.getVotingAccessDiagnostics =')));
assert.match(f,/requireAuth\(request, \['COMMISSIONE'\]\)/);
assert.match(f,/\.count\(\)\.get\(\)/);
assert.doesNotMatch(f,/tx\.update|tx\.create|\.set\(|\.delete\(|\.add\(/);
assert.doesNotMatch(f,/\.docs\[|\.where\(|password|nome|cognome|\.get\(\).*voti_/);
assert.match(api,/"getVotingAccessDiagnostics"/);
assert.match(html,/window\.inspectVotingAccess = async function/);
assert.match(html,/id="voting-access-check-button"/);
const login=html.slice(html.indexOf('window.handleStudentLogin = async function()'),html.indexOf('function renderDashboard(',html.indexOf('window.handleStudentLogin = async function()')));
assert.doesNotMatch(login,/if\(ws\.configured && !ws\.open\)/);
assert.match(login,/SECURE_API\.validateVoterToken/);
console.log('PASS: lightweight aggregate-only diagnostics, no token or ballot reads, no mutations, browser defers to backend.');
