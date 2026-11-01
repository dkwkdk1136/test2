// Explicit opt-in: creates one temporary account, deletes it in finally.
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
if(!process.env.MRO_TEST_DB_MODULE)throw new Error('Set MRO_TEST_DB_MODULE to the configured database module');
const db=require(process.env.MRO_TEST_DB_MODULE);
const {migrate,settle}=require('../rewards/store');
let id;
(async()=>{
 try {
  await migrate(db.pool);
  const name='RewardTest'+randomUUID().replaceAll('-','').slice(0,10);
  id=await db.createAccount(name,name,101,null);
  const [[before]]=await db.pool.execute('SELECT point FROM accounts WHERE id=?',[id]);
  const player={id,mech:1,seconds:600,outcome:'win',reward:{eligible:true,xp:1200,points:1500,kills:10,deaths:5}};
  const match={id:randomUUID(),mode:'pvp',players:[player]};
  const both=await Promise.all([settle(db.pool,match),settle(db.pool,match)]);
  assert.equal(both[0].length+both[1].length,1);
  const [[record]]=await db.pool.execute('SELECT * FROM records WHERE account_id=?',[id]);
  const [[account]]=await db.pool.execute('SELECT point FROM accounts WHERE id=?',[id]);
  const [[mech]]=await db.pool.execute('SELECT * FROM mech_levels WHERE account_id=? AND mech_type=1',[id]);
  assert.equal(Number(record.exp),1200);assert.equal(record.level,2);assert.equal(record.wins,1);assert.equal(record.kills,10);
  assert.equal(Number(account.point),Number(before.point)+1500);assert.equal(Number(mech.exp),1200);assert.equal(mech.level,2);
  const invalid={...match,id:randomUUID(),players:[{...player,mech:9}]};
  await assert.rejects(settle(db.pool,invalid),/row missing/);
  const [[count]]=await db.pool.execute('SELECT COUNT(*) AS n FROM match_rewards WHERE account_id=?',[id]);assert.equal(Number(count.n),1);
  console.log('PASS: real MySQL commit, parallel duplicate suppression, level-up, currency and mech persistence, rejected invalid settlement');
 } finally {
  if(id)await db.pool.execute('DELETE FROM accounts WHERE id=?',[id]);
  await db.pool.end();
 }
})().catch(e=>{console.error(e.message);process.exitCode=1;});
