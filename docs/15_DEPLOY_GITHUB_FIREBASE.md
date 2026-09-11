# 15 — Pubblicazione GitHub + Vercel + backend Firebase

## A. Vercel — frontend statico

Il repository `commissioneelettorale/Elezione_Levi` contiene un frontend HTML statico. Vercel serve `index.html`; autenticazione, voto e database restano nelle Firebase Functions/Firestore del progetto `votazioni-levi`.

Impostazioni del nuovo progetto Vercel:

1. **Add New… → Project**.
2. Collega GitHub e autorizza il repository `commissioneelettorale/Elezione_Levi`.
3. **Project Name:** `elezione-levi`.
4. **Framework Preset:** `Other`.
5. **Root Directory:** `./`.
6. **Build Command:** lasciare vuoto.
7. **Output Directory:** lasciare vuoto.
8. **Install Command:** lasciare vuoto.
9. **Environment Variables:** nessuna obbligatoria per il frontend.
10. Premi **Deploy**.

Non inserire in Vercel il JSON del service account Firebase o la password iniziale Commissione. Il vecchio endpoint Vercel non viene più usato dal frontend.

## B. Firebase backend

Le funzioni e le Firestore Security Rules vengono distribuite sul progetto Firebase `votazioni-levi` in regione `europe-west1`. Per pubblicare Cloud Functions il progetto deve avere il piano Blaze.

Nel repository GitHub aprire **Settings → Secrets and variables → Actions → New repository secret** e creare entrambe le secret:

- `FIREBASE_SERVICE_ACCOUNT_VOTAZIONI_LEVI`: incollare il JSON completo della chiave del service account Firebase/GCP.
- `COMMISSIONE_INITIAL_PASSWORD`: password temporanea scelta per l'account `commissione.presidente`; almeno 16 caratteri con maiuscole, minuscole, numeri e simboli.

Il JSON e la password non devono essere committati nel repository e non devono essere inseriti in Vercel.

Poi aprire **Actions → Deploy backend Firebase → Run workflow → main**. Il workflow distribuisce Rules, crea l'account iniziale se assente e pubblica tutte le Functions.

## C. Primo accesso Commissione

Dopo un workflow verde:

- username: `commissione.presidente`;
- password: il valore scelto in `COMMISSIONE_INITIAL_PASSWORD`;
- anno: `2026/2027`.

Al primo accesso il sito obbliga a scegliere una nuova password personale. La secret iniziale non viene stampata nei log e non viene sovrascritta durante i deploy successivi.

## D. Alternativa offline

Se l'account esiste già e non si conosce la password, usare il provisioning offline documentato in `docs/12_PROCEDURA_MESSA_IN_ESERCIZIO.md`; non creare amministratori dal browser pubblico.