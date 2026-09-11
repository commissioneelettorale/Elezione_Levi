# Piattaforma Elettorale Unificata — ITSCG Primo Levi di Seregno

Repository pulito della piattaforma elettorale digitale.

La pagina principale è `index.html` nella root del branch `main`.

## Struttura essenziale

- `index.html` — sito web principale
- `404.html` — fallback GitHub Pages
- `firebase.json` — configurazione Hosting/Functions/Firestore
- `firestore.rules` — regole di sicurezza Firestore
- `functions/` — backend Firebase
- `docs/` — documentazione tecnica e normativa
- `.github/workflows/pages.yml` — pubblicazione frontend su GitHub Pages
- `.github/workflows/firebase-backend.yml` — deploy backend Firebase

Il frontend è configurato per il progetto Firebase `mio-sistema-voto` e per le Functions in regione `europe-west1`.

Prima di usare la piattaforma per una consultazione reale devono risultare distribuite le Functions e le Firestore Rules dello stesso commit, completato il collaudo dell'ambiente reale e verificata la disciplina elettorale applicabile alla specifica consultazione.
