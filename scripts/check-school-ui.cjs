'use strict';
// DOM integration with jsdom (no browser, network, real account or election data).
// Run with LEVI_JSDOM pointing to the installed jsdom module.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {JSDOM}=require(process.env.LEVI_JSDOM||'jsdom');
const html=fs.readFileSync('index.html','utf8');
const dom=new JSDOM(html,{url:'https://example.test/',runScripts:'outside-only'}),w=dom.window,d=w.document;
const tick=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
 let network=0;w.fetch=()=>{network++;throw Error('No network allowed');};
 w.eval(fs.readFileSync('lib/privacy-notice.js','utf8'));await tick();
 const notice=d.getElementById('privacy-notice'),open=d.getElementById('privacy-notice-open');assert.ok(notice&&!notice.hidden);
 notice.querySelector('[data-privacy-close]').click();assert.equal(notice.hidden,true);assert.equal(d.activeElement,open);
 open.click();assert.equal(notice.hidden,false);assert.equal(d.activeElement,notice.querySelector('h2'));
 assert.equal(notice.querySelector('a').target,'_blank');assert.match(notice.querySelector('a').rel,/noopener/);
 assert.equal(w.localStorage.length,0);assert.equal(w.sessionStorage.length,0);assert.equal(d.cookie,'');assert.equal(network,0);
 w.eval(fs.readFileSync('lib/privacy-notice.js','utf8'));assert.equal(d.querySelectorAll('#privacy-notice').length,1);
 const container=d.createElement('div');d.body.appendChild(container);
 w.LeviElectionPolicy=require('../lib/election-policy');w.LeviSandboxUI={settings:()=>({ignoreSchedule:true})};w.lucide={createIcons(){}};
 w.showNotification=(...args)=>{throw Error(args.join(':'));};w.showPage=()=>{};
 const list={A:{nome:'LISTA DI PROVA',candidati:['UNO','DUE']}};
 w.configElezioni={modalitaProva:true,consiglioAttivo:true,rappresentantiIstitutoAttivo:true,consultaAttiva:true,divietoVotoDisgiunto:true,listeConsiglio:{GENITORE:list,ATA:list},listeIstituto:list,listeConsulta:list,maxPrefConsiglio:2,maxPrefIstituto:2,maxPrefConsulta:2};
 w.eval(html.slice(html.indexOf('        function getCandidatesForComponent('),html.indexOf('        function parseElectionDate(')));
 w.eval(html.slice(html.indexOf('        function votingWindowStatus('),html.indexOf('        function consultationKey(')));
 w.eval(html.slice(html.indexOf('        function getCardHeaderHTML('),html.indexOf('        window.submitFinalVotes')));
 for(const [title,key,prefix] of [['Consiglio','consiglio','cons'],['Istituto','istituto','ist'],['Consulta','consulta','consul']]){
  w.currentUserData={tipo:key==='consiglio'?'GENITORE':'STUDENTE'};w.cartVotes={};
  w['renderVoto'+title](container);assert.equal(container.querySelectorAll('input[value="__BIANCA__"]').length,1);
  w['update'+title+'PreferenzeOptions']('A');
  const pref=container.querySelector('#'+prefix+'-p1');assert.ok(pref);pref.value='UNO';
  container.querySelector('input[value="__BIANCA__"]').checked=true;w.selectBlankBallot(key);assert.equal(container.querySelector('#'+prefix+'-p1'),null);
  w['saveVoto'+title]();assert.equal(JSON.stringify(w.cartVotes[key]),'{"isBianca":true}');
  w.renderRiepilogo(container);assert.match(container.textContent,/Scheda bianca/);assert.ok(!container.textContent.includes('undefined'));
  w['renderVoto'+title](container);assert.equal(container.querySelector('input[value="__BIANCA__"]').checked,true);
 }
 w.currentUserData={tipo:'GENITORE',electionKey:'classeGenitore'};assert.equal(w.votingWindowStatus('consiglio').open,false);assert.equal(w.votingWindowStatus('classeGenitore').open,true);
 console.log('PASS: actual DOM banner close/reopen/focus, no cookies/storage/network; all three blank ballot forms clear preferences, retain the selection and show the correct summary; scoped rights hide unrelated ballots.');
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 const definition=require('../lib/dpo-dossier');
 const review={role:'COMMISSIONE',release:{commit:'a'.repeat(40)},configurationAvailable:false,review:{stage:'PREPARATION'},assessment:{admittedToSecretVoting:false},privacy:{limitation:'SYNTHETIC TEST'},batches:[]};
 w.eval(fs.readFileSync('lib/privacy-review-ui.js','utf8'));
 w.LeviPrivacyReview.configure({config:()=>({annoScolastico:'2026/2027'}),api:{getVotingReview:async()=>({data:review}),getDpoReviewProfile:async()=>({data:{fields:{}}}),getDpoDossierMaterials:async()=>({data:definition})}});
 await w.LeviPrivacyReview.show();const form=d.querySelector('[data-batch]');assert.ok(form);
 assert.equal(form.elements.electionKey.disabled,true);form.elements.tipo.value='GENITORE';form.elements.tipo.dispatchEvent(new w.Event('change'));
 assert.equal(form.elements.electionKey.disabled,false);assert.equal(form.elements.eligibleCount.required,true);assert.equal(form.elements.classe.required,true);
 form.elements.electionKey.value='consiglio';form.elements.electionKey.dispatchEvent(new w.Event('change'));assert.equal(form.elements.classe.disabled,true);
 assert.ok(!new w.FormData(form).has('classe'));assert.equal(new w.FormData(form).get('electionKey'),'consiglio');
 assert.match(d.querySelector('#privacy-review-dialog').textContent,/PDF preliminare è disponibile/);assert.ok(d.querySelector('[data-pdf]'));
 assert.equal(network,0);console.log('PASS: actual private DPO dialog opens without saved election configuration; parent batch form requires the verified distinct-person quota and excludes the class for Council credentials. No real API was contacted.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>w.close());
