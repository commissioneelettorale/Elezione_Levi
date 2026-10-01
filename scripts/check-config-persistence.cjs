'use strict';
// Isolated regression checks: no Firebase access, no credentials and no production writes.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const check=require('../lib/config-persistence');
const config={
 annoScolastico:'2026/2027',
 calendario:{votingStartDate:'13/10/2026',votingStartTime:'09:00',votingEndDate:'13/10/2026',votingEndTime:'12:00'},
 consultazioni:{
  classeStudente:{windows:[{date:'2026-10-13',from:'09:00',to:'12:00'}],acts:[{subject:'Atto di prova',protocol:'SIM'}]},
  istituto:{windows:[{date:'2026-11-13',from:'09:00',to:'12:00'}]}
 },
 listeIstituto:{LISTA_B:{nome:'B',candidati:['SECONDO','PRIMO']},LISTA_A:{nome:'A',candidati:['TERZO']}},
 commissione:[{nome:'SINTETICO',ruolo:'Presidente'}],
 workflowDigitale:{docentiApproved:false,checklist:{urne:true,calendario:false}}
};
const serverOrder=v=>Array.isArray(v)?v.map(serverOrder):v&&typeof v==='object'?
 Object.fromEntries(Object.keys(v).sort().map(k=>[k,serverOrder(v[k])])):v;
const readback=()=>({...serverOrder(config),votingStartsAtMs:1791874800000});
assert.notEqual(JSON.stringify(config.calendario),JSON.stringify(readback().calendario),
 'Fixture must reproduce a Firestore key-order difference');
assert.deepEqual(check.differences(config,readback()),[],
 'Identical values and nested maps with reordered keys must be accepted');
assert.deepEqual(check.differences(config,{...readback(),calendario:{...config.calendario,votingStartTime:'10:00'}}),['calendario']);
assert.deepEqual(check.differences(config,{...readback(),listeIstituto:{LISTA_B:{nome:'B',candidati:['PRIMO','SECONDO']},LISTA_A:{nome:'A',candidati:['TERZO']}}}),['listeIstituto'],
 'The ordering of candidate arrays must still be significant');
assert.deepEqual(check.differences(config,{...readback(),consultazioni:{...readback().consultazioni,istituto:{windows:[{date:'2026-11-14',from:'09:00',to:'12:00'}]}}}),['consultazioni']);
assert.deepEqual(check.differences(config,null),['configurazione']);
console.log('PASS: canonical Firestore maps, real mismatches, array ordering and derived server timestamp.');

const html=fs.readFileSync('index.html','utf8');
assert.match(html,/<script src="lib\/config-persistence\.js"><\/script>/);
const mainTag=html.match(/<script type="module">([\s\S]*?)<\/script>/);
assert.ok(mainTag,'Main application module missing');
const main=mainTag[1].replace(/^\s*import .*;\s*$/gm,'');
new vm.Script(main,{filename:'index.html module without external import declarations'});
const marker='        let configSaveQueue=Promise.resolve();';
const start=main.indexOf(marker),end=main.indexOf('        window.changeActiveSchoolYear=async function',start);
assert.ok(start>=0&&end>start,'Verified configuration queue missing');
const saveSource=main.slice(start,end);
assert.equal((main.match(/SECURE_API\.saveElectionConfig\(/g)||[]).length,1,
 'All application config writes must use the verified serialized queue');
assert.match(main,/window\.saveConsultationSettings=async form=>[\s\S]*?saveConfigToDB\(\{captureForms:false,notify:false\}\)/);
assert.match(main,/function persistWorkflowEdit\(applyChange\)/);
assert.match(main,/window\.saveElectionScheduleAndMessage = async function\(\)[\s\S]*?return saveConfigToDB\(\)/);
console.log('PASS: full page module parses and all configuration writing paths share one queue.');

(async()=>{
 const alerts=[],calls=[],state={stored:readback(),error:null,corrupt:false,block:null,connection:true};
 const ctx={
  window:{},configElezioni:JSON.parse(JSON.stringify(config)),
  collectConfigFormFields:()=>{},auth:{currentUser:{getIdTokenResult:async()=>({claims:{staffYear:'2026/2027'}})}},
  commissionSessionReady:true,db:{},appId:'iis-levi-electoral-v3',
  doc:(...parts)=>parts.join('/'),getDocFromServer:async()=>({
    exists:()=>state.stored!==null,
    data:()=>state.corrupt?{...state.stored,calendario:{...state.stored.calendario,votingStartTime:'00:00'}}:state.stored
  }),
  SECURE_API:{saveElectionConfig:async({config:sent})=>{
    calls.push(JSON.parse(JSON.stringify(sent)));
    if(state.error)throw Error(state.error);
    if(state.block)await state.block;
    state.stored={...serverOrder(sent),votingStartsAtMs:1791874800000};
    return{data:{ok:true}};
  }},
  LeviConfigPersistence:check,showNotification:(...args)=>alerts.push(args),firebaseStateConnected:true
 };
 vm.createContext(ctx);new vm.Script(saveSource).runInContext(ctx);
 assert.equal(await ctx.window.saveConfigToDB(),true);
 assert.equal(alerts.at(-1)[0],'Configurazione verificata');
 assert.equal(calls.length,1);
 state.corrupt=true;
 assert.equal(await ctx.window.saveConfigToDB(),false);
 assert.match(ctx.window.lastConfigSaveError,/calendario/);
 assert.equal(alerts.at(-1)[0],'Salvataggio non confermato');
 state.corrupt=false;state.error='Accesso di prova negato';
 assert.equal(await ctx.window.saveConfigToDB({notify:false}),false);
 assert.match(ctx.window.lastConfigSaveError,/Accesso di prova negato/);
 state.error=null;
 let release;state.block=new Promise(resolve=>release=resolve);
 const first=ctx.window.saveConfigToDB({notify:false});
 ctx.configElezioni={...ctx.configElezioni,commissionMessage:'Seconda modifica sintetica'};
 const second=ctx.window.saveConfigToDB({notify:false});
 for(let i=0;i<4;i++)await Promise.resolve();
 assert.equal(calls.length,4,'Second save must wait while the first write is pending');
 release();state.block=null;
 assert.deepEqual(await Promise.all([first,second]),[true,true]);
 assert.equal(state.stored.commissionMessage,'Seconda modifica sintetica');
 ctx.firebaseStateConnected=false;
 const n=calls.length;
 assert.equal(await ctx.window.saveConfigToDB({notify:false}),false);
 assert.equal(calls.length,n,'Cloud configuration must not be overwritten after failed initial read');
 assert.match(ctx.window.lastConfigSaveError,/non è stata caricata/);
 console.log('PASS: actual UI save queue accepts reordered cloud maps; rejects real drift and failed auth; serializes successive edits and protects existing data after failed load.');
})().catch(error=>{console.error(error);process.exitCode=1;});
