const { test } = require('node:test');
const assert = require('node:assert/strict');
const { handleLobbyLeave } = require('../dispatch/lobby-leave');
const rooms = require('../rooms');
function client(accountId_) {
    const sent=[];
    return { accountId_, sent, getMessageBuffer(type, size) {
        assert.ok([0x00220115,0x00220101,0x00220102].includes(type));
        const b=Buffer.alloc(16+size);b.writeUInt16BE(b.length,6);b.writeUInt32BE(type,12);
        return [b,b.subarray(16)];
    },send:b=>sent.push(b),disconnect:()=>assert.fail('must preserve session') };
}
test('lobby back receives exact success reply and preserves authenticated session',()=>{
    const c=client(7654321);
    assert.equal(handleLobbyLeave(c,0x00220114,Buffer.alloc(0)),true);
    assert.equal(c.sent.length,3);assert.equal(c.sent[0].length,22);
    assert.deepEqual(c.sent[0].subarray(16),Buffer.alloc(6));assert.equal(c.accountId_,7654321);
    assert.equal(c.sent[1].readUInt32BE(12),0x220101);
    assert.equal(c.sent[1].subarray(39,60).toString().split("\0")[0],"MO_Server_1");
    assert.equal(c.sent[2].readUInt32BE(12),0x220102);
    assert.equal(handleLobbyLeave(c,0x00220114,Buffer.alloc(0)),true);
});
test('invalid or unauthenticated leave gets an error instead of a stuck wait',()=>{
    for(const [id,body] of [[null,Buffer.alloc(0)],[7654321,Buffer.alloc(1)]]) {
        const c=client(id);assert.equal(handleLobbyLeave(c,0x00220114,body),true);
        assert.equal(c.sent[0].readUInt32LE(18),1);
    }
});
test('room member cannot leave lobby while bypassing room cleanup',()=>{
    const original=rooms.getRoomByAccount;
    try {rooms.getRoomByAccount=()=>({});const c=client(7654321);handleLobbyLeave(c,0x00220114,Buffer.alloc(0));assert.equal(c.sent[0].readUInt32LE(18),1);}
    finally {rooms.getRoomByAccount=original;}
});
test('unrelated packets are not consumed',()=>{
    const c=client(1);assert.equal(handleLobbyLeave(c,0x00220111,Buffer.alloc(0)),false);assert.equal(c.sent.length,0);
});
