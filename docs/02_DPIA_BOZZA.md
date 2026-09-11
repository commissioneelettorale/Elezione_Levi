# 02 — DPIA: schema di lavoro per il DPO/Titolare

> **BOZZA DA COMPLETARE.** Non costituisce una DPIA approvata. L'Allegato tecnico MIM richiama espressamente la valutazione d'impatto, in particolare per i sistemi di voto digitale nei casi previsti. Deve essere completata dal Titolare con il DPO e approvata secondo le procedure dell'Istituto.

## 1. Descrizione del trattamento

**Titolare:** ITSCG Primo Levi di Seregno.

**Finalità:** organizzare consultazioni scolastiche, verificare il diritto di partecipazione/voto, garantire unicità, acquisire schede segrete o voti palesi ove previsti, produrre risultati e verbali, documentare il procedimento.

**Categorie di interessati:** studenti, genitori/tutori, docenti, personale ATA, personale di direzione/segretaria, componenti della Commissione elettorale.

**Dati trattati nell'area aventi diritto:** nominativo, componente, classe/indirizzo ove necessario, stato di utilizzo delle schede previste, credenziale casuale.

**Dati trattati nell'urna segreta:** esclusivamente scelta elettorale e gli attributi strettamente necessari alla circoscrizione elettorale (ad esempio componente o classe quando indispensabile). Non devono essere memorizzati nome, token, UID, IP, user-agent o timestamp individuale.

## 2. Flusso dati

1. La Commissione importa/verifica gli aventi diritto.
2. Il sistema genera credenziali casuali ad alta entropia.
3. L'elettore presenta la credenziale al servizio di validazione.
4. Il servizio verifica diritto, finestra elettorale e stato delle schede.
5. Viene creata una sessione temporanea; la sessione non viene memorizzata nella scheda.
6. Il servizio valida lato server il contenuto del voto.
7. In una transazione atomica registra una scheda priva di identità/metadati e aggiorna lo stato del diritto di voto.
8. Il legame temporaneo di sessione viene eliminato nella stessa transazione.
9. Durante la votazione sono esposti solo dati di affluenza; risultati/preferenze sono rilasciati secondo le regole di fase.
10. Verbali e risultanze sono trasferiti nel sistema documentale/conservazione dell'Istituto.

## 3. Necessità e proporzionalità

Da documentare:

- perché il voto digitale è necessario rispetto alle finalità;
- quali consultazioni richiedono voto segreto;
- perché ciascun dato del registro aventi diritto è necessario;
- perché l'urna non necessita di dati identificativi;
- tempi di conservazione differenziati;
- soggetti con accesso a ciascuna area.

## 4. Principali rischi

| Rischio | Impatto | Probabilità iniziale | Misure previste | Rischio residuo |
|---|---|---:|---|---|
| Correlazione identità-voto | Molto alto | Media | separazione persistente, nessun vote_id/timestamp, urne non leggibili dal client | da valutare |
| Furto token | Alto | Media | alta entropia, consegna controllata, sessione 15 min, unicità | da valutare |
| Furto account staff | Alto | Media | password lunghe, scrypt, MFA provider, minimo privilegio | da valutare |
| Lettura diretta Firestore | Molto alto | Media | rules deny-by-default, Admin SDK solo Functions | da valutare |
| Alterazione voto dal browser | Alto | Media | validazione completa server-side | da valutare |
| Esposizione risultati parziali | Medio/Alto | Media | fase server-side, preferenze nascoste durante apertura | da valutare |
| XSS/supply chain | Alto | Media | input validation, version pinning, CSP, aggiornamenti | da valutare |
| Perdita dati | Alto | Bassa/Media | backup, export, restore test | da valutare |
| Data breach | Alto | Media | incident response, audit, limitazione accessi | da valutare |
| Conservazione impropria | Medio/Alto | Media | integrazione con sistema documentale e conservazione | da valutare |

## 5. Ruoli privacy

Compilare e allegare:

- Titolare del trattamento;
- DPO;
- autorizzati interni;
- amministratori di sistema, se nominati;
- eventuali responsabili ex art. 28 GDPR (cloud, servizi esterni, manutentori);
- eventuali sub-responsabili;
- localizzazione primaria/backup e trasferimenti extra SEE, se presenti.

## 6. Conservazione

Definire tempi distinti per:

- registro aventi diritto/token;
- account del personale;
- audit amministrativi;
- configurazioni e verbali;
- risultati aggregati;
- eventuali copie di sicurezza.

La scheda segreta non deve essere conservata insieme a dati che permettano una ricostruzione dell'identità del votante.

## 7. Consultazione del DPO e decisione finale

- Parere DPO: __________________________________________________________
- Misure aggiuntive richieste: __________________________________________
- Rischio residuo accettabile: SÌ / NO
- Eventuale consultazione preventiva Garante ex art. 36 GDPR: SÌ / NO / N.A.
- Data approvazione: __________________
- Firma Titolare/Delegato: __________________
