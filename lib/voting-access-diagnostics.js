'use strict';
const ANONYMOUS_MODE='PRESENTIAL_UNLINKED_V1';
const num=v=>Math.max(0,Number.isSafeInteger(Number(v))?Number(v):0);
function summarize(data={}){
  const registered=num(data.registered), anonymousIssued=num(data.anonymousIssued);
  const anon=data.privacyMode===ANONYMOUS_MODE;
  const suspended=data.suspended===true,closed=data.closed===true;
  const blockers=Array.isArray(data.blockerCodes)?data.blockerCodes:[];
  const messages=[];
  if(suspended)messages.push('Votazioni sospese dal provvedimento di emergenza: registrare la risoluzione e completare la procedura autorizzata di ripresa.');
  if(closed)messages.push('Procedimento elettorale chiuso: nessuna nuova votazione ammessa.');
  if(data.migrationPending)messages.push('Migrazione dei codici ancora in corso.');
  if(anon&&anonymousIssued===0)messages.push('Nessuna credenziale anonima emessa. I token nominativi del registro non funzionano nell’urna anonima; occorre la procedura autorizzata di distribuzione casuale in presenza.');
  else if(anon&&registered>anonymousIssued)messages.push('Il numero di credenziali anonime è inferiore alle righe del registro. Confrontare i diritti per consultazione e la consegna effettiva; questi totali non dimostrano un’anomalia o una corrispondenza nominativa.');
  if(!anon)messages.push('Modalità con credenziali nominative: non ammessa alle urne reali dalla policy attuale. Non cambiare modalità per aggirare la segretezza.');
  if(registered===0)messages.push('Il registro annuale risulta vuoto: verificare anno e progetto Firestore.');
  if(data.reviewStage!=='AUTHORIZED')messages.push('Revisione privacy e tecnica non autorizzata per questa configurazione (stato: '+String(data.reviewStage||'PREPARATION')+').');
  if(blockers.includes('votingReviewStale'))messages.push('Versione distribuita o configurazione cambiata rispetto all’autorizzazione: occorre nuova verifica.');
  if(data.locked)messages.push('Calendario fissato dalla Commissione: rettifiche soltanto con procedura amministrativa tracciata.');
  if(blockers.length)messages.push('Ulteriori requisiti non soddisfatti: '+blockers.join(', ')+'.');
  return {
    year:String(data.year||''), privacyMode:String(data.privacyMode||''), registered, anonymousIssued,
    suspended, closed,locked:data.locked===true, reviewStage:String(data.reviewStage||'PREPARATION'),
    readyForVoting:!suspended&&!closed&&!data.migrationPending&&blockers.length===0,
    phase:String(data.phase||'UNCONFIGURED'), consultazioni:Array.isArray(data.consultazioni)?data.consultazioni:[],
    messages
  };
}
module.exports={summarize};
