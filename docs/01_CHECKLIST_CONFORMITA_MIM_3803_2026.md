# 01 — Checklist di conformità pre-utilizzo

La checklist deve essere compilata **prima di ogni messa in esercizio reale** e allegata al verbale di collaudo. Una voce non verificata non deve essere marcata come conforme.

## A. Governance e regolamento

- [ ] Regolamento d'Istituto aggiornato per sedute/votazioni digitali.
- [ ] Tipologia di consultazione e base regolamentare individuate.
- [ ] Presidente/Segretario/Commissione e responsabilità formalmente individuati.
- [ ] Procedura per sospensione/ripetizione in caso di malfunzionamento approvata.
- [ ] Periodo di apertura/chiusura e pubblicazione risultati formalmente determinati.
- [ ] Circolare/atto annuale MIM/USR pertinente acquisito agli atti.

## B. Identificazione e autenticazione

- [ ] Registro aventi diritto verificato e congelato prima dell'apertura.
- [ ] Credenziali/token individuali, non condivisi e consegnati con procedura controllata.
- [ ] Token generati con entropia crittografica adeguata.
- [ ] Account Commissione personali; nessuna password condivisa.
- [ ] Account Dirigente/Vicepreside/DSGA/Segreteria personali e limitati al ruolo.
- [ ] Password assenti da HTML, repository, documenti e log.
- [ ] Timeout sessione verificato.
- [ ] Sessioni simultanee non autorizzate impedite.

## C. Segretezza e urna

- [ ] Nessuna scheda contiene nome, token, email, UID o altro identificativo personale.
- [ ] Nessuna scheda contiene timestamp di deposito o IP/user-agent.
- [ ] Nessun `vote_id_*` o equivalente è memorizzato nel registro degli elettori.
- [ ] Nessun client può leggere direttamente le raccolte delle urne.
- [ ] Nessun client può scrivere direttamente nelle urne.
- [ ] La funzione di deposito valida lato server diritto, finestra temporale, lista, preferenze e duplicati.
- [ ] La sessione temporanea viene eliminata/invalidata contestualmente al deposito.
- [ ] La Commissione può scrutinare solo schede già prive di identità/metadati.
- [ ] Referenti e personale non autorizzato ricevono solo dati aggregati.
- [ ] Le preferenze parziali non sono visibili durante la votazione.

## D. Integrità e verificabilità

- [ ] Scrittura voto + aggiornamento diritto effettuati in transazione atomica.
- [ ] Unicità del voto verificata server-side.
- [ ] Regole su numero massimo di preferenze verificate server-side.
- [ ] Liste/candidati validati contro configurazione ufficiale.
- [ ] Conteggi di prova confrontati con dataset noto.
- [ ] Schede bianche e casi limite testati.
- [ ] Risultati complessivi riproducibili e verbalizzabili.

## E. Sicurezza ICT

- [ ] Firestore Rules distribuite e testate in modalità deny-by-default.
- [ ] Cloud Functions distribuite nella regione prevista.
- [ ] Dipendenze aggiornate e vulnerabilità critiche assenti.
- [ ] Repository privo di segreti e service-account key.
- [ ] GitHub secret scanning/code scanning abilitati ove disponibili.
- [ ] MFA attiva sugli account GitHub/Firebase amministrativi.
- [ ] Log amministrativi abilitati senza contenuto del voto.
- [ ] Piano incident response approvato.
- [ ] Backup e restore testati.

## F. GDPR

- [ ] Titolare, autorizzati, amministratori e responsabili ex art. 28 individuati.
- [ ] Finalità e base giuridica documentate.
- [ ] Informativa privacy resa agli interessati.
- [ ] Registro dei trattamenti aggiornato.
- [ ] DPIA completata e approvata prima dell'uso reale.
- [ ] Localizzazione e trasferimenti dei dati verificati.
- [ ] Tempi di conservazione per registro aventi diritto, log e fascicolo definiti.
- [ ] Data breach procedure coordinate con DPO/Dirigente.

## G. Documentazione e conservazione

- [ ] Verbale di collaudo sottoscritto/acquisito agli atti.
- [ ] Hash/commit della versione software utilizzata annotato.
- [ ] Configurazione elettorale congelata e identificata.
- [ ] Verbali e risultanze acquisiti nel sistema documentale dell'Istituto.
- [ ] Metadati documentali compilati.
- [ ] Trasferimento in conservazione conforme alle procedure AgID dell'Istituto.

## Esito

- Data verifica: ____________________
- Versione/commit: ____________________
- Responsabile tecnico: ____________________
- Presidente Commissione: ____________________
- DPO consultato: SÌ / NO / N.A.
- Esito: IDONEO / NON IDONEO / IDONEO CON PRESCRIZIONI
- Prescrizioni: ____________________________________________________________
