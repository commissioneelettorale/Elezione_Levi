'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {aggregateVoteCollection:aggregate}=require('../lib/management-aggregate.js');
const rows=[
 {classe:'1A',candidate1:'ROSSI',isBianca:false,_aggregateOnly:true},
 {classe:'1A',candidate1:'BIANCHI',isBianca:false,_aggregateOnly:true},
 {classe:'1A',isBianca:true,_aggregateOnly:true},
 {classe:'1B',candidate1:'VERDI',isBianca:false,_aggregateOnly:true}
];
let result=aggregate(rows,'TUTTE','DIRIGENTE','voti_classe_studenti');
assert.equal(result.filtered.length,4);
assert.deepEqual({...result.classes['1A'].preferences},{ROSSI:1,BIANCHI:1});
assert.equal(result.classes['1A'].bianche,1);
assert.equal(result.classes['1B'].validi,1);
result=aggregate(rows,'1A','DIRIGENTE','voti_classe_studenti');
assert.equal(result.filtered.length,3);
assert.deepEqual(Object.keys(result.classes),['1A']);
result=aggregate(rows,'TUTTE','DSGA','voti_classe_studenti');
assert.deepEqual({...result.classes['1A'].preferences},{});
result=aggregate(rows,'TUTTE','DIRIGENTE','voti_consulta');
assert.equal(result.filtered.length,4);
assert.deepEqual(Object.keys(result.classes),[]);
result=aggregate(rows,'1A','DIRIGENTE','voti_istituto');
assert.equal(result.filtered.length,4);
assert.deepEqual(Object.keys(result.classes),[]);
result=aggregate([{classe:'1A',_turnoutOnly:true,isBianca:false}], '1A','DIRIGENTE','voti_classe_studenti');
assert.equal(result.hasTallies,false);
assert.equal(result.classes['1A'].hasTallies,false);
assert.deepEqual({...result.classes['1A'].preferences},{});
const html=fs.readFileSync('index.html','utf8');
assert.ok(html.includes('lib/management-aggregate.js'));
assert.ok(html.includes('LeviManagementAggregate.aggregateVoteCollection'));
assert.ok(!/\b(?<!\.)aggregateVoteCollection\(rows, selectedClass, role\)/.test(html));
console.log('PASS: aggregation, filters, counting, privacy roles, in-progress masking, dashboard helper wiring');
