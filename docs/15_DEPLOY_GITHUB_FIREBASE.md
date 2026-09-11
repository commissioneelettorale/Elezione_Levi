# 15 — Pubblicazione GitHub + backend Firebase

## A. GitHub Pages (frontend)

Il repository contiene `.github/workflows/pages.yml`. Al primo push su `main` il workflow tenta la pubblicazione.

Per un repository nuovo GitHub richiede normalmente una sola impostazione amministrativa:

1. aprire **Settings** del repository;
2. **Pages**;
3. in **Build and deployment → Source** scegliere **GitHub Actions**.

Dopo questa abilitazione, ogni modifica a `index.html` su `main` viene pubblicata automaticamente.

URL previsto per questo repository:

`https://giuseppeborzumati-cmyk.github.io/Elezioni/`

> GitHub Pages ospita soltanto il frontend. Non sostituisce il backend di voto.

## B. Firebase backend

Le funzioni di voto e le Firestore Security Rules devono essere distribuite sul progetto Firebase `mio-sistema-voto` (oppure va cambiato coerentemente il project ID nel codice e nella configurazione).

### Metodo 1 — locale

```bash
npm install -g firebase-tools
firebase login
firebase use mio-sistema-voto
npm install --prefix functions
npm run check --prefix functions
firebase deploy --only functions,firestore:rules
```

### Metodo 2 — GitHub Actions

È incluso `.github/workflows/firebase-backend.yml`, volutamente manuale.

Prima di usarlo occorre inserire nel repository GitHub il secret:

`FIREBASE_SERVICE_ACCOUNT_MIO_SISTEMA_VOTO`

Il valore deve essere il JSON di un service account dedicato al deploy con privilegi minimi necessari. Non committare mai il JSON nel repository.

Percorso GitHub:

**Settings → Secrets and variables → Actions → New repository secret**.

Dopo il collaudo:

**Actions → Deploy backend Firebase (manuale) → Run workflow**.

## C. Primo account Commissione

La piattaforma non contiene una password di emergenza o hard-coded. Il primo account deve essere creato offline con `functions/scripts/provision-account.js`; vedere doc 12.

## D. Perché questi passaggi non sono automatizzati nel browser

Consentire al frontend pubblico di creare il primo amministratore, modificare le Rules o distribuire il backend introdurrebbe una backdoor incompatibile con il principio del minimo privilegio. Queste operazioni restano volutamente fuori dal sito elettorale.
