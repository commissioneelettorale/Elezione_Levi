# 11 — Matrice requisiti MIM → controllo → evidenza

| Requisito Allegato tecnico | Controllo implementato | Evidenza | Stato da collaudare |
|---|---|---|---|
| Identificazione utenti | registro aventi diritto e account personali staff | `index.html`, `functions/index.js` | ☐ |
| Autenticazione adeguata | login server-side, hash scrypt, token temporanei | `functions/index.js` | ☐ |
| Ruoli/minimo privilegio | custom claims e Firestore Rules | `functions/index.js`, `firestore.rules` | ☐ |
| Sessioni sicure | timeout 15 min, una sessione token attiva | frontend/backend | ☐ |
| Unicità voto | flag server-side + transazione Firestore | `castVote` | ☐ |
| Integrità/non modificabilità | client non scrive urne; `tx.create` server-side | rules + function | ☐ |
| Separazione identità/voto | nessun identificativo della scheda nel token; sessione transitoria rimossa | schema DB + preflight | ☐ |
| Anonimizzazione effettiva | scheda sanitizzata, niente token/nome/UID | `sanitizeStoredBallot` | ☐ |
| Non accessibilità info correlanti | urne deny-by-default; viste server-side | `firestore.rules`, `getAnonymousBallots` | ☐ |
| Metadati | niente timestamp/IP/user-agent nelle schede | backend + preflight | ☐ |
| Verificabilità esito | scrutinio su dati anonimi; proiezioni aggregate | frontend/backend | ☐ |
| Cifratura | TLS provider e cifratura cloud da verificare contrattualmente | documentazione provider | ☐ |
| Audit | `audit_admin` + Cloud Audit Logs da abilitare | backend/provider | ☐ |
| Incidenti | procedura formalizzata | doc 05 | ☐ |
| Backup/DR | piano + restore test | doc 06 | ☐ |
| Privacy by design | minimizzazione + segregazione | architettura + DPIA | ☐ |
| Art. 28 GDPR | verifica/nomina fornitori | atti Istituto | ☐ |
| DPIA | modello da completare | doc 02 | ☐ |
| Verbali/conservazione | workflow + acquisizione nel sistema documentale | frontend + manuali Istituto | ☐ |
| Regolamento | schema di integrazione | doc 03 | ☐ |
| Malfunzionamenti | sospensione/ripetizione verbalizzata | doc 03/05 | ☐ |
| Verifica preventiva | checklist + collaudo + commit | doc 01/07 | ☐ |
| Dichiarazione tecnica | modello per versione collaudata | doc 08 | ☐ |

**Nota:** una casella può essere marcata soltanto dopo verifica della configurazione realmente distribuita. Il repository da solo non prova la conformità dell'ambiente cloud in esercizio.
