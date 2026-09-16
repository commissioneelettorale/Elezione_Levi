'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require(process.env.LEVI_JSDOM||'jsdom');
const policy=require('../lib/election-policy'),sandboxModule=require('../lib/election-sandbox');
const now=+policy.localDate('2026-10-10','09:30'),p={dedicated:true,windows:[{date:'2026-10-10',from:'09:00',to:'10:00'}]};
const config={modalitaProva:true,consiglioAttivo:true,rappresentantiIstitutoAttivo:true,consultaAttiva:true,rappresentantiClasseStudentiAttivo:true,rappresentantiClasseGenitoriAttivo:true,consultazioni:Object.fromEntries(Object.keys(policy.ELECTIONS).map(key=>[key,p]))};
const sandbox=sandboxModule.create();
for(const kind of sandboxModule.kinds){
 const users=sandbox.createBatch(kind,'1A',3);assert.equal(new Set(users.map(u=>u.token)).size,3);
 const user=sandbox.begin(users[0].token,config,{now}),key=sandboxModule.eligible(config,user)[0];
 const outcome=sandbox.submit(user.sessionId,config,{[key]:{isBianca:true}},{now});assert.equal(outcome.recordedBallots,1);
 assert.throws(()=>sandbox.submit(user.sessionId,config,{[key]:{isBianca:true}},{now}));
 assert.throws(()=>sandbox.begin(users[1].token,{...config,modalitaProva:false},{now}));
 assert.throws(()=>sandbox.begin(users[1].token,config,{now:+policy.localDate('2026-10-10','10:00')}));
 const second=sandbox.begin(users[1].token,config,{now});assert.throws(()=>sandbox.submit(second.sessionId,config,{}, {now}));
}
assert.throws(()=>sandbox.createBatch('DOCENTE','',1501));assert.throws(()=>sandbox.createBatch('STUDENTE','<script>',1));
assert.equal(policy.phase({...config,consultazioni:{}},'consiglio',now),'UNCONFIGURED');
const separated=structuredClone(config);separated.consultazioni.consulta={dedicated:true,windows:[{date:'2026-10-10',from:'10:00',to:'11:00'}]};
assert.equal(policy.phase(separated,'consiglio',now),'OPEN');assert.equal(policy.phase(separated,'consulta',now),'BEFORE');
const cached=policy.localDate('2026-10-10','09:30');cached.setFullYear(2000);assert.equal(+policy.localDate('2026-10-10','09:30'),now);
const dom=new JSDOM('<div id="lab"></div>',{url:'https://example.test/',runScripts:'outside-only'}),w=dom.window,d=w.document;
(async()=>{
 let network=0,started;
 w.fetch=()=>{network++;throw Error('No network allowed');};w.LeviElectionPolicy=policy;w.LeviElectionSandbox=sandboxModule;
 w.eval(fs.readFileSync('lib/election-sandbox-ui.js','utf8'));
 w.LeviSandboxUI.mount(d.getElementById('lab'),{sandbox,start:token=>{started={token,options:w.LeviSandboxUI.settings()};}});
 const form=d.querySelector('[data-batch]');form.elements.kind.value='DOCENTE';form.elements.kind.dispatchEvent(new w.Event('change'));assert.equal(form.elements.classe.disabled,true);
 form.elements.count.value='1500';form.dispatchEvent(new w.Event('submit',{cancelable:true}));assert.match(d.querySelector('[data-users]').textContent,/1500 utenti/);assert.equal(d.querySelectorAll('[data-user]').length,20);
 d.querySelector('[data-user]').click();d.querySelector('[data-clock]').value='2026-10-10T09:30';d.querySelector('[data-start]').click();assert.match(started.token,/^PROVA-DOCENTE-/);assert.equal(started.options.now,now);assert.equal(started.options.ignoreSchedule,false);
 const result=await w.LeviSandboxUI.check();assert.equal(result.users,1500);assert.ok(result.tests.every(t=>t.ok));assert.equal(result.cloudCapacityVerified,false);
 assert.equal(network,0);assert.equal(w.localStorage.length,0);assert.equal(w.sessionStorage.length,0);assert.equal(d.cookie,'');
 for(const path of ['fascicolo-dpo.html','scripts/build-dpo-page.cjs'])assert.ok(!fs.readFileSync(path,'utf8').includes('document=dpo'));
 const publicDpo=new JSDOM(fs.readFileSync('fascicolo-dpo.html','utf8'));assert.ok(![...publicDpo.window.document.querySelectorAll('a,button')].some(node=>/scarica.*pdf/i.test(node.textContent)));publicDpo.window.close();
 console.log('PASS: all synthetic voter components, separate windows, closed/missing schedule rejection, duplicate and empty submission rejection; 1500-user DOM generator, local scenario checks, zero network/storage, public DPO download absent.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>w.close());
