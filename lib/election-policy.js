(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.LeviElectionPolicy=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const ELECTIONS=Object.freeze({
 consiglio:{label:"Consiglio d’istituto — docenti, ATA e genitori",flag:'consiglioAttivo',collection:'voti_consiglio'},
 istituto:{label:"Consiglio d’istituto — studenti",flag:'rappresentantiIstitutoAttivo',collection:'voti_istituto'},
 consulta:{label:'Consulta provinciale degli studenti',flag:'consultaAttiva',collection:'voti_consulta'},
 classeStudente:{label:'Rappresentanti di classe — studenti',flag:'rappresentantiClasseStudentiAttivo',collection:'voti_classe_studenti'},
 classeGenitore:{label:'Rappresentanti di classe — genitori',flag:'rappresentantiClasseGenitoriAttivo',collection:'voti_classe_genitori'}
});
function localDate(iso,time){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(iso||'')||!/^\d{2}:\d{2}$/.test(time||''))return null;
 const [y,m,d]=iso.split('-').map(Number),[h,n]=time.split(':').map(Number);
 const raw=Date.UTC(y,m-1,d,h,n),check=new Date(raw);
 if(h>23||n>59||check.getUTCFullYear()!==y||check.getUTCMonth()!==m-1||check.getUTCDate()!==d)return null;
 const fmt=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
 let guess=raw,parts;
 for(let i=0;i<3;i++){parts=Object.fromEntries(fmt.formatToParts(new Date(guess)).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));guess=raw-(Date.UTC(parts.year,parts.month-1,parts.day,parts.hour,parts.minute,parts.second)-guess);}
 parts=Object.fromEntries(fmt.formatToParts(new Date(guess)).map(p=>[p.type,Number(p.value)]));
 if(parts.year!==y||parts.month!==m||parts.day!==d||parts.hour!==h||parts.minute!==n)return null;
 return new Date(guess);
}
const isoDate=italian=>/^\d{2}\/\d{2}\/\d{4}$/.test(italian||'')?italian.split('/').reverse().join('-'):'';
function profile(config,key){return config.consultazioni?.[key]||{};}
function windows(config,key){
 const p=profile(config,key);
 if(p.dedicated===true)return(p.windows||[]).map(w=>({start:localDate(w.date,w.from),end:localDate(w.endDate||w.date,w.to)})).filter(w=>w.start&&w.end&&w.end>w.start).sort((a,b)=>a.start-b.start);
 const c=config.calendario||{},start=localDate(isoDate(c.votingStartDate),c.votingStartTime),end=localDate(isoDate(c.votingEndDate),c.votingEndTime);
 return start&&end&&end>start?[{start,end}]:[];
}
function phase(config,key,now=Date.now()){
 const ranges=windows(config,key);if(!ranges.length)return'UNCONFIGURED';
 if(now<+ranges[0].start)return'BEFORE';
 if(ranges.some(w=>now>=+w.start&&now<+w.end))return'OPEN';
 if(ranges.some(w=>now<+w.start))return'PAUSED';
 const p=profile(config,key),c=config.calendario||{};
 const release=p.dedicated===true?localDate(p.releaseDate,p.releaseTime):localDate(isoDate(c.resultsReleaseDate),c.resultsReleaseTime);
 const final=p.dedicated===true?p.finalized===true:config.commissionFinalized===true;
 return final&&release&&now>=+release?'RELEASED':'CLOSED';
}
const enabled=(config)=>Object.keys(ELECTIONS).filter(k=>config[ELECTIONS[k].flag]===true);
function globalPhase(config,now=Date.now()){
 const phases=enabled(config).map(k=>phase(config,k,now));
 if(!phases.length)return'UNCONFIGURED';if(phases.includes('OPEN'))return'OPEN';
 if(phases.every(p=>p==='BEFORE'||p==='UNCONFIGURED'))return phases.includes('BEFORE')?'BEFORE':'UNCONFIGURED';
 if(phases.some(p=>['BEFORE','PAUSED','UNCONFIGURED'].includes(p)))return'PAUSED';
 return phases.every(p=>p==='RELEASED')?'RELEASED':'CLOSED';
}
const keyForCollection=name=>Object.keys(ELECTIONS).find(k=>ELECTIONS[k].collection===name);
function validateProfile(p){
 if(p.dedicated!==true)return;
 if(!['OTTOBRE','NOVEMBRE','ALTRO'].includes(p.period)||!['DA_VERIFICARE','RINNOVO','SUPPLETIVE'].includes(p.kind))throw new Error('Selezionare periodo e tipo di procedura.');
 if(!Array.isArray(p.windows)||!p.windows.length||p.windows.length>6)throw new Error('Inserire da una a sei fasce orarie.');
 const ranges=p.windows.map(w=>({start:localDate(w.date,w.from),end:localDate(w.endDate||w.date,w.to)}));
 if(ranges.some(w=>!w.start||!w.end||w.end<=w.start))throw new Error('Data o fascia oraria non valida: la chiusura deve seguire l’apertura.');
 ranges.sort((a,b)=>a.start-b.start);if(ranges.some((w,i)=>i&&w.start<ranges[i-1].end))throw new Error('Le fasce orarie non possono sovrapporsi.');
 if((p.releaseDate||p.releaseTime)&&!localDate(p.releaseDate,p.releaseTime))throw new Error('Data di pubblicazione non valida.');
 const release=localDate(p.releaseDate,p.releaseTime);if(release&&release<ranges[ranges.length-1].end)throw new Error('Gli esiti possono essere pubblicati solo dopo l’ultima chiusura.');
 if(!Array.isArray(p.acts)||!p.acts.length||p.acts.length>6)throw new Error('Inserire almeno un atto pertinente alla consultazione.');
 for(const act of p.acts){if(!String(act.authority||'').trim()||!String(act.protocol||'').trim()||!localDate(act.date,'12:00')||!String(act.subject||'').trim())throw new Error('Completare ente, protocollo, data valida e oggetto di ciascun atto.');if(act.url){try{if(new URL(act.url).protocol!=='https:')throw new Error();}catch(_){throw new Error('I riferimenti online devono essere indirizzi HTTPS validi.');}}}
}
return{ELECTIONS,profile,windows,phase,globalPhase,enabled,keyForCollection,localDate,isoDate,validateProfile};
});
