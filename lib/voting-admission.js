'use strict';
const legal=require('./legal-readiness');
function blockers(config,state,binding){
  const missing=legal.structuralBlockers(config);
  if(config?.modalitaProva===true)missing.push('testModeActive');
  const review=state?.votingReview;
  if(review?.stage!=='AUTHORIZED')missing.push('privacyReviewPending');
  else if(!binding?.commit||review.commit!==binding.commit||review.configurationSha256!==binding.configurationSha256||review.credentialRevision!==binding.credentialRevision)missing.push('votingReviewStale');
  return missing;
}
function anonymousRecord(record){
  const keys=new Set(['schema','tipo','classe','electionKey','hasVoted','voted_consiglio','voted_istituto','voted_consulta','voted_classe_studente','voted_classe_genitore','activeSessionHash','sessionExpiresAt','completedSessionHash','lastReceipt']);
  const validScope=record?.tipo!=='GENITORE'||(record.electionKey==='consiglio'&&!record.classe)||(record.electionKey==='classeGenitore'&&!!record.classe);
  return record?.schema===legal.ANONYMOUS_MODE&&validScope&&Object.keys(record).every(k=>keys.has(k));
}
module.exports={blockers,anonymousRecord};
