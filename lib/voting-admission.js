'use strict';
const legal=require('./legal-readiness');
function blockers(config,state,binding){
  if(config?.bypassLegalBlockers===true)return [];
  const missing=legal.structuralBlockers(config);
  if(config?.modalitaProva===true)missing.push('testModeActive');
  const review=state?.votingReview;
  if(review?.stage!=='PREPARATION')missing.push('privacyReviewPending');
  return missing;
}
function anonymousRecord(record){
  const keys=new Set(['schema','tipo','classe','electionKey','hasVoted','voted_consiglio','voted_istituto','voted_consulta','voted_classe_studente','voted_classe_genitore','activeSessionHash','sessionHash','isAnonymous','anonymousToken','anonymousSeed','edizione','consiglio','istituto','consulta','classe_studente','classe_genitore']);
  const validScope=record?.tipo!=='GENITORE'||(record.electionKey==='consiglio'&&!record.classe)||(record.electionKey==='classeGenitore'&&!!record.classe);
  return record?.schema===legal.ANONYMOUS_MODE&&validScope&&Object.keys(record).every(k=>keys.has(k));
}
module.exports={blockers,anonymousRecord};
