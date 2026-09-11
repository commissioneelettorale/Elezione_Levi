# 15 — Pubblicazione GitHub + Vercel + backend Firebase

## A. Architettura

Il sito pubblico viene pubblicato su Vercel. Vercel gestisce sia il frontend statico (`index.html`) sia l'endpoint serverless `/api/call`.

L'endpoint Vercel inoltra esclusivamente le chiamate autorizzate alle Firebase Functions del progetto `votazioni-levi`. Firebase resta il sistema che gestisce autenticazione, regole, database e logica elettorale.

Flusso operativo:

```text
Browser → Vercel /api/call → Firebase Functions → Firestore
```

## B. Impostazioni Vercel

Nel nuovo account Vercel:

1. **Add New → Project**.
2. Importare `commissioneelettorale/Elezione_Levi`.
3. **Project Name:** `elezione-levi`.
4. **Framework Preset:** `Other`.
5. **Root Directory:** `.`.
6. **Build Command:** vuoto.
7. **Output Directory:** vuoto.
8. **Install Command:** vuoto.
9. Branch di produzione: `main`.
10. Deploy automatico attivo a ogni push su `main`.

In **Settings → Environment Variables** creare:

- **Name:** `FIREBASE_FUNCTIONS_BASE_URL`
- **Value:** `https://europe-west1-votazioni-levi.cloudfunctions.net`
- **Environments:** `Production` e `Preview`.

Non inserire in Vercel il service account Firebase e non inserire la password iniziale della Commissione.

Il file `vercel.json` e il file `api/call.js` sono già presenti nel repository.

## C. Firebase

Il progetto Firebase deve avere Project ID `votazioni-levi`, Firestore attivo, Authentication attivo e provider **Anonymous** abilitato. Le Functions usano la regione `europe-west1`.

Per pubblicare le Functions è necessario il piano Blaze. Il dominio Vercel deve essere aggiunto in **Authentication → Settings → Authorized domains**.

## D. Secret GitHub per il deploy Firebase

Nel repository GitHub aprire **Settings → Secrets and variables → Actions → New repository secret** e creare:

- `FIREBASE_SERVICE_ACCOUNT_VOTAZIONI_LEVI`: JSON completo della chiave service account Firebase/GCP;
- `COMMISSIONE_INITIAL_PASSWORD`: password iniziale scelta per `commissione.presidente`, almeno 16 caratteri con maiuscole, minuscole, numeri e simboli.

Il JSON e la password non devono essere committati e non devono essere inseriti in Vercel.

## E. Deploy

1. Aprire **Actions**.
2. Selezionare **Deploy backend Firebase**.
3. Cliccare **Run workflow**.
4. Selezionare `main`.
5. Attendere il risultato verde.

Il workflow pubblica Firestore Rules, crea l'account Commissione se assente e distribuisce le Functions.

## F. Primo accesso Commissione

- username: `commissione.presidente`;
- anno scolastico: `2026/2027`;
- password: valore scelto in `COMMISSIONE_INITIAL_PASSWORD`.

Al primo accesso è obbligatorio impostare una nuova password personale.

## G. Verifica tecnica

Dal dominio Vercel verificare:

- apertura di `index.html`;
- caricamento di `levi.png`;
- chiamata `POST /api/call`;
- accesso Commissione;
- risposta della Function `commissionLogin`;
- cambio password iniziale.

Se `/api/call` non risponde, il frontend utilizza il fallback diretto Firebase; in ogni caso il deploy Firebase deve risultare verde prima del collaudo reale.