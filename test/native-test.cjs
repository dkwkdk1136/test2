const tls = require('tls'), fs = require('fs'), path = require('path');
const {spawn} = require('child_process');
const {once} = require('events');
(async () => {
  const root = process.env.MRO_TLS_TEST_FIXTURES;
  const servers = [], sockets = new Set();
  try {
    for (const [group, version] of [['valid','TLSv1.3'],['untrusted','TLSv1.3'],['expired','TLSv1.3'],['valid','TLSv1.2']]) {
      const s = tls.createServer({key:fs.readFileSync(path.join(root,group,'server.key')),cert:fs.readFileSync(path.join(root,group,'server.crt')),minVersion:version,maxVersion:version,ciphers:version==='TLSv1.3'?'TLS_AES_256_GCM_SHA384':'ECDHE-ECDSA-AES256-GCM-SHA384'}, c=>{c.on('error',()=>{});c.pipe(c);});
      s.on('connection',c=>{sockets.add(c);c.on('close',()=>sockets.delete(c));});
      s.on('tlsClientError',()=>{}); s.listen(0,'127.0.0.1');await once(s,'listening');servers.push(s);
    }
    const ports=servers.map(s=>String(s.address().port));
    const child=spawn(process.env.DOTNET_EXE || 'dotnet',[path.join(__dirname,'native/bin/Release/net8.0/NativeTests.dll'),...ports.slice(0,3),path.join(root,'valid/ca.crt'),path.join(root,'expired/ca.crt'),ports[3]],{stdio:'inherit',windowsHide:true});
    const timer=setTimeout(()=>child.kill(),30000);
    const [code]=await once(child,'exit');clearTimeout(timer);if(code!==0)throw Error('Native tests failed: '+code);
  } finally {for(const c of sockets)c.destroy();for(const s of servers)await new Promise(r=>s.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
