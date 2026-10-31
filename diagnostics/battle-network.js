'use strict';

const rooms = require('../rooms');

// Log only connection metadata and selected handshake fields, never packet bodies,
// login tokens, passwords or database configuration. No timers or network probes.
function traceBattle(event, client, details = {}) {
    const account = Number(client?.accountIndex_ || client?.accountId_) || null;
    const room = account == null ? null : rooms.getRoomByAccount(account);
    const socket = client?.socket_;
    console.log('[battle-debug] ' + JSON.stringify({
        timestamp: new Date().toISOString(),
        event,
        connection: client?.diagnosticConnectionId_ ?? null,
        account,
        room: room?.id ?? null,
        generation: room?.battleStartGen ?? null,
        state: room?.state ?? null,
        host: room?.hostAccountId ?? null,
        role: room ? (room.hostAccountId === account ? 'host' : 'guest') : null,
        map: room?.mapId ?? null,
        elapsedMs: room?.battleStartedAt == null ? null : Math.max(0, Date.now() - room.battleStartedAt),
        remoteAddress: socket?.remoteAddress ?? null,
        remotePort: socket?.remotePort ?? null,
        localAddress: socket?.localAddress ?? null,
        localPort: socket?.localPort ?? null,
        advertised: room?.battleEndpoint ? `${room.battleEndpoint.address}:${room.battleEndpoint.port}` : null,
        ...details,
    }));
}

module.exports = { traceBattle };
