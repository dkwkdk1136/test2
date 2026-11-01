const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseLogin, authenticate, allowAttempt } = require('../auth/accounts');
const { hashDigest, verifyDigest, passwordDigest } = require('../auth/passwords');

function packet(name, digest = passwordDigest('TestPass123')) {
    const body = Buffer.alloc(0x381);
    body.write(name, 0, 'ascii');body.write(digest, 0x65, 'ascii');
    return body;
}

test('original client layout separates 101-byte ID from MD5 at offset 0x65', () => {
    assert.equal(parseLogin(packet('Player123')).register, false);
    const result = parseLogin(packet('!REG!Player123'));
    assert.equal(result.username, 'Player123');assert.equal(result.register, true);
    assert.equal(result.digest, passwordDigest('TestPass123'));
});

test('malformed packets, empty passwords and overlong IDs cannot authenticate', () => {
    for (const body of [Buffer.alloc(4),packet('!REG!x'),packet('a'.repeat(26)),packet('User1','d41d8cd98f00b204e9800998ecf8427e'),packet('User1','z'.repeat(32))]) {
        assert.throws(() => parseLogin(body));
    }
    const high = packet('User123');high[0] = 0xc1;assert.throws(() => parseLogin(high));
    const noNull = packet('User123');noNull.fill(65, 0, 101);assert.throws(() => parseLogin(noNull));
});

test('salted scrypt validates only the original digest', async () => {
    const digest = passwordDigest('TestPass123');
    const a = await hashDigest(digest), b = await hashDigest(digest);
    assert.notEqual(a,b);assert.ok(!a.includes(digest));
    assert.equal(await verifyDigest(digest.toUpperCase(),a),true);
    assert.equal(await verifyDigest(passwordDigest('WrongPass123'),a),false);
    assert.equal(await verifyDigest(digest,'corrupt'),false);
});

test('signup is explicit, duplicate/legacy accounts are never claimed, login requires password', async () => {
    const users=new Map(), credentials=new Map();let nextId=1,creates=0;
    const db={
        getAccountByUsername:async name=>users.get(name)||null,
        getAccountById:async id=>[...users.values()].find(a=>a.id===id),
        createAccount:async (username,nickname,pilot,hash)=>{
            creates++;const account={id:nextId++,username,nickname,pilot};users.set(username,account);credentials.set(account.id,hash);return account.id;
        },
        pool:{execute:async (sql,[id])=>[credentials.has(id)?[{password_hash:credentials.get(id)}]:[]]}
    };
    assert.equal(await authenticate(db,parseLogin(packet('NewUser')),'test-signup'),null);
    assert.equal(creates,0);
    const account=await authenticate(db,parseLogin(packet('!REG!NewUser')),'test-signup');
    assert.equal(account.username,'NewUser');assert.equal(creates,1);
    assert.equal(await authenticate(db,parseLogin(packet('!REG!NewUser')),'test-signup'),null);
    assert.equal(await authenticate(db,parseLogin(packet('NewUser',passwordDigest('WrongPass123'))),'test-signup'),null);
    assert.equal((await authenticate(db,parseLogin(packet('NewUser')),'test-signup')).id,account.id);
    users.set('LegacyUser',{id:9,username:'LegacyUser'});
    assert.equal(await authenticate(db,parseLogin(packet('!REG!LegacyUser')),'test-signup'),null);
    assert.equal(await authenticate(db,parseLogin(packet('LegacyUser')),'test-signup'),null);
});

test('concurrent duplicate signup fails closed', async () => {
    const db={getAccountByUsername:async()=>null,createAccount:async()=>{const e=new Error();e.code='ER_DUP_ENTRY';throw e;}};
    assert.equal(await authenticate(db,parseLogin(packet('!REG!RaceUser')),'test-race'),null);
});

test('attempt limit survives reconnections and expires after one minute', () => {
    const now=Date.now();for(let i=0;i<10;i++)assert.equal(allowAttempt('test-limit',now),true);
    assert.equal(allowAttempt('test-limit',now),false);
    assert.equal(allowAttempt('test-limit',now+60001),true);
});
