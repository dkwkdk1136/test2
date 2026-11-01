'use strict';
const config = require('../config/rewards.json');
for (const [key, value] of Object.entries(config)) {
    if (!Number.isFinite(value) || value < 0 || (key !== 'soloPveMultiplier' && !Number.isSafeInteger(value))) throw new Error(`Invalid rewards setting: ${key}`);
}
if (config.minimumSeconds < 1 || config.firstLevelXp < 1 || config.accountLevelCap < 1 || config.accountLevelCap > 100 || config.mechLevelCap < 1 || config.mechLevelCap > 100 || config.soloPveMultiplier > 1) throw new Error('Unsafe reward limits');
if (config.maximumXp > 2147483647 || config.maximumPoints > 2147483647 || config.maximumRecordedKills > 65535 || config.pvpGoalScore < 1 || config.pvpGoalScore > 65535 || config.maximumMinutes > 1440) throw new Error('Reward limits exceed protocol bounds');
function progress(total, cap = config.accountLevelCap) {
    let level=1, floor=0;
    total=Math.max(0,Math.min(Number(total)||0,Number.MAX_SAFE_INTEGER));
    while(level<cap) {const next=floor+config.firstLevelXp+config.levelXpStep*(level-1);if(total<next)break;floor=next;level++;}
    return {level,exp:total,floor,exp_max:level===cap?floor:floor+config.firstLevelXp+config.levelXpStep*(level-1)};
}
function calculate({seconds,outcome,kills=0,deaths=0,mode,players,left=false}) {
    if (!['win','loss','draw','abandoned'].includes(outcome) || !['pve','pvp'].includes(mode)) throw new Error('Invalid match result');
    const eligible=!left && seconds>=config.minimumSeconds && (mode==='pve'||players>=2);
    const k=Math.min(config.maximumRecordedKills,Math.max(0,Math.floor(Number(kills)||0)));
    const d=Math.min(config.maximumRecordedKills,Math.max(0,Math.floor(Number(deaths)||0)));
    if(!eligible)return {xp:0,points:0,kills:0,deaths:0,eligible:false};
    const minutes=Math.min(config.maximumMinutes,Math.floor(seconds/60));
    const multiplier=mode==='pve'&&players===1?config.soloPveMultiplier:1;
    const killXp=mode==='pve'?config.pveKillXp:config.killXp;
    const killPoints=mode==='pve'?config.pveKillPoints:config.killPoints;
    const killCap=mode==='pve'?config.pveMaximumRewardKills:config.maximumRewardKills;
    const bonus=outcome==='win'?'win':outcome==='draw'?'draw':null;
    return {eligible:true,kills:k,deaths:d,
        xp:Math.min(config.maximumXp,Math.floor(multiplier*(config.completionXp+minutes*config.xpPerMinute+(bonus?config[bonus+'Xp']:0)+Math.min(k,killCap)*killXp))),
        points:Math.min(config.maximumPoints,Math.floor(multiplier*(config.completionPoints+minutes*config.pointsPerMinute+(bonus?config[bonus+'Points']:0)+Math.min(k,killCap)*killPoints)))};
}
module.exports={config,progress,calculate};
