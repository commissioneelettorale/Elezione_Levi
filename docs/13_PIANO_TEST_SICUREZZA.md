# 13 — Piano test di sicurezza e abuso

## Test autorizzazione

1. utente non autenticato prova a leggere `voti_*`: deve ricevere `permission-denied`;
2. Referente prova a leggere un'urna diversa dalla propria componente: negato;
3. Segreteria prova a modificare token/config: negato;
4. Commissione prova a scrivere direttamente un voto: negato dalle Rules;
5. elettore tenta di chiamare API staff: negato.

## Test voto

1. token inesistente;
2. token valido ma finestra non aperta;
3. sessione scaduta;
4. seconda sessione contemporanea;
5. riuso della stessa sessione;
6. secondo voto sulla stessa scheda;
7. lista non esistente;
8. candidato fuori lista;
9. preferenza duplicata;
10. numero preferenze superiore al massimo;
11. candidato di classe non appartenente alla classe (quando il registro consente la verifica);
12. payload contenente campi `token`, `nome`, `timestamp`: devono essere eliminati/rifiutati e non comparire nell'urna.

## Test segretezza

Dopo voti di prova, interrogare amministrativamente i documenti Firestore e verificare che le urne non contengano:

`token`, `tokenHash`, `tokenDocId`, `sessionId`, `sessionHash`, `nome`, `email`, `uid`, `createdAt`, `timestamp`, `dataVoto`, `ip`, `userAgent`, `ballotId`, `vote_id_*`.

Verificare anche che nei token non esista un identificativo della scheda.

## Test risultati

- durante apertura: nessuna preferenza/lista parziale a Referenti/Dirigenza;
- a chiusura: Commissione può scrutinare contenuti anonimi;
- prima del rilascio ufficiale: ruoli non Commissione non ricevono dettaglio delle preferenze;
- dopo rilascio: viste aggregate coerenti.

## Test web

- tentativi XSS in campi importati/configurazione;
- valori estremamente lunghi;
- caratteri HTML nei nominativi;
- refresh/back/forward durante una sessione;
- doppio click sul pulsante di invio;
- perdita rete al commit e successivo riaccesso.

## Strumenti

È raccomandato un vulnerability assessment autorizzato dell'ambiente di staging. Non eseguire penetration test sull'ambiente di produzione durante una consultazione reale.
