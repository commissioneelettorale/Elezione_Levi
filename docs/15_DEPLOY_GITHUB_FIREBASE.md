# 15 — Pubblicazione GitHub + Vercel + Firestore senza Firebase Blaze

## A. Architettura

Il sito e il backend applicativo sono pubblicati da Vercel:

```text
Browser → Vercel /api/call → Firebase Admin SDK → Firestore
```

Firebase conserva Firestore, Authentication e Security Rules. Le Firebase Functions non sono necessarie e non vengono distribuite; quindi il progetto non deve essere portato al piano Blaze per il backend applicativo.

## B. Impostazioni Vercel

Nel nuovo account Vercel:

1. Importare `commissioneelettorale/Elezione_Levi`.
2. Framework Preset: **Other**.
3. Root Directory: `.`.
4. Build Command: vuoto.
5. Output Directory: vuoto.
6. Install Command: predefinito.
7. Branch di produzione: `main`.
8. Deploy automatico attivo.

In **Settings → Environment Variables** creare la seguente variabile per **Production** e **Preview**:

- **Name:** `FIREBASE_SERVICE_ACCOUNT_JSON`
- **Value:** JSON completo di una nuova chiave service account del progetto `votazioni-levi`.

La variabile è server-side: non usare `NEXT_PUBLIC_`. Non committare il JSON e non inserirlo in `index.html`.

## C. Firebase senza Blaze

Devono restare attivi:

- Firestore;
- Firebase Authentication;
- il provider necessario all’accesso previsto;
- Firestore Rules.

Il deploy delle regole può continuare tramite GitHub Actions. Il workflow non esegue più `firebase deploy --only functions`, perché l’API applicativa è Vercel.

## D. Secret GitHub

Nel repository GitHub mantenere:

- `FIREBASE_SERVICE_ACCOUNT_VOTAZIONI_LEVI`;
- `COMMISSIONE_INITIAL_PASSWORD`.

Il workflow usa la chiave soltanto per pubblicare le Rules e preparare l’account Commissione. La password iniziale viene usata solo quando l’account non esiste; non sovrascrive un account già presente.

## E. Primo accesso Commissione

- username: `commissione.presidente`;
- anno scolastico: `2026/2027`;
- password temporanea: valore presente nella secret al momento della creazione.

Al primo accesso viene mostrata la schermata di cambio password e il pannello resta bloccato fino al completamento.

## F. Verifica

Dal dominio Vercel verificare:

1. apertura del sito;
2. risposta `POST /api/call`;
3. accesso Commissione;
4. cambio password obbligatorio;
5. caricamento del pannello dopo il cambio;
6. lettura/scrittura Firestore tramite le operazioni autorizzate.

La chiave service account deve essere conservata esclusivamente nelle variabili segrete Vercel/GitHub e ruotata se è stata pubblicata o condivisa.
