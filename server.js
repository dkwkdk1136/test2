const NetworkClient = require('./client.js');
const { createServer } = require('net');
const db = require('./database/db');
const rooms = require('./rooms');
const { leaveRoomAndNotify } = require('./dispatch/room/room-leave');
const { traceBattle } = require('./diagnostics/battle-network');
const DIAGNOSTIC_OPCODES = new Set([0x00222103, 0x00420114, 0x00222131, 0x00220234]);
let nextDiagnosticConnectionId = 1;

const SERVER_PORT = 9211;
const GAME_PORT = 30907;

class DispatchServer
{
    constructor(name, port, services)
    {
        this.name = name;
        this.port = port;
        this.server = createServer();
        this.services = services;
        this.clients = [];

        this.server.on('connection', (socket) => this.onConnection(socket));
    }

    start()
    {
        this.server.listen(this.port, '0.0.0.0', () => {
            console.log(`[${this.name}] Listening on port: ${this.port}`);
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
    require('./config/server').load();
    require('./config/whitelist').initialize();
    await db.verifyConnection();
    const dispatch = new DispatchServer('DispatchServer', SERVER_PORT, require('./dispatch.js'));
    const game = new DispatchServer('GameServer', GAME_PORT, require('./game.js'));
    rooms.registerLobbyClientSource(game.clients);
    dispatch.start();
    game.start();
}

if (require.main === module) {
    start().catch(err => {
        console.error('[Server] Startup failed:', err.message);
        db.pool.end().finally(() => { process.exitCode = 1; });
    });
}

module.exports = { DispatchServer, start };
