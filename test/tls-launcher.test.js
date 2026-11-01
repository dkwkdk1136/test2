const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { launchGame } = require('../client-tls/launch');
const config = { authPort:19211, gamePort:40907 };

function fixture() {
    const events=[],child=new EventEmitter();
    const dependencies={
        exists:()=>true,log:()=>{},
        startBridge:async()=>{events.push('bridge-start');return {close:async()=>events.push('bridge-close')};},
        verifyEndpoint:async(c,p)=>events.push('verified-'+p),
        spawn:(exe,args,options)=>{events.push('game-start');assert.match(exe,/MetalRage\.exe$/);assert.equal(args[0],'-globalid=TW&ip=127.0.0.1&port=9211&age=30');assert.equal(options.shell,false);assert.equal(options.windowsHide,false);return child;}
    };
    return {events,child,dependencies};
}

test('automatic bridge starts and both channels verify before game; cleanup waits for game exit', async()=>{
    const f=fixture();const running=launchGame(config,'C:/test/data/System',f.dependencies);
    await new Promise(setImmediate);
    assert.deepEqual(f.events,['bridge-start','verified-19211','verified-40907','game-start']);
    f.child.emit('exit',0,null);await running;
    assert.equal(f.events.at(-1),'bridge-close');
});
test('missing game never starts a bridge',async()=>{
    const f=fixture();f.dependencies.exists=()=>false;
    await assert.rejects(launchGame(config,'missing',f.dependencies),/not found/);assert.deepEqual(f.events,[]);
});
test('port collision never launches game or stops an existing bridge',async()=>{
    const f=fixture();f.dependencies.startBridge=async()=>{throw Object.assign(new Error('busy'),{code:'EADDRINUSE'});};
    await assert.rejects(launchGame(config,'test',f.dependencies),e=>e.code==='EADDRINUSE');assert.deepEqual(f.events,[]);
});
test('certificate failure closes owned bridge without launching game',async()=>{
    const f=fixture();f.dependencies.verifyEndpoint=async()=>{throw new Error('certificate rejected');};
    await assert.rejects(launchGame(config,'test',f.dependencies),/certificate rejected/);
    assert.deepEqual(f.events,['bridge-start','bridge-close']);
});
test('spawn failure releases bridge',async()=>{
    const f=fixture();const running=launchGame(config,'test',f.dependencies);await new Promise(setImmediate);
    f.child.emit('error',new Error('spawn denied'));await assert.rejects(running,/spawn denied/);assert.equal(f.events.at(-1),'bridge-close');
});
test('game crash releases bridge and reports failure',async()=>{
    const f=fixture();const running=launchGame(config,'test',f.dependencies);await new Promise(setImmediate);
    f.child.emit('exit',1,null);await assert.rejects(running,/code 1/);assert.equal(f.events.at(-1),'bridge-close');
});
