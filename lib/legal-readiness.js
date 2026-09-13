(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.LeviLegalReadiness=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const VERSION='LEVI_ALLEGATO_A_2026_V2';
  const SOURCE_SHA256='30b1aadb76827d584a379826da9d5d8d854941732b03f17a76bcf713c19b2102';
  const CONTROLS=Object.freeze({
    digitalElectionAuthorized:'Base giuridica del voto digitale verificata per ogni consultazione (A 7.1 / 8.1)',
    schoolAdoptionRecorded:'Allegato A e atto organizzativo adottati: protocollo, versione e autorità competente (A 8.20)',
    dpoContactVerified:'Vargiu Scuola: riferimento alla designazione e informativa aggiornata (A 1.2)',
    processorsReviewed:'Fornitori, atti art. 28, sub-responsabili, localizzazione e trasferimenti verificati (A 1.6–1.7)',
    retentionPolicyRecorded:'Tempi distinti per atti, token, log e backup; conservazione, scarto e legal hold (A 1.8)',
    independentSecurityReviewed:'Verifica indipendente, dipendenze, log e rischi residui documentati (A 8.6–8.7)',
    accessibilityReviewed:'Prove manuali di accessibilità e postazione assistita con luogo e orari (A 4 / 8.14)',
    responsibilityMatrixRecorded:'Responsabili, autorizzanti e doppio controllo per le attività critiche (A 8.27)',
    evidenceCustodyReady:'Fascicolo, impronte, custodia chiavi, RTO/RPO e prova di ripristino documentati (A 8.10–8.12)'
  });
  const ANONYMOUS_MODE='PRESENTIAL_UNLINKED_V1';
  // The old named credential archive cannot be cleared by an administrative override.
  // The in-person mode has a different credential store and needs an independent review.
  function structuralBlockers(config){return config?.privacyMode===ANONYMOUS_MODE?[]:['structuralSecrecy'];}
  const BLOCKER_LABELS=Object.freeze({
    structuralSecrecy:'Le credenziali nominative non sono ammesse al voto reale in questa versione. Configurare la distribuzione casuale di codici non nominativi in presenza e verificarne il processo.',
    privacyReviewPending:'Verifica privacy/tecnica e autorizzazione non completate per questa versione e configurazione.',
    votingReviewStale:'Versione o configurazione variata: ripetere verifica e autorizzazione.',
    testModeActive:'Disattivare la modalità prova prima del collaudo finale.'
  });
  return Object.freeze({VERSION,SOURCE_SHA256,CONTROLS,BLOCKER_LABELS,ANONYMOUS_MODE,structuralBlockers});
});
