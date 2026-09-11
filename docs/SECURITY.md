# Security policy

## Segnalazioni

Le vulnerabilità non devono essere pubblicate in issue pubbliche se possono facilitare attacchi contro una consultazione attiva. Usare il canale istituzionale indicato dall'Istituto.

## Segreti vietati nel repository

Non committare:

- password;
- file service-account JSON;
- private key;
- refresh token/Firebase CLI token;
- export del database;
- registri reali con nominativi/token;
- screenshot contenenti credenziali.

La `firebaseConfig` web contiene identificatori/configurazione client e non sostituisce le regole di sicurezza: l'autorizzazione deve essere garantita da Firestore Rules e backend.

## Regole per modifiche

- modifiche a `functions/index.js`, `firestore.rules` o logica di voto richiedono nuovo collaudo;
- la versione usata deve essere identificata da commit SHA nel verbale;
- non effettuare hotfix non tracciati durante una consultazione salvo emergenza formalmente gestita;
- le operazioni distruttive sull'urna non sono disponibili dal browser ordinario.

## Dipendenze

Eseguire periodicamente controlli vulnerabilità su `functions/package.json` e verificare le librerie client. Aggiornare solo dopo test di regressione e nuovo collaudo della versione.
