'use strict';
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const tls = require('node:tls');
const POLICY = Object.freeze({ minVersion: 'TLSv1.3', maxVersion: 'TLSv1.3', ciphers: 'TLS_AES_256_GCM_SHA384' });

function loadConfig(filename) {
    const settings = JSON.parse(fs.readFileSync(filename, 'utf8'));
    if (typeof settings.host !== 'string' || !/^[A-Za-z0-9.-]+$/.test(settings.host)) throw new Error('host must be an IPv4 address or DNS hostname');
    if (typeof settings.serverName !== 'string' || !/^[A-Za-z0-9.-]+$/.test(settings.serverName) || net.isIP(settings.serverName)) {
        throw new Error('serverName must be the DNS name in the certificate');
    }
    if (typeof settings.caFile !== 'string' || !settings.caFile) throw new Error('caFile is required');
    for (const name of ['authPort', 'gamePort']) {
        if (!Number.isInteger(settings[name]) || settings[name] < 1 || settings[name] > 65535) throw new Error(`Invalid ${name}`);
    }
    if (settings.authPort === settings.gamePort || [settings.authPort, settings.gamePort].some(p => [9211,30907].includes(p))) throw new Error('Use distinct remote TLS ports, not the local bridge ports');
    return {
        host: settings.host, serverName: settings.serverName,
        authPort: settings.authPort, gamePort: settings.gamePort,
        ca: fs.readFileSync(path.resolve(path.dirname(filename), settings.caFile)),
    };
}

async function startBridge(config, { localPorts = [9211, 30907], log = console.log } = {}) {
    const servers = [], sockets = new Set();
    let closing = false;
    async function close() {
        if (closing) return;
        closing = true;
        for (const socket of sockets) socket.destroy();
        await Promise.all(servers.filter(server => server.listening).map(server => new Promise(resolve => server.close(resolve))));
    }
    try {
        for (const [index, remotePort] of [config.authPort, config.gamePort].entries()) {
            const server = net.createServer({ pauseOnConnect: true }, local => {
                sockets.add(local);
                const remote = tls.connect({
                    ...POLICY, host: config.host, port: remotePort,
                    servername: config.serverName, ca: config.ca,
                    rejectUnauthorized: true,
                });
                sockets.add(remote);
                const timeout = setTimeout(() => remote.destroy(new Error('TLS handshake timeout')), 10000);
                const destroy = () => { clearTimeout(timeout); local.destroy(); remote.destroy(); };
                local.on('error', destroy);
                remote.on('error', err => { log(`[TLS] Connection rejected: ${err.code || 'handshake/transport failure'}`); destroy(); });
                local.on('close', () => { sockets.delete(local); remote.destroy(); clearTimeout(timeout); });
                remote.on('close', () => { sockets.delete(remote); local.destroy(); clearTimeout(timeout); });
                remote.once('secureConnect', () => {
                    clearTimeout(timeout);
                    if (!remote.authorized || remote.getProtocol() !== 'TLSv1.3' || remote.getCipher().standardName !== 'TLS_AES_256_GCM_SHA384') {
                        destroy(); return;
                    }
                    log(`[TLS] Verified ${config.serverName}:${remotePort}; TLSv1.3 AES-256-GCM`);
                    // No game bytes are forwarded until trust, hostname and cipher checks succeed.
                    local.pipe(remote); remote.pipe(local); local.resume();
                });
            });
            servers.push(server);
            server.maxConnections = 128;
            await new Promise((resolve, reject) => {
                server.once('error', reject);
                server.listen(localPorts[index], '127.0.0.1', () => { server.removeListener('error', reject); resolve(); });
            });
            server.on('error', err => { log(`[TLS] Listener failed: ${err.code}`); void close(); });
            log(`[TLS] Local 127.0.0.1:${server.address().port} -> ${config.host}:${remotePort}`);
        }
    } catch (err) { await close(); throw err; }
    return { servers, close };
}

if (require.main === module) {
    const filename = path.resolve(process.argv[2] || path.join(__dirname, 'bridge.json'));
    Promise.resolve().then(() => loadConfig(filename)).then(config => startBridge(config)).then(bridge => {
        process.once('SIGINT', () => { void bridge.close(); });
        process.once('SIGTERM', () => { void bridge.close(); });
    }).catch(err => { console.error(`[TLS] Startup failed: ${err.message}`); process.exitCode = 1; });
}
module.exports = { loadConfig, startBridge, POLICY };
