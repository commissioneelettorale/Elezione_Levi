# Piattaforma Elettorale Unificata — ITSCG Primo Levi di Seregno

Repository della piattaforma elettorale digitale.

Il sito pubblico e l'endpoint `/api/call` vengono pubblicati su Vercel dal branch `main`.

## Struttura essenziale

- `index.html` — sito web principale
- `404.html` — pagina di fallback
- `api/call.js` — proxy Vercel verso le Firebase Functions
- `vercel.json` — configurazione Vercel
- `firebase.json` — configurazione Hosting/Functions/Firestore
- `firestore.rules` — regole di sicurezza Firestore
- `functions/` — backend Firebase
- `docs/` — documentazione tecnica e normativa
- `.github/workflows/firebase-backend.yml` — deploy backend Firebase

Il frontend usa il progetto Firebase `votazioni-levi` e le Functions in regione `europe-west1`. Vercel è il backend HTTP principale tramite `/api/call`; Firebase resta il backend applicativo e il database.

Prima di usare la piattaforma per una consultazione reale devono risultare distribuite le Functions e le Firestore Rules dello stesso commit, completato il collaudo dell'ambiente reale e verificata la disciplina elettorale applicabile alla specifica consultazione.
