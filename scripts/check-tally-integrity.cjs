'use strict';
// Deterministic counting checks on synthetic ballots. No cloud writes or real votes.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const admission=require('../lib/voting-admission'),legal=require('../lib/legal-readiness');
const binding={commit:'a'.repeat(40),configurationSha256:'b'.repeat(64),credentialRevision:'REV-1'};
const config={privacyMode:legal.ANONYMOUS_MODE,modalitaProva:false};
assert.deepEqual(admission.blockers(config,{votingReview:{stage:'PREPARATION'}},binding),['privacyReviewPending'],'Preparation never admits voting');
assert.deepEqual(admission.blockers({...config,bypassLegalBlockers:true},{votingReview:{stage:'PREPARATION'}},binding),['privacyReviewPending'],'A configuration flag cannot skip admission');
assert.ok(legal.structuralBlockers({privacyMode:'LEGACY_NAMED'}).includes('structuralSecrecy'),'Named credential archive blocked');
assert.deepEqual(admission.blockers(config,{votingReview:{stage:'AUTHORIZED',...binding}},binding),[],'Authorized and matching revision');
assert.deepEqual(admission.blockers(config,{votingReview:{stage:'AUTHORIZED',...binding,commit:'c'.repeat(40)}},binding),['votingReviewStale'],'A deployment change invalidates prior authorization');
const credential={schema:legal.ANONYMOUS_MODE,tipo:'STUDENTE',classe:'1A',hasVoted:false,
 activeSessionHash:'hash',sessionExpiresAt:{toMillis:()=>1800000000000}};
assert.ok(admission.anonymousRecord(credential),'Login session with expiry remains valid for vote transaction');
const deposited={...credential,activeSessionHash:null,sessionExpiresAt:null,completedSessionHash:'receipt',lastReceipt:{recordedBallots:1,fullyCompleted:false},voted_classe_studente:true};
assert.ok(admission.anonymousRecord(deposited),'Credenziale valida anche dopo il primo deposito');
assert.equal(admission.anonymousRecord({...deposited,nome:'PERSONA FINTA'}),false,'No name on anonymous credentials');
const html=fs.readFileSync('index.html','utf8');
const start=html.indexOf('async function fetchScrutinioData(colName) {');
const end=html.indexOf('// === EX AEQUO',start);
assert.ok(start>=0&&end>start,'Real scrutiny calculation source found');
const input=[
 {tipo:'DOCENTE',lista:'A',p1:'DOC UNO'},
 {tipo:'DOCENTE',isBianca:true},
 {tipo:'GENITORE',lista:'B',p1:'GEN UNO'},
 {tipo:'ATA',lista:'C',p1:'ATA UNO'}
];
const context={
 currentScrutinioSection:'consiglio',currentScrutinioSubComponent:'DOCENTE',
 configElezioni:{
  listeConsiglio:{DOCENTE:{A:{candidati:['DOC UNO']}},GENITORE:{B:{candidati:['GEN UNO']}},ATA:{C:{candidati:['ATA UNO']}}},
  maxPrefConsiglio:2,listeConsulta:{},listeIstituto:{}
 },
 officialVotiScrutinio:{liste:{},preferenze:{},classi:{},classDetail:{},totali:{}},
 getVotiUrna:async()=>input,
 getCanonicalName:x=>String(x).toUpperCase(),
 normalizeName:x=>String(x).toUpperCase()
};
vm.createContext(context);vm.runInContext(html.slice(start,end)+'\nthis.tally=fetchScrutinioData;',context);
(async()=>{
 const t=context.tally;
 await t('voti_consiglio');
 assert.equal(context.officialVotiScrutinio.totali.votanti,2,'Teacher turnout excludes parents and ATA');
 assert.equal(context.officialVotiScrutinio.totali.bianche,1);
 assert.equal(context.officialVotiScrutinio.totali.validi,1);
 assert.equal(context.officialVotiScrutinio.liste.voti_consiglio.A,1);
 assert.equal(context.officialVotiScrutinio.preferenze.voti_consiglio['A_DOC UNO'],1);
 context.currentScrutinioSubComponent='GENITORE';await t('voti_consiglio');
 assert.equal(context.officialVotiScrutinio.totali.votanti,1);
 assert.equal(context.officialVotiScrutinio.liste.voti_consiglio.B,1);
 context.currentScrutinioSubComponent='ATA';await t('voti_consiglio');
 assert.equal(context.officialVotiScrutinio.totali.votanti,1);
 assert.equal(context.officialVotiScrutinio.preferenze.voti_consiglio['C_ATA UNO'],1);
 console.log('PASS: exact council per-component totals, blank/valid and preference counts, anonymous credential lifecycle, PREPARATION blocked, release binding enforced. Synthetic data only.');
})().catch(err=>{console.error(err);process.exitCode=1;});
