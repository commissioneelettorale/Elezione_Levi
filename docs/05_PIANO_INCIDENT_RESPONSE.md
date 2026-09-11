# 05 — Piano di gestione incidenti

## Obiettivo

Gestire anomalie tecniche o violazioni di sicurezza senza compromettere validità, segretezza e integrità della consultazione.

## Livelli

**SEV-1 critico:** possibile correlazione identità-voto, compromissione credenziali amministrative, modifica/cancellazione urne, esfiltrazione dati personali, indisponibilità durante fase decisiva.

**SEV-2 alto:** accessi anomali, malfunzionamento diffuso, risultati incoerenti, perdita parziale di servizio.

**SEV-3 medio/basso:** errore isolato senza impatto su integrità/segrettezza.

## Procedura immediata

1. non cancellare dati o log;
2. sospendere la votazione se l'incidente può incidere su regolarità o segretezza;
3. annotare ora di rilevazione, soggetto segnalante e sintomi senza registrare contenuto del voto;
4. informare Dirigente, Presidente Commissione, referente tecnico e DPO secondo pertinenza;
5. revocare/ruotare credenziali compromesse;
6. preservare evidenze (commit, log amministrativi, log provider, configurazioni);
7. valutare se attivare procedura data breach artt. 33-34 GDPR;
8. decidere ripresa, proroga, annullamento o ripetizione con atto verbalizzato;
9. eseguire post-incident review e misure correttive.

## Divieti

- non usare i pulsanti/browser per cancellare l'urna allo scopo di “riparare” una votazione;
- non modificare manualmente singole schede;
- non esportare log contenenti credenziali in canali non autorizzati;
- non pubblicare dettagli tecnici sfruttabili prima della mitigazione.

## Evidenze da conservare

- identificativo commit/versione;
- snapshot configurazione;
- log amministrativi e provider pertinenti;
- cronologia decisioni della Commissione;
- esito dei test successivi alla mitigazione;
- verbale di chiusura incidente.
