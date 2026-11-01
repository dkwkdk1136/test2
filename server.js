const NetworkClient = require('./client.js');
const { createServer } = require('net');
const tls = require('node:tls');
const { loadServerTransport } = require('./security/tls-transport');
const db = require('./database/db');
const rooms = require('./rooms');
const { leaveRoomAndNotify } = require('./dispatch/room/room-leave');
const { traceBattle } = require('./diagnostics/battle-network');
const DIAGNOSTIC_OPCODES = new Set([0x00222103, 0x00420114, 0x00222131, 0x00220234]);
let nextDiagnosticConnectionId = 1;

class DispatchServer
{
    constructor(name, port, services, tlsOptions = null)
    {
        this.name = name;
        this.port = port;
        this.server = tlsOptions ? tls.createServer(tlsOptions) : createServer();
        this.services = services;
        this.clients = [];

        this.server.on(tlsOptions ? 'secureConnection' : 'connection', (socket) => this.onConnection(socket));
        if (tlsOptions) this.server.on('tlsClientError', err => console.warn(`[${name}] TLS handshake rejected: ${err.code || 'invalid handshake'}`));
    }

    start()
    {
        return new Promise((resolve, reject) => {
            this.server.once('error', reject);
            this.server.listen(this.port, '0.0.0.0', () => {
                this.server.removeListener('error', reject);
                console.log(`[${this.name}] Listening on port: ${this.port}`);
                resolve();
            });
        });
    }

    onConnection(socket)
    {
        console.log(`[${this.name}] New connection from ${socket.remoteAddress}:${socket.remotePort}`);
        let pending = Promise.resolve();
        const client = new NetworkClient(socket, (client, type, data) => {
            pending = pending.then(async () => {
                if (socket.destroyed || socket.writableEnded) return;
                client.diagnosticLastPacketAt_ = Date.now();
                client.diagnosticLastOpcode_ = `0x${type.toString(16).padStart(8, '0')}`;
                if (this.name === 'DispatchServer' && !client.accountId_ && type !== 0x00110151) {
                    client.disconnect();
                    return;
                }
                if (this.name === 'GameServer' && !client.accountId_ && type !== 0x00110124) {
                    client.disconnect();
                    return;
                }
                if (this.name === 'GameServer' && DIAGNOSTIC_OPCODES.has(type)) {
                    traceBattle('packet-received', client, { opcode: client.diagnosticLastOpcode_, bytes: data.length });
                }
                for (const service of this.services) {
                    if (await service.dispatch(client, type, data)) return;
                }
                console.log(`[${this.name}] Unhandled message type 0x${type.toString(16)}`);
            }).catch(err => {
                traceBattle('dispatch-error', client, { service: this.name, opcode: client.diagnosticLastOpcode_, errorType: err.name, errorCode: err.code ?? null });
                console.error(`[${this.name}] Dispatch error:`, err.message);
                socket.destroy();
            });
        });
        client.diagnosticConnectionId_ = nextDiagnosticConnectionId++;

        this.clients.push(client);

        socket.on('error', (err) => {
            if (client.accountId_) traceBattle('tcp-error', client, { errorCode: err.code ?? null });
            console.log(`[${this.name}] Socket error: ${err.code}`);
        });

        socket.on('end', () => {
            if (client.accountId_) traceBattle('tcp-peer-ended', client);
        });

        socket.on('close', (hadError) => {
            if (client.accountId_) traceBattle('tcp-closed', client, {
                hadError: !!hadError,
                lastOpcode: client.diagnosticLastOpcode_ ?? null,
                lastPacketAgoMs: client.diagnosticLastPacketAt_ == null ? null : Math.max(0, Date.now() - client.diagnosticLastPacketAt_),
            });
            const idx = this.clients.indexOf(client);
            if (idx !== -1) this.clients.splice(idx, 1);
            console.log(`[${this.name}] Connection closed (${this.clients.length} remaining)`);
            const room = rooms.getRoomByAccount(client.accountId_);
            if (room && room.members.get(client.accountId_)?.client === client) {
                leaveRoomAndNotify(client.accountId_);
            }
        });
    }
};

async function start()
{
    console.log(`[release] version=${require('./package.json').version} node=${process.version}`);
    const settings = require('./config/server').load();
    const transport = loadServerTransport(settings, __dirname);
    require('./config/whitelist').initialize();
    await db.verifyConnection();
    await require('./auth/accounts').assertReady(db);
    const dispatch = new DispatchServer('DispatchServer', transport.authPort, require('./dispatch.js'), transport.options);
    const game = new DispatchServer('GameServer', transport.gamePort, require('./game.js'), transport.options);
    rooms.registerLobbyClientSource(game.clients);
    try {
        await dispatch.start();
        await game.start();
    } catch (err) {
        for (const service of [dispatch, game]) {
            for (const client of service.clients) client.disconnect();
            if (service.server.listening) service.server.close();
        }
        throw err;
    }
    console.log(transport.enabled ? '[transport] TLS 1.3 AES-256-GCM only; game clients must use the local TLS bridge' : '[transport] Legacy TCP (not TLS)');
}

if (require.main === module) {
    start().catch(err => {
        console.error('[Server] Startup failed:', err.message);
        db.pool.end().finally(() => { process.exitCode = 1; });
    });
}

module.exports = { DispatchServer, start };
