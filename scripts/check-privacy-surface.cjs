'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
assert.ok(html.includes('initializeAuth(app, { persistence: inMemoryPersistence })'));
for(const marker of ['localStorage.setItem','sessionStorage.setItem','document.cookie','firebase-analytics','getAnalytics(','httpsCallable(','cloudfunctions.net','placehold.co','measurementId'])assert.ok(!html.includes(marker),marker);
const source=html.slice(html.indexOf('        const VERCEL_BACKEND_URL'),html.indexOf('        const isAnonymousVoteMode'));
let calls=0,request,fail=false;
const context={auth:{currentUser:{getIdToken:async()=>'SYNTHETIC_TEST_TOKEN'}},fetch:async(url,options)=>{calls++;request={url,options};if(fail)throw Error('offline');return{ok:true,json:async()=>({data:{ok:true}})};}};
vm.createContext(context);vm.runInContext(source+'\nthis.testApi=SECURE_API;',context);
(async()=>{
 await context.testApi.getTechnicalStatus({annoScolastico:'2026/2027'});
 assert.equal(calls,1);assert.equal(request.options.credentials,'omit');assert.equal(request.options.cache,'no-store');assert.equal(request.url,'https://elezione-levi.vercel.app/api/call');
 fail=true;await assert.rejects(context.testApi.getTechnicalStatus({}),/offline/);assert.equal(calls,2,'no second backend fallback');
 const logStart=html.indexOf('        let electionTestLog = []'),logEnd=html.indexOf('        const MIM_PRODUCTION_CONTROLS',logStart);
 const storage={removeItem:()=>{}};const logs={localStorage:storage};vm.createContext(logs);vm.runInContext(html.slice(logStart,logEnd),logs);
 logs.writeElectionTestLog(Array.from({length:60},(_,i)=>({at:i})));assert.equal(logs.readElectionTestLog().length,50);
 const snapshot=logs.readElectionTestLog();snapshot[0].at='mutated';assert.notEqual(logs.readElectionTestLog()[0].at,'mutated');
 console.log('PASS: memory auth, no tracking integrations, one backend, no fallback on outage, no cookies sent by API and volatile test log.');
})().catch(e=>{console.error(e);process.exitCode=1;});
