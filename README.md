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

In Vercel, per **Production** e **Preview**, creare:

- `FIREBASE_SERVICE_ACCOUNT_JSON`: contenuto completo del nuovo JSON del service account Firebase.

Non usare il prefisso `NEXT_PUBLIC_` e non inserire mai questo JSON nel repository o nel browser. La chiave privata deve essere ruotata se è stata esposta.

## Deploy

Vercel esegue automaticamente il deploy dal branch `main`. Non serve eseguire `firebase deploy --only functions`.

Il workflow GitHub pubblica soltanto Firestore Rules e prepara l’account iniziale `commissione.presidente`. Il primo accesso richiede il cambio della password temporanea. L’account `ASSISTENTE_TECNICO` viene creato dalla Commissione e può usare solo l’area tecnica (stato, log, checkpoint e verbale PDF); non accede alle urne, ai voti o ai risultati. L’endpoint Vercel accetta richieste cross-origin solo dalla pagina GitHub Pages del progetto e dal dominio Vercel autorizzato.
