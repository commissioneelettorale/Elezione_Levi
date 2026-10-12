'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const {JSDOM}=require(process.env.LEVI_JSDOM||'jsdom');
const html=fs.readFileSync('index.html','utf8');
assert.match(html,/function renderManagementDocumentsSection\s*\(/);
assert.match(html,/window\.downloadDhondtMinutesDocx\s*=/);
assert.match(html,/getAnonymousBallots\(\{collection:descriptor\.col/);
assert.match(html,/CLOSED','RELEASED/);
assert.match(html,/docxTable\(\[\['Pos\.'/);
const dom=new JSDOM(html,{url:'https://example.test/',runScripts:'outside-only'});
for(const asset of [...dom.window.document.querySelectorAll('script[src]')]){
 const path=asset.getAttribute('src').split('?')[0];
 if(path.startsWith('http'))continue;
 assert.ok(fs.existsSync(path),'Missing local script asset: '+path);
}
dom.window.close();
const build=fs.readFileSync('scripts/build-public-site.cjs','utf8');
for(const asset of ['lib/management-aggregate.js','lib/accesso-atti.js'])assert.ok(build.includes("'"+asset+"'"),'Missing deployment asset '+asset);
console.log('PASS: management renderer exists; quotient Word export guarded; local scripts and deployment assets present.');
