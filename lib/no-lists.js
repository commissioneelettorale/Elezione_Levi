(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.LeviNoLists=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const TYPES=Object.freeze({
 istituto:{label:"Consiglio d'Istituto — componente studenti",electionKey:'istituto',collection:'voti_istituto'},
 consulta:{label:"Consulta Provinciale degli Studenti",electionKey:'consulta',collection:'voti_consulta'},
 consiglio_GENITORE:{label:"Consiglio d'Istituto — componente genitori",electionKey:'consiglio',collection:'voti_consiglio'},
 consiglio_DOCENTE:{label:"Consiglio d'Istituto — componente docenti",electionKey:'consiglio',collection:'voti_consiglio'},
 consiglio_ATA:{label:"Consiglio d'Istituto — componente ATA",electionKey:'consiglio',collection:'voti_consiglio'}
});
const IDs=Object.freeze(Object.keys(TYPES));
function validKey(key){return Object.prototype.hasOwnProperty.call(TYPES,key);}
function confirmed(config,key){return validKey(key)&&config?.assenzaListe?.[key]?.confirmed===true;}
function keyForSection(section,component=''){
 if(section==='istituto'||section==='consulta')return section;
 if(section==='consiglio'){const key='consiglio_'+String(component).toUpperCase();return validKey(key)?key:null;}
 return null;
}
function configuredLists(config,key){
 if(key==='istituto')return config?.listeIstituto||{};
 if(key==='consulta')return config?.listeConsulta||{};
 if(key.startsWith('consiglio_'))return config?.listeConsiglio?.[key.slice(10)]||{};
 return {};
}
function publicNotice(key){return validKey(key)?"Per questa consultazione non risultano liste presentate entro i termini accertati dalla Commissione Elettorale; pertanto non vi sono liste ammesse né candidati proclamabili in questa procedura. La constatazione è documentata nel verbale della Commissione.":'';}
return Object.freeze({TYPES,IDs,validKey,confirmed,keyForSection,configuredLists,publicNotice});
});
