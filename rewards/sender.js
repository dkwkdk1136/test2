'use strict';
const {writeRecordInfoBody}=require('../dispatch/record-info.builder');
function send(client,result) {
    const {record:r,mech:m,levelUp}=result;
    // Verified ZDispatchRoom::Reward_Record_User_SN layout, 0x50 bytes.
    const [packet,b]=client.getMessageBuffer(0x00220412,0x50);
    b.writeUInt32LE(r.level,0);
    b.writeBigUInt64LE(BigInt(r.floor),4);
    b.writeBigUInt64LE(BigInt(r.exp_max),12);
    for(const [key,offset] of [['wins',0x14],['draws',0x18],['losses',0x1c],['kills',0x20],['deaths',0x24]])b.writeUInt32LE(r[key],offset);
    b.writeBigUInt64LE(BigInt(r.exp),0x38);
    b.writeBigUInt64LE(BigInt(r.point),0x40);
    b.writeBigUInt64LE(BigInt(r.coupon),0x48);

    const [info,body]=client.getMessageBuffer(0x00210103,0x60);writeRecordInfoBody(body,r);client.send(info);client.send(packet);
    // Login and reward mech records both use u8 count + 28-byte rows.
    const mechs=result.mechs||[m];
    const [mechMsg,mb]=client.getMessageBuffer(0x00210104,1+28*mechs.length);
    mb[0]=mechs.length;
    mechs.forEach((unit,i)=>{const o=1+28*i;mb.writeUInt32LE(unit.mech_type,o);mb.writeUInt32LE(unit.level,o+4);mb.writeBigUInt64LE(BigInt(unit.exp),o+8);mb.writeUInt32LE(unit.kills,o+16);mb.writeUInt32LE(unit.deaths,o+20);mb.writeUInt32LE(unit.sorties,o+24);});
    client.send(mechMsg);
    if(levelUp) {const [msg]=client.getMessageBuffer(0x00222231,0);client.send(msg);}
    client.point_=r.point;
}
function sendScore(client,match) {
    // ZDispatchRoom::User_Score_SN: 0x25-byte header + 0x3a-byte rows.
    const rows=match.players.filter(p=>!p.left).slice(0,16);
    const [packet,b]=client.getMessageBuffer(0x00222221,0x25+0x3a*rows.length);
    b.writeUInt16LE(match.winner===null?2:match.winner,0);
    b.writeUInt32LE(Math.min(86400,match.seconds),4);
    for(let team=0;team<2;team++) {const o=8+14*team;b.writeUInt16LE(team,o);b.writeUInt16LE(Math.min(65535,match.scores[team]||0),o+2);}
    b[0x24]=rows.length;
    rows.forEach((p,i)=>{const o=0x25+0x3a*i;b.writeUInt16LE(p.id&0xffff,o);b.writeUInt32LE(p.reward.xp,o+0x16);b.writeUInt32LE(p.reward.points,o+0x2a);});
    client.send(packet);
}
module.exports={send,sendScore};
