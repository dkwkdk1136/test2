'use strict';
const fs=require('fs'),path=require('path');
const {progress,config}=require('./policy');
async function migrate(pool) {await pool.query(fs.readFileSync(path.join(__dirname,'../database/rewards-schema.sql'),'utf8'));}
async function assertReady(pool) {await pool.query('SELECT match_id FROM match_rewards LIMIT 0');}
async function settle(pool,match) {
    const conn=await pool.getConnection();const result=[];
    try {
        await conn.beginTransaction();
        for(const player of [...match.players].sort((a,b)=>a.id-b.id)) {
            const [[account]]=await conn.execute('SELECT id, point, coupon FROM accounts WHERE id=? FOR UPDATE',[player.id]);
            if(!account)throw new Error('Match account missing');
            const [prior]=await conn.execute('SELECT match_id FROM match_rewards WHERE match_id=? AND account_id=?',[match.id,player.id]);
            if(prior.length)continue;
            const [[record]]=await conn.execute('SELECT * FROM records WHERE account_id=? FOR UPDATE',[player.id]);
            const [[mech]]=await conn.execute('SELECT * FROM mech_levels WHERE account_id=? AND mech_type=? FOR UPDATE',[player.id,player.mech]);
            if(!record||!mech)throw new Error('Match progression row missing');
            const r=player.reward;
            const user=progress(Number(record.exp)+r.xp), unit=progress(Number(mech.exp)+r.xp,config.mechLevelCap);
            const points=Math.min(2147483647,Number(account.point)+r.points);
            const increment=key=>Math.min(4294967295,Number(record[key])+(r.eligible&&player.outcome===({wins:'win',losses:'loss',draws:'draw'}[key])?1:0));
            const stats={...record,...user,wins:increment('wins'),losses:increment('losses'),draws:increment('draws'),kills:Math.min(4294967295,Number(record.kills)+r.kills),deaths:Math.min(4294967295,Number(record.deaths)+r.deaths),point:points,coupon:account.coupon};
            // A single transaction covers receipt, currency and both progression rows.
            await conn.execute('INSERT INTO match_rewards (match_id,account_id,policy_version,mode,outcome,duration_seconds,mech_type,xp,points,kills,deaths,eligible) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',[match.id,player.id,config.version,match.mode,player.outcome,player.seconds,player.mech,r.xp,points-Number(account.point),r.kills,r.deaths,Number(r.eligible)]);
            await conn.execute('UPDATE accounts SET point=? WHERE id=?',[points,player.id]);
            await conn.execute('UPDATE records SET level=?,exp=?,exp_max=?,wins=?,losses=?,draws=?,kills=?,deaths=? WHERE account_id=?',[user.level,user.exp,user.exp_max,stats.wins,stats.losses,stats.draws,stats.kills,stats.deaths,player.id]);
            const unitStats={...mech,...unit,kills:Math.min(4294967295,Number(mech.kills)+r.kills),deaths:Math.min(4294967295,Number(mech.deaths)+r.deaths),sorties:Math.min(4294967295,Number(mech.sorties)+(r.eligible?1:0))};
            await conn.execute('UPDATE mech_levels SET level=?,exp=?,kills=?,deaths=?,sorties=? WHERE account_id=? AND mech_type=?',[unit.level,unit.exp,unitStats.kills,unitStats.deaths,unitStats.sorties,player.id,player.mech]);
            result.push({player:{...player,reward:{...r,points:points-Number(account.point)}},record:stats,mech:unitStats,levelUp:user.level>record.level});
        }
        await conn.commit();return result;
    } catch(e) {await conn.rollback();throw e;} finally {conn.release();}
}
module.exports={migrate,assertReady,settle};
if(require.main===module) {const {pool}=require('../database/db');migrate(pool).then(()=>console.log('[Rewards] Schema ready')).catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>pool.end());}
