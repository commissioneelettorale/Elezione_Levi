'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const {spawnSync}=require('node:child_process');
const html=fs.readFileSync('index.html','utf8');
assert.ok(!html.includes('id="privacy-shield"'),'Blackout overlay must not exist');
assert.ok(!html.includes('showPrivacyShield('),'Blackout hooks must not exist');
assert.ok(!html.includes('enterProtectedCabin('),'Fullscreen re-entry must not exist');
assert.ok(!html.includes('secure-watermark'),'Watermark must not obstruct the cabin');
assert.match(html,/key==='printscreen'/);
assert.match(html,/function summarizeTechnicalRegistrations\(logs\)/);
assert.match(html,/technical-recorded-checkpoints/);
assert.match(html,/fetchCompleteTechnicalLog\(\)/);
const match=html.match(/<script type="module">([\s\S]*?)<\/script>/);
assert.ok(match,'Inline app module missing');
const syntax=spawnSync(process.execPath,['--check','--input-type=module'],{input:match[1],encoding:'utf8'});
assert.equal(syntax.status,0,'App JS module syntax: '+syntax.stderr);
const from=match[1].indexOf('function summarizeTechnicalRegistrations(logs)');
const to=match[1].indexOf('function renderTechnicalRegistrations(',from);
assert.ok(from>0&&to>from);
const context={};
vm.runInNewContext(match[1].slice(from,to)+'\nthis.run=summarizeTechnicalRegistrations;',context);
const logs=[
 {event:'OPENING',id:'old',at:'2026-10-06T09:00:00Z'},
 {event:'OPENING',id:'new',at:'2026-10-08T09:00:00Z',result:'ATTENZIONE'},
 {event:'CLOSING',id:'end',at:'2026-10-08T10:00:00Z'},
 {event:'COLLAUDO',id:'report',at:'2026-10-08T11:00:00Z'}
];
const summary=context.run(logs);
assert.equal(summary.opening.id,'new');
assert.equal(summary.closing.id,'end');
assert.equal(summary.report.id,'report');
assert.equal(context.run([]).opening,null);
console.log('PASS: no mobile blackout; checkpoint history recognizes existing entries; app JS parses.');
