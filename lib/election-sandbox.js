(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./election-policy'));else root.LeviElectionSandbox=factory(root.LeviElectionPolicy);})(typeof globalThis!=='undefined'?globalThis:this,function(policy){
'use strict';
const flags={consiglio:'voted_consiglio',istituto:'voted_istituto',consulta:'voted_consulta',classeStudente:'voted_classe_studente',classeGenitore:'voted_classe_genitore'};
const kinds=['STUDENTE','GENITORE_CLASSE','GENITORE_CONSIGLIO','DOCENTE','ATA'];
function decode(value){
 const token=String(value||'').trim().toUpperCase();let match;
 if((match=/^PROVA-STUDENTE-([1-5][A-Z][A-Z0-9]{0,3})(?:-([0-9]{4}))?$/.exec(token)))return {token,tipo:'STUDENTE',classe:match[1]};
 if((match=/^PROVA-GENITORE-(?:CLASSE-)?([1-5][A-Z][A-Z0-9]{0,3})(?:-([0-9]{4}))?$/.exec(token)))return {token,tipo:'GENITORE',classe:match[1],electionKey:'classeGenitore'};
 if(/^PROVA-GENITORE-CONSIGLIO-[0-9]{4}$/.test(token))return {token,tipo:'GENITORE',classe:'',electionKey:'consiglio'};
 if((match=/^PROVA-(DOCENTE|ATA)-[0-9]{4}$/.exec(token)))return {token,tipo:match[1],classe:'',electionKey:'consiglio'};
 return null;
}
function eligible(config,user){return policy.enabled(config).filter(key=>(!user.electionKey||user.electionKey===key)&&(key==='consiglio'?user.tipo!=='STUDENTE':key==='classeGenitore'?user.tipo==='GENITORE':user.tipo==='STUDENTE'));}
function create(){
 const records=new Map(),sessions=new Map(),counters=new Map();let sequence=0;
 function createBatch(kind,classe,count){
  count=Number(count);classe=String(classe||'').trim().toUpperCase();
  if(!kinds.includes(kind)||!Number.isInteger(count)||count<1||count>1500)throw Error('Scegli la componente e da 1 a 1500 utenti fittizi.');
  if(['STUDENTE','GENITORE_CLASSE'].includes(kind)&&!/^([1-5][A-Z][A-Z0-9]{0,3})$/.test(classe))throw Error('Indicare una classe valida, per esempio 1A.');
  const prefix='PROVA-'+(kind==='GENITORE_CLASSE'?'GENITORE-CLASSE-'+classe:kind==='GENITORE_CONSIGLIO'?'GENITORE-CONSIGLIO':kind==='STUDENTE'?'STUDENTE-'+classe:kind);
  const start=counters.get(prefix)||0;if(start+count>9999)throw Error('Azzera gli utenti fittizi prima di crearne altri.');
  counters.set(prefix,start+count);
  return Array.from({length:count},(_,i)=>decode(prefix+'-'+String(start+i+1).padStart(4,'0')));
 }
 function begin(token,config,options={}){
  if(config.modalitaProva!==true)throw Error('Le credenziali fittizie sono disabilitate nella modalità reale.');
  const user=decode(token);if(!user)throw Error('Codice di prova non valido. Usa un utente generato nel Collaudo.');
  if(records.size>=10000&&!records.has(user.token))throw Error('Limite della sessione di collaudo raggiunto. Azzera le prove.');
  const state=records.get(user.token)||{};records.set(user.token,state);
  const now=options.now??Date.now(),keys=eligible(config,user);
  if(!keys.some(key=>!state[flags[key]]&&(options.ignoreSchedule===true||policy.phase(config,key,now)==='OPEN')))throw Error('Nessuna scheda residua aperta per questo utente di prova alla data selezionata.');
  const sessionId='PROVA-SESSIONE-'+(++sequence);
  sessions.set(sessionId,{user,expiresAt:Date.now()+15*60*1000});
  return {...user,...state,sessionId,isTest:true,indirizzo:'COLLAUDO',nome:'Utente fittizio'};
 }
 function submit(sessionId,config,ballots,options={}){
  if(config.modalitaProva!==true)throw Error('Invio di prova disabilitato.');
  const session=sessions.get(sessionId);if(!session||session.expiresAt<Date.now())throw Error('Sessione fittizia scaduta o già utilizzata.');
  const keys=Object.keys(ballots||{}).filter(key=>ballots[key]);if(!keys.length)throw Error('Seleziona almeno una scheda, anche bianca.');
  const user=session.user,state=records.get(user.token),allowed=eligible(config,user);
  for(const key of keys){
   if(!allowed.includes(key)||state[flags[key]])throw Error('Scheda non spettante o già depositata nella simulazione.');
   if(options.ignoreSchedule!==true&&policy.phase(config,key,options.now??Date.now())!=='OPEN')throw Error('Consultazione chiusa alla data di prova selezionata.');
   const ballot=ballots[key],choices=Object.entries(ballot).filter(([name,value])=>/^(p|candidate)[0-9]+$/.test(name)&&String(value||'').trim());
   if(ballot.isBianca===true&&(choices.length||ballot.lista))throw Error('Scheda bianca contraddittoria.');
   if(choices.length>policy.preferenceLimit(config,key,user.tipo))throw Error('Troppe preferenze nella scheda di prova.');
  }
  for(const key of keys)state[flags[key]]=true;
  sessions.delete(sessionId);
  return {fullyCompleted:allowed.every(key=>state[flags[key]]),recordedBallots:keys.length,testMode:true};
 }
 function reset(){records.clear();sessions.clear();counters.clear();}
 return {createBatch,begin,submit,reset};
}
return {create,decode,eligible,kinds,flags};
});
