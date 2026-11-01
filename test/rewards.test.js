const {test}=require('node:test');
const assert=require('node:assert/strict');
const {calculate,progress,config}=require('../rewards/policy');
const matches=require('../rewards/matches');
test('completion rewards favor wins but pay losses, and solo PvE is discounted',()=>{
 const input={seconds:600,kills:10,deaths:5,mode:'pvp',players:2};
 const win=calculate({...input,outcome:'win'}),loss=calculate({...input,outcome:'loss'}),draw=calculate({...input,outcome:'draw'});
 assert.equal(win.xp,800);assert.equal(win.points,1500);assert.ok(win.xp>draw.xp&&draw.xp>loss.xp&&loss.xp>0);
 assert.equal(calculate({...input,mode:'pve',players:1,outcome:'win'}).xp,532);
});
test('short games, solo PvP and leavers cannot farm rewards; long/stat spam has a cap',()=>{
 const input={seconds:600,kills:10,mode:'pvp',players:2,outcome:'win'};
 for(const change of [{seconds:59},{players:1},{left:true}])assert.equal(calculate({...input,...change}).xp,0);
 const r=calculate({...input,seconds:86400,kills:1e9,deaths:1e9});assert.ok(r.xp<=config.maximumXp);assert.ok(r.points<=config.maximumPoints);assert.equal(r.kills,config.maximumRecordedKills);
});
test('level curve uses cumulative XP, handles multiple levels and respects cap',()=>{
 assert.equal(progress(999).level,1);assert.equal(progress(1000).level,2);assert.equal(progress(2250).level,3);assert.equal(progress(1e9,30).level,30);
});
function room(){return {campaign:true,members:new Map([[1,{accountId:1,team:0,client:{currentHangarSlot_:2}}]]),state:'playing'};}
test('round transitions preserve match id and accumulated stats; duplicate death is ignored',()=>{
 const r=room();const m=matches.start(r,10000);matches.start(r,20000);assert.equal(r.rewardMatch.id,m.id);
 matches.death(r,1,99,30000);matches.death(r,1,99,30001);assert.equal(m.players.get(1).kills,1);
 const result=matches.snapshot(r,0,'campaign',700000);assert.equal(result.players[0].outcome,'win');assert.equal(result.players[0].mech,2);assert.ok(result.players[0].reward.xp>0);
 matches.leave(r,1);assert.equal(matches.snapshot(r,0,'campaign',700000).players[0].reward.xp,0);
});
test('reward packets use verified lengths and update server cached point balance',()=>{
 const sent=[];const c={send:m=>sent.push(m),getMessageBuffer(t,n){const b=Buffer.alloc(n+16);b.writeUInt32BE(t,12);return [b,b.subarray(16)];}};
 require('../rewards/sender').send(c,{record:{level:2,floor:1000,exp:1200,exp_max:2250,wins:1,draws:0,losses:0,kills:10,deaths:5,point:101500,coupon:0},mech:{mech_type:2,level:2,exp:1200,kills:10,deaths:5,sorties:1},levelUp:true});
 assert.equal(sent[1].readUInt32BE(12),0x220412);assert.equal(sent[1].length,96);assert.equal(sent[1].readBigUInt64LE(16+0x38),1200n);assert.equal(c.point_,101500);
});
test('settlement rollback releases connection and leaves no committed partial grant',async()=>{
 const {settle}=require('../rewards/store');let rollback=false,released=false,commit=false;
 const conn={beginTransaction:async()=>{},commit:async()=>{commit=true;},rollback:async()=>{rollback=true;},release:()=>{released=true;},execute:async sql=>{
  if(sql.startsWith('SELECT id,'))return [[{id:1,point:100,coupon:0}]];
  if(sql.startsWith('SELECT match'))return [[]];
  if(sql.startsWith('SELECT * FROM records'))return [[{level:1,exp:0,wins:0,losses:0,draws:0,kills:0,deaths:0}]];
  if(sql.startsWith('SELECT * FROM mech'))return [[{level:1,exp:0,kills:0,deaths:0,sorties:0}]];
  throw new Error('simulated database failure');
 }};
 await assert.rejects(settle({getConnection:async()=>conn},{id:'test',mode:'pve',players:[{id:1,mech:1,seconds:100,outcome:'win',reward:{eligible:true,xp:100,points:100,kills:1,deaths:0}}]}),/simulated/);
 assert.equal(rollback,true);assert.equal(released,true);assert.equal(commit,false);
});

test('PvE kill rewards plateau at 100 kills independently of recorded kills',()=>{
 const base={seconds:600,mode:'pve',players:4,outcome:'win'};
 const a=calculate({...base,kills:100}),b=calculate({...base,kills:1000});
 assert.equal(a.xp,b.xp);assert.equal(a.points,b.points);assert.equal(a.xp,800);assert.equal(a.points,1600);
});

test('scoreboard carries the capped PvE grant in the client reward fields',()=>{
 let packet;
 const client={send:m=>{packet=m;},getMessageBuffer(t,n){const b=Buffer.alloc(n+16);b.writeUInt32BE(t,12);return [b,b.subarray(16)];}};
 const reward=calculate({seconds:600,mode:'pve',players:4,outcome:'win',kills:1000});
 require('../rewards/sender').sendScore(client,{winner:0,seconds:600,scores:[0,0],players:[{id:1,reward}]});
 const body=packet.subarray(16);
 assert.equal(packet.readUInt32BE(12),0x00222221);assert.equal(body[0x24],1);
 assert.equal(body.readUInt32LE(0x25+0x16),800);assert.equal(body.readUInt32LE(0x25+0x2a),1600);
});
