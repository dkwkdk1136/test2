'use strict';
const {randomUUID}=require('crypto'),fs=require('fs'),path=require('path');
const {config,calculate}=require('./policy');
const store=require('./store');
const pendingDir=path.join(__dirname,'../private-state/pending-rewards');
function participant(member,now) {
    return {id:Number(member.accountId),team:Number(member.team)||0,mech:Math.max(1,Math.min(8,Number(member.client?.currentHangarSlot_)||1)),joined:now,kills:0,deaths:0,left:false};
}
function start(room,now=Date.now()) {
    if(room.rewardMatch&&!room.rewardMatch.ended)return room.rewardMatch;
    const mode=room.campaign?'pve':'pvp';
    const match={id:randomUUID(),mode,started:now,players:new Map([...room.members.values()].map(m=>[Number(m.accountId),participant(m,now)])),dead:new Set(),lastDeath:new Map(),ended:false};
    room.rewardMatch=match;
    if(mode==='pvp') {
        const minutes=Math.max(1,Math.min(60,Number(room.playTime)||10));
        match.timer=setTimeout(()=>{if(room.rewardMatch===match&&!match.ended)void endPvp(room,scoreWinner(room),'time-limit');},minutes*60000);
        match.timer.unref?.();
    }
    return match;
}
function join(room,member) {const m=room.rewardMatch;if(m&&!m.ended&&!m.players.has(Number(member.accountId)))m.players.set(Number(member.accountId),participant(member,Date.now()));}
function leave(room,id) {const m=room?.rewardMatch;if(m&&!m.ended&&m.players.has(Number(id)))m.players.get(Number(id)).left=true;}
function death(room,attacker,victim,now=Date.now()) {
    const m=room?.rewardMatch;if(!m||m.ended)return false;
    if(now-(m.lastDeath.get(victim)||0)<1000||m.dead.has(victim))return false;
    if(m.lastDeath.size>1024)for(const [id,time] of m.lastDeath)if(now-time>1000)m.lastDeath.delete(id);
    m.lastDeath.set(victim,now);
    const a=m.players.get(attacker),v=m.players.get(victim);
    if(v){m.dead.add(victim);v.deaths=Math.min(config.maximumRecordedKills,v.deaths+1);}
    if(a&&!a.left&&attacker!==victim&&(m.mode==='pve'||(v&&v.team!==a.team)))a.kills=Math.min(config.maximumRecordedKills,a.kills+1);
    return true;
}
function respawn(room,id) {room?.rewardMatch?.dead.delete(Number(id));}
function abort(room) {
 const m=room?.rewardMatch;if(!m||m.ended)return;
 for(const p of m.players.values())p.left=true;
 void finish(room,null,'interrupted').catch(e=>console.error('[Rewards] Interrupted settlement:',e.message));
}
function scoreWinner(room) {const s=room.teamScores||[0,0];return s[0]===s[1]?null:s[0]>s[1]?0:1;}
function snapshot(room,winner,reason,now) {
    const m=room.rewardMatch;
    const players=[...m.players.values()].map(p=>{
        const seconds=Math.max(0,Math.min(86400,Math.floor((now-p.joined)/1000)));
        const outcome=p.left?'abandoned':winner===null?'draw':(m.mode==='pve'?(winner===0):(p.team===winner))?'win':'loss';
        return {...p,seconds,outcome,reward:calculate({seconds,outcome,kills:p.kills,deaths:p.deaths,mode:m.mode,players:m.mode==='pvp'&&new Set([...m.players.values()].map(x=>x.team)).size<2?1:m.players.size,left:p.left||!!room.options?.training})};
    });
    return {id:m.id,mode:m.mode,reason,winner,seconds:Math.floor((now-m.started)/1000),scores:room.teamScores||[0,0],players};
}
async function persist(data,room) {
    fs.mkdirSync(pendingDir,{recursive:true});const file=path.join(pendingDir,data.id+'.json');
    const temp=file+'.tmp';fs.writeFileSync(temp,JSON.stringify(data));fs.renameSync(temp,file);
    try {
        const results=await store.settle(require('../database/db').pool,data);
        fs.unlinkSync(file);
        for(const result of results) {
            const client=room?.members.get(result.player.id)?.client;
            if(client)try{result.mechs=await require('../database/db').getMechLevels(result.player.id);require('./sender').send(client,result);}catch(e){console.error('[Rewards] notification failed; saved rewards will load at login:',e.message);}
            console.log(`[Rewards] match=${data.id} account=${result.player.id} outcome=${result.player.outcome} xp=${result.player.reward.xp} points=${result.player.reward.points}`);
        }
        return results;
    } catch(e) {console.error(`[Rewards] Pending settlement ${data.id}; retry at next server start: ${e.message}`);return [];}
}
function finish(room,winner,reason='normal',now=Date.now()) {
    const m=room?.rewardMatch;if(!m)return Promise.resolve([]);
    if(m.promise)return m.promise;
    m.ended=true;m.settling=true;clearTimeout(m.timer);
    m.result=snapshot(room,winner,reason,now);
    m.promise=persist(m.result,room).then(results=>{
        m.persisted=results.length>0;
        for(const result of results) {
            const player=m.result.players.find(p=>p.id===result.player.id);
            if(player)player.reward=result.player.reward;
        }
        return results;
    }).finally(()=>{m.settling=false;});
    return m.promise;
}
async function endPvp(room,winner,reason) {
    if(!room?.rewardMatch||room.rewardMatch.ended||room.state!=='playing')return;
    try {
        await finish(room,winner,reason);
        const rooms=require('../rooms');
        rooms.sendAll(room.id,client=>{const [msg,b]=client.getMessageBuffer(0x00222213,0x1e);b.writeUInt16LE(winner===null?2:winner,0);b.writeUInt16LE(1,0x10);return msg;});
        sendScore(room);
        room.state='lobby';room.battleStartGen=(room.battleStartGen||0)+1;
        for(const member of room.members.values()){member.ready=false;if(member.client)member.client.gameStarted_=false;}
        const buffer=(type,size)=>{const msg=Buffer.alloc(16+size);msg.writeUInt16BE(msg.length,6);msg.writeUInt32BE(type,12);return [msg,msg.subarray(16)];};
        for(const member of room.members.values())rooms.sendAll(room.id,()=>{
            const [msg,b]=buffer(0x00220401,8);b[1]=1;b.writeUInt16LE(member.accountId,2);b.writeUInt32LE(1,4);return msg;
        });
        require('../dispatch/room/room-list.sender').broadcastRoomListChange(rooms.getLobbyClients(),room,2,buffer);
    } catch(e) {console.error('[Rewards] Match end failed:',e.message);}
}
function sendScore(room) {
    const m=room?.rewardMatch;
    if(!m?.result||!m.persisted)return;
    for(const member of room.members.values())if(member.client) {
        try{require('./sender').sendScore(member.client,m.result);}catch(e){console.error('[Rewards] Score display failed:',e.message);}
    }
}
async function recover(pool) {
    await store.assertReady(pool);
    if(!fs.existsSync(pendingDir))return;
    for(const file of fs.readdirSync(pendingDir).filter(x=>x.endsWith('.json'))) {
        const full=path.join(pendingDir,file);const data=JSON.parse(fs.readFileSync(full,'utf8'));
        await store.settle(pool,data);fs.unlinkSync(full);console.log('[Rewards] Recovered '+data.id);
    }
}
module.exports={start,join,leave,abort,death,respawn,finish,endPvp,scoreWinner,snapshot,recover,sendScore};
