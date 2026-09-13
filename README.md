> **Aggiornamento V2 — 13 settembre 2026:** il precedente blocco generale V1 è sostituito dal processo in presenza con credenziali non nominative, collaudo, verifica indipendente e autorizzazione registrata. Il processo nominativo resta escluso. I riferimenti successivi al blocco V1 descrivono quella valutazione precedente. Fare riferimento alla [procedura corrente](docs/19_FASCICOLO_DPO_E_RIPRESA.md) e al Fascicolo DPO. Non sono dichiarati anonimato assoluto o cifratura end-to-end.


# Piattaforma Elettorale Unificata — ITSCG Primo Levi di Seregno

Repository della piattaforma elettorale digitale.

## Architettura

- `index.html` — sito web principale;
- `api/call.js` — backend Node.js serverless su Vercel;
- `functions/core.js` — logica applicativa condivisa;
- `functions/index.js` — wrapper opzionale compatibile con Firebase Functions;
- `firestore.rules` — regole di sicurezza Firestore;
- `firebase.json` — configurazione Firestore/Hosting;
- `.github/workflows/firebase-backend.yml` — deploy delle regole e bootstrap account.

Flusso principale:

```text
Browser → Vercel /api/call → Firebase Admin SDK → Firestore
                 ↘ area Assistente tecnico → stato/log/checkpoint server-side
```

Le Firebase Functions non vengono utilizzate per il backend applicativo: in questo modo il progetto può restare sul piano Firebase senza Blaze. Firestore resta il database e il service account viene usato solo server-side da Vercel.

## Variabile obbligatoria Vercel

In Vercel riutilizzare in **Production** la variabile esistente. Per un ambiente di collaudo separato usare un diverso progetto Firebase e credenziali distinte; non copiare i segreti Production in Preview:

- `FIREBASE_SERVICE_ACCOUNT_JSON`: JSON del service account Firebase dell’ambiente pertinente, custodito come segreto server.

Non usare il prefisso `NEXT_PUBLIC_` e non inserire mai questo JSON nel repository o nel browser. La chiave privata deve essere ruotata se è stata esposta.

Le nuove schede sono cifrate usando materiale derivato dalla configurazione server esistente (oppure `BALLOT_ENCRYPTION_KEY`, se predisposta prima del voto). La rotazione richiede anche la gestione delle chiavi delle urne: **non perdere il materiale originale necessario a leggere le schede già cifrate**. Procedura, limiti dell’anonimato e gestione dei dati pregressi sono descritti in [Consultazioni e protezione delle schede](docs/16_CONSULTAZIONI_E_PROTEZIONE_SCHEDE.md).

La stessa guida descrive il filtro per consultazione, i calendari e gli atti distinti, i verbali collegati, le pubblicazioni/ricorsi e le azioni **Risolvi** del collaudo. Le modifiche sono verificabili con `node scripts/check-consultations.cjs` e `node scripts/check-consultation-documents.cjs` oltre ai controlli di sicurezza ed esportazione già presenti.

La [pagina sulla protezione del voto](anonimato.html) distingue le misure implementate dall’[architettura con scrutinio verificabile e custodi indipendenti da integrare](docs/17_PERCORSO_ANONIMATO_VERIFICABILE.md). Tutti i ruoli del portale, inclusa la Commissione, ricevono solo proiezioni aggregate; i nuovi checkpoint conservano anche la valutazione dei limiti architetturali.

## Deploy

Vercel esegue automaticamente il deploy dal branch `main`. Non serve eseguire `firebase deploy --only functions`.

Il workflow GitHub pubblica soltanto Firestore Rules e prepara l’account iniziale `commissione.presidente`. Il primo accesso richiede il cambio della password temporanea. L’account `ASSISTENTE_TECNICO` viene creato dalla Commissione e può usare solo l’area tecnica (stato, log, checkpoint e verbale PDF); non accede alle urne, ai voti o ai risultati. L’endpoint Vercel accetta richieste cross-origin solo dalla pagina GitHub Pages del progetto e dal dominio Vercel autorizzato.
