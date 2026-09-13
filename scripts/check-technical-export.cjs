'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const start=html.indexOf('        async function fetchCompleteTechnicalLog()');
const end=html.indexOf('        window.downloadTechnicalEvidence',start);
const events=Array.from({length:205},(_,i)=>({id:String(i),at:'2026-09-01T10:00:00.000Z'}));
let calls=0,failAt=0;
const sandbox={window:{},configElezioni:{annoScolastico:'2026/2027'},SECURE_API:{getTechnicalLogs:async request=>{
 calls++;if(calls===failAt) throw new Error('Service unavailable');
 const offset=request.cursor?Number(request.cursor):0;
 if(offset) assert.equal(request.snapshotUntil,'2026-09-02T10:00:00.000Z');
 return {data:{ok:true,snapshotUntil:'2026-09-02T10:00:00.000Z',logs:events.slice(offset,offset+100),nextCursor:offset+100<events.length?String(offset+100):null}};
}}};
vm.createContext(sandbox);vm.runInContext(html.slice(start,end),sandbox);
(async()=>{
 const result=await sandbox.fetchCompleteTechnicalLog();
 assert.equal(result.logs.length,205);assert.equal(new Set(result.logs.map(x=>x.id)).size,205);assert.equal(calls,3);
 calls=0;failAt=2;await assert.rejects(sandbox.fetchCompleteTechnicalLog(),/Service unavailable/);
 const formStart=html.indexOf('        const TECHNICAL_TEST_LABELS');
 const formEnd=html.indexOf('        window.saveTechnicalTestReport',formStart);
 sandbox.technicalEscape=value=>String(value);
 vm.runInContext(html.slice(formStart,formEnd),sandbox);
 const form=sandbox.renderTechnicalEvidenceForm();
 assert.equal((form.match(/<fieldset/g)||[]).length,12);
 assert.equal((form.match(/<option value="NOT_TESTED">/g)||[]).length,12);
 assert.ok(form.includes('name="testEnvironment" type="checkbox" required'));
 assert.ok(form.includes('name="softwareVersion" required'));
 console.log('PASS: 205 records across pages; no duplicates; cutoff preserved; interrupted export rejected; 12 unconfirmed test fields.');
})().catch(e=>{console.error(e);process.exitCode=1});
