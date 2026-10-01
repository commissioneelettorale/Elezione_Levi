(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.LeviConfigPersistence=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';

// Firestore serializes map keys in canonical order. JSON.stringify() on raw
// JavaScript objects is insertion-order sensitive and can produce false alarms.
function canonicalize(value){
  if(Array.isArray(value))return value.map(canonicalize);
  if(value!==null&&typeof value==='object'){
    return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonicalize(value[key])]));
  }
  return value;
}

function differences(expected,stored){
  if(!expected||typeof expected!=='object'||Array.isArray(expected)||
     !stored||typeof stored!=='object'||Array.isArray(stored))return ['configurazione'];
  // The server derives this value from the effective dedicated vote windows.
  const serverDerived=new Set(['votingStartsAtMs']);
  return Object.keys(expected)
    .filter(key=>!serverDerived.has(key))
    .filter(key=>JSON.stringify(canonicalize(expected[key]))!==JSON.stringify(canonicalize(stored[key])));
}

return Object.freeze({canonicalize,differences});
});
