# 12 — Procedura dettagliata di messa in esercizio

## Fase 1 — Governance

1. Acquisire Nota MIM 3803/2026 e Allegato tecnico.
2. Individuare la disciplina elettorale specifica applicabile.
3. Aggiornare/approvare il regolamento d'Istituto.
4. Individuare Commissione, Presidente, Segretario, responsabile tecnico e ruoli privacy.
5. Completare DPIA e verifica fornitori/cloud.

## Fase 2 — Firebase

1. Aprire il progetto Firebase `mio-sistema-voto` o sostituire coerentemente il project ID in `.firebaserc` e `index.html`.
2. Abilitare Firestore e Cloud Functions.
3. Configurare regione `europe-west1` come da codice oppure approvare una regione diversa e aggiornare entrambi i lati.
4. Distribuire Functions e Rules dello stesso commit.
5. Verificare che nessuna regola precedente più permissiva rimanga attiva.
6. Abilitare log/audit provider necessari e definire retention.

## Fase 3 — Primo account Commissione

Il primo account non viene creato dal browser per evitare una “backdoor” di bootstrap.

Con credenziali amministrative Firebase/GCP autorizzate:

```powershell
cd functions
npm install
$env:PROVISION_PASSWORD="PASSWORD_PERSONALE_LUNGA"
node scripts/provision-account.js --year 2026/2027 --role COMMISSIONE --username commissione.presidente --name "Presidente Commissione"
Remove-Item Env:PROVISION_PASSWORD
```

Creare un account personale per ogni operatore che necessita accesso; evitare account condivisi.

## Fase 4 — Dati legacy

Se il progetto Firestore contiene dati della vecchia versione:

```bash
node functions/scripts/migrate-legacy-data.js --year 2026/2027
```

Il comando precedente è solo DRY-RUN. Dopo backup e autorizzazione verbalizzata:

```bash
node functions/scripts/migrate-legacy-data.js --year 2026/2027 --apply
```

## Fase 5 — Configurazione elezioni

1. Accedere come Commissione.
2. Impostare anno, tipologia, calendario, liste e candidati.
3. Importare/creare aventi diritto.
4. Verificare classi/componenti.
5. Generare/consegnare credenziali con procedura controllata.
6. Non modificare configurazione/lista aventi diritto dopo l'apertura salvo procedura eccezionale verbalizzata.

## Fase 6 — Preflight e collaudo

```bash
node functions/scripts/preflight-check.js --year 2026/2027
```

Eseguire inoltre tutti i test del doc 07 e doc 13. Annotare il commit SHA.

## Fase 7 — Apertura

- verificare orario di sistema e calendario server;
- comunicare canale di assistenza;
- monitorare sola affluenza;
- non consultare preferenze parziali;
- gestire incidenti secondo doc 05.

## Fase 8 — Chiusura e scrutinio

1. Verificare chiusura server-side.
2. Acquisire backup/evidenze secondo piano.
3. La Commissione esegue scrutinio su schede già anonimizzate.
4. Verificare conteggi, bianche, validità e regole di assegnazione.
5. Convalidare formalmente gli esiti.
6. Impostare la pubblicazione nel momento previsto.

## Fase 9 — Documentazione/conservazione

- generare verbali;
- sottoscrivere secondo procedure dell'Istituto;
- protocollare/acquisire agli atti;
- trasferire in conservazione a norma secondo manuale e piano dell'Istituto;
- applicare retention/cancellazione ai dati operativi non più necessari.
