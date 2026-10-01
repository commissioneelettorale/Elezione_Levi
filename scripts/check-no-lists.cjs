'use strict';
// No production calls or private data: exercise the real saved-config handler
// with synthetic Firestore transactions and the actual election policy.
const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const NoLists=require('../lib/no-lists'),ElectionPolicy=require('../lib/election-policy');
const core=fs.readFileSync('functions/core.js','utf8');
const year='2026/2027';
const base={annoScolastico:year,consiglioAttivo:true,rappresentantiIstitutoAttivo:true,
 consultaAttiva:true,listeIstituto:{},listeConsulta:{},
 listeConsiglio:{GENITORE:{},DOCENTE:{},ATA:{}},consultazioni:{},calendario:{}};
const clone=value=>JSON.parse(JSON.stringify(value));
let stored=clone(base),state={},occupied=false;const actions=[];
const ref=(name)=>({name});
const tx={
 async get(r){
  assert.ok(['yearly','regularity','voti_istituto','voti_consulta','voti_consiglio'].includes(r.name));
  if(r.name==='yearly')return{exists:true,data:()=>clone(stored)};
  if(r.name==='regularity')return{exists:true,data:()=>clone(state)};
  return{empty:!occupied};
 },
 set(r,value){actions.push({type:'set',ref:r.name,value})}
};
const ctx={
 exports:{},NoLists,ElectionPolicy,LegalReadiness:{ANONYMOUS_MODE:'PRESENTIAL_UNLINKED_V1'},
 TokenCodes:{migrationPending:()=>false},
 assertSafeConfigValue:()=>{},
 HttpsError:class extends Error{constructor(code,message){super(message);this.code=code;}},
 requireAuth:async()=>({uid:'FAKE-STAFF',role:'COMMISSIONE'}),
 yearlyConfigRef:()=>ref('yearly'),regularityStateRef:()=>ref('regularity'),
 yearlyCollection:(name)=>({limit:()=>ref(name)}),globalConfigRef:()=>ref('global'),
 parseItalianDate:()=>null,
 db:{runTransaction:async fn=>{
  actions.length=0;const response=await fn(tx);
  for(const entry of actions)if(entry.type==='set'&&entry.ref==='yearly')stored=clone(entry.value);
  return response;
 }},
 auditAdmin:async(_,event,data)=>{actions.push({type:'audit',event,data})},
};
vm.createContext(ctx);
function handler(begin,end){
 const a=core.indexOf(begin),b=core.indexOf(end,a);
 assert.ok(a>=0&&b>a,'Actual backend handler not found: '+begin);
 vm.runInContext(core.slice(a,b),ctx);
}
handler('exports.saveElectionConfig = async (request) => {','// Rettifica puntuale');
handler('exports.getPublicNoListsStatus = async () => {','function timestampIso');
const save=config=>ctx.exports.saveElectionConfig({data:{config}});
(async()=>{
 assert.deepEqual(NoLists.IDs,['istituto','consulta','consiglio_GENITORE','consiglio_DOCENTE','consiglio_ATA']);
 assert.equal(NoLists.keyForSection('classe_st'),null,'Class voters are not subject to list nominations');
 assert.equal(NoLists.keyForSection('consiglio','GENITORE'),'consiglio_GENITORE');
 await save({...clone(base),assenzaListe:{consulta:{confirmed:true,declaredAt:'2026-10-01T10:00:00.000Z'}}});
 assert.equal(NoLists.confirmed(stored,'consulta'),true);
 assert.ok(actions.some(a=>a.type==='audit'&&a.event==='LIST_PRESENTATION_DECLARATION'&&a.data.election==='consulta'&&a.data.confirmed));
 console.log('PASS: commission no-list setting persisted for exactly one consultation and specifically audited.');
 await assert.rejects(save({...stored,listeConsulta:{LISTA_A:{nome:'Lista',candidati:['FITTIZIO']}}}),e=>e.code==='failed-precondition'&&/non può convivere/.test(e.message));
 assert.equal(Object.keys(stored.listeConsulta).length,0);
 await assert.rejects(save({...stored,assenzaListe:{...stored.assenzaListe,classe_studente:{confirmed:true}}}),e=>e.code==='invalid-argument');
 console.log('PASS: conflicting lists and inapplicable class election flags rejected.');
 occupied=true;
 await assert.rejects(save({...stored,assenzaListe:{...stored.assenzaListe,istituto:{confirmed:true}}}),e=>e.code==='failed-precondition'&&/Urna/.test(e.message));
 occupied=false;
 const past={dedicated:true,period:'OTTOBRE',kind:'RINNOVO',windows:[{date:'2020-10-13',from:'09:00',to:'11:00'}],
 acts:[{authority:'Istituto',protocol:'SYNTHETIC',date:'2020-10-01',subject:'Synthetic-only act',url:'https://example.org/test'}],
 finalized:false,releaseDate:'2020-10-14',releaseTime:'09:00'};
 stored.consultazioni.istituto=past;
 await assert.rejects(save({...stored,assenzaListe:{...stored.assenzaListe,istituto:{confirmed:true}}}),e=>e.code==='failed-precondition'&&/congelamento|avvio/.test(e.message));
 console.log('PASS: occupied ballot archives and declarations after voting starts rejected.');
 // Do not expose a recorded declaration until that consultation is actually released.
 let status=await ctx.exports.getPublicNoListsStatus();
 assert.equal(status.entries.length,0);
 stored.consultazioni.consulta={...past,finalized:true};
 status=await ctx.exports.getPublicNoListsStatus();
 assert.equal(status.entries.length,1);
 assert.equal(status.entries[0].key,'consulta');
 assert.doesNotMatch(JSON.stringify(status),/SYNTHETIC|staff|token|ballot/i);
 console.log('PASS: public notice is separated by election and visible only after per-election verification/release, with no elector metadata.');
 const html=fs.readFileSync('index.html','utf8'),main=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
 assert.ok(main);new vm.Script(main.replace(/^\s*import .*;\s*$/gm,''));
 assert.match(html,/<script src="lib\/no-lists\.js"><\/script>/);
 assert.match(main,/window\.setNoListsForElection=async function/);
 assert.match(main,/window\.generateNoListsMinutesDocx=async function/);
 assert.match(main,/case 'publicNoLists': renderPublicNoListsPage/);
 assert.match(main,/NoLists\.confirmed\(configElezioni,'consulta'\)/);
 console.log('PASS: actual full frontend parses and includes selection, safeguards, public notices and separate Word minutes.');
})().catch(e=>{console.error(e);process.exitCode=1});
