const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const tls = require('node:tls');
const { once } = require('node:events');
const { startBridge } = require('../client-tls/bridge');
const { POLICY, loadServerTransport } = require('../security/tls-transport');
const root = process.env.MRO_TLS_TEST_FIXTURES;
if (!root) throw new Error('Set MRO_TLS_TEST_FIXTURES to generated valid/untrusted/expired test certificate folders');
const fixture = (group, name) => fs.readFileSync(path.join(root, group, name));

async function echo(group = 'valid') {
    const sockets = new Set(), state = { bytes: 0, cipher: null };
    const server = tls.createServer({ ...POLICY, key: fixture(group,'server.key'), cert: fixture(group,'server.crt'), handshakeTimeout:1000 }, socket => {
        state.cipher = socket.getCipher().standardName;
        socket.on('data', chunk => { state.bytes += chunk.length; socket.write(chunk); });
    });
    server.on('connection', socket => { sockets.add(socket);socket.on('close',()=>sockets.delete(socket)); });
    server.on('tlsClientError', ()=>{});
    server.listen(0,'127.0.0.1');await once(server,'listening');
    return { server, state, port:server.address().port, close:async()=>{ for(const s of sockets)s.destroy();await new Promise(r=>server.close(r)); } };
}
function config(port, overrides={}) { return { host:'127.0.0.1', serverName:'tls-test.invalid', ca:fixture('valid','ca.crt'), authPort:port,gamePort:port,...overrides }; }
async function rejected(port) {
    const socket=net.createConnection({host:'127.0.0.1',port});
    socket.on('error',()=>{});
    let timedOut = false;
    const timer=setTimeout(()=>{timedOut=true;socket.destroy(new Error('test timeout'));},2500);
    try {
        await once(socket,'connect');
        let received=0;socket.on('data',b=>received+=b.length);
        socket.write('credentials-must-not-leak');
        await new Promise(resolve=>socket.once('close',resolve));
        assert.equal(timedOut,false,'peer must reject, not merely time out');
        assert.equal(received,0);
    } finally {clearTimeout(timer);socket.destroy();}
}

test('both bridge channels preserve bytes and negotiate TLS 1.3 AES-256-GCM', {timeout:10000}, async()=>{
    const remote=await echo();let bridge;
    try {
        bridge=await startBridge(config(remote.port),{localPorts:[0,0],log:()=>{}});
        for(const listener of bridge.servers) {
            assert.equal(listener.address().address,'127.0.0.1');
            const socket=net.createConnection({host:'127.0.0.1',port:listener.address().port});
            const payload=Buffer.alloc(128*1024,0xa5),chunks=[];
            await new Promise((resolve,reject)=>{
                socket.on('error',reject);socket.setTimeout(3000,()=>reject(new Error('echo timeout')));
                socket.on('connect',()=>socket.write(payload));
                socket.on('data',data=>{chunks.push(data);if(Buffer.concat(chunks).length===payload.length)resolve();});
            });
            assert.deepEqual(Buffer.concat(chunks),payload);socket.destroy();
        }
        assert.equal(remote.state.cipher,'TLS_AES_256_GCM_SHA384');
        assert.equal(remote.state.bytes,256*1024);
    } finally {if(bridge)await bridge.close();await remote.close();}
});

for (const mode of ['untrusted CA','wrong hostname','expired certificate']) {
    test(`${mode} rejects before forwarding any credential bytes`,{timeout:10000},async()=>{
        const group=mode==='expired certificate'?'expired':'valid';
        const remote=await echo(group);let bridge;
        try {
            const overrides=mode==='untrusted CA'?{ca:fixture('untrusted','ca.crt')}:mode==='wrong hostname'?{serverName:'wrong.invalid'}:{ca:fixture('expired','ca.crt')};
            bridge=await startBridge(config(remote.port,overrides),{localPorts:[0,0],log:()=>{}});
            await rejected(bridge.servers[0].address().port);
            assert.equal(remote.state.bytes,0);
        } finally {if(bridge)await bridge.close();await remote.close();}
    });
}

test('TLS endpoint rejects a plaintext game connection', {timeout:10000}, async()=>{
    const remote=await echo();
    try { await rejected(remote.port);assert.equal(remote.state.bytes,0); } finally {await remote.close();}
});

test('TLS 1.2 clients are rejected', {timeout:10000}, async()=>{
    const remote=await echo();
    try {
        const socket=tls.connect({host:'127.0.0.1',port:remote.port,servername:'tls-test.invalid',ca:fixture('valid','ca.crt'),minVersion:'TLSv1.2',maxVersion:'TLSv1.2'});
        const error=await new Promise((resolve,reject)=>{socket.once('error',resolve);socket.once('secureConnect',()=>reject(new Error('Unexpected TLS 1.2 success')));});
        assert.match(error.code,/SSL.*PROTOCOL_VERSION|SSL.*UNSUPPORTED_PROTOCOL/);
        socket.destroy();assert.equal(remote.state.bytes,0);
    } finally {await remote.close();}
});

test('port collision is reported instead of silently moving local ports', {timeout:10000}, async()=>{
    const blocker=net.createServer();blocker.listen(0,'127.0.0.1');await once(blocker,'listening');
    try {await assert.rejects(startBridge(config(19211),{localPorts:[0,blocker.address().port],log:()=>{}}),e=>e.code==='EADDRINUSE');}
    finally {await new Promise(r=>blocker.close(r));}
});

test('TLS settings fail closed on invalid flags, ports and keys',()=>{
    assert.equal(loadServerTransport({},root).enabled,false);
    assert.throws(()=>loadServerTransport({tls:{enabled:'true'}},root));
    assert.throws(()=>loadServerTransport({tls:{enabled:true,authPort:9211,gamePort:40907}},root));
    assert.throws(()=>loadServerTransport({tls:{enabled:true,keyFile:'missing',certFile:'missing'}},root));
    assert.throws(()=>loadServerTransport({tls:{enabled:true,keyFile:'valid/server.key',certFile:'untrusted/server.crt'}},root));
    const result=loadServerTransport({tls:{enabled:true,keyFile:'valid/server.key',certFile:'valid/server.crt'}},root);
    assert.equal(result.authPort,19211);assert.equal(result.gamePort,40907);
});
