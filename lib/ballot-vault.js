'use strict';
const crypto=require('node:crypto');
// The key never enters Firestore. Preserve this key across service-account rotations.
function keyMaterial(env=process.env){
 let secret,keyId;
 if(env.BALLOT_ENCRYPTION_KEY){
  secret=Buffer.from(env.BALLOT_ENCRYPTION_KEY,'base64');
  if(secret.length!==32)throw new Error('BALLOT_ENCRYPTION_KEY deve essere una chiave base64 di 32 byte.');
  keyId='dedicated-'+crypto.createHash('sha256').update(secret).digest('hex').slice(0,16);
 }else{
  const raw=env.FIREBASE_SERVICE_ACCOUNT_JSON||env.FIREBASE_SERVICE_ACCOUNT_VOTAZIONI_LEVI;
  const sa=raw?JSON.parse(raw):null;
  if(!sa?.private_key)throw new Error('Chiave server per la cifratura delle schede non disponibile.');
  secret=Buffer.from(sa.private_key.replace(/\r\n/g,'\n'));
  keyId='service-'+crypto.createHash('sha256').update(secret).digest('hex').slice(0,16);
 }
 return{secret,keyId};
}
function keyFor(year,collection,env){const {secret,keyId}=keyMaterial(env);return{key:Buffer.from(crypto.hkdfSync('sha256',secret,Buffer.from('LEVI_BALLOT_V1'),Buffer.from(year+'|'+collection),32)),keyId};}
function seal(ballot,year,collection,env){
 const {key,keyId}=keyFor(year,collection,env),iv=crypto.randomBytes(12),body=Buffer.from(JSON.stringify(ballot));
 // Constant-size payload avoids disclosing the number/length of preferences.
 if(body.length>8188)throw new Error('Scheda troppo grande per la registrazione protetta.');
 const padded=crypto.randomBytes(8192);padded.writeUInt32BE(body.length,0);body.copy(padded,4);
 const cipher=crypto.createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(year+'|'+collection+'|'+keyId));
 const ciphertext=Buffer.concat([cipher.update(padded),cipher.final()]);
 return{schema:'LEVI_SEALED_V1',keyId,iv:iv.toString('base64'),ciphertext:ciphertext.toString('base64'),tag:cipher.getAuthTag().toString('base64')};
}
function open(envelope,year,collection,env){
 if(envelope?.schema!=='LEVI_SEALED_V1')throw new Error('Formato della scheda cifrata non riconosciuto.');
 const material=keyFor(year,collection,env);
 if(material.keyId!==envelope.keyId)throw new Error('Chiave storica delle schede non disponibile: ripristinare la configurazione di cifratura prevista.');
 const decipher=crypto.createDecipheriv('aes-256-gcm',material.key,Buffer.from(envelope.iv,'base64'));
 decipher.setAAD(Buffer.from(year+'|'+collection+'|'+envelope.keyId));decipher.setAuthTag(Buffer.from(envelope.tag,'base64'));
 const padded=Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext,'base64')),decipher.final()]);
 if(padded.length!==8192||padded.readUInt32BE(0)>8188)throw new Error('Integrità della scheda non valida.');
 return JSON.parse(padded.subarray(4,4+padded.readUInt32BE(0)).toString('utf8'));
}
function shuffle(rows){const out=[...rows];for(let i=out.length-1;i>0;i--){const j=crypto.randomInt(i+1);[out[i],out[j]]=[out[j],out[i]];}return out;}
module.exports={seal,open,keyMaterial,shuffle};
