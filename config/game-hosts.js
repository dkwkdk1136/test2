'use strict';

const { isIPv4 } = require('net');

function normalizeIpv4(value) {
    const address = String(value || '').trim().replace(/^::ffff:/i, '');
    return address === '::1' ? '127.0.0.1' : address;
}

function isLoopback(address) { return normalizeIpv4(address).startsWith('127.'); }

function isUsableAddress(address) {
    if (!isIPv4(address)) return false;
    const first = Number(address.split('.')[0]);
    return first > 0 && first < 224;
}

function validatePort(port) {
    return Number.isInteger(port) && port >= 1 && port <= 65535;
}

// This is separate from publicHost, which advertises the Node login/lobby server.
// Keys are login usernames, not in-game nicknames. Private VPN addresses are valid.
function validateGameHosts(value) {
    if (value == null) return Object.create(null);
    if (typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('config/server.json: gameHosts must be an object keyed by login username');
    }
    const result = Object.create(null);
    for (const [username, endpoint] of Object.entries(value)) {
        const key = username.trim().toLowerCase();
        if (!key || Object.hasOwn(result, key)) {
            throw new Error('config/server.json: gameHosts contains an empty or duplicate username');
        }
        if (!endpoint || typeof endpoint !== 'object' || Array.isArray(endpoint) ||
            !isUsableAddress(endpoint.address) || isLoopback(endpoint.address)) {
            throw new Error(`config/server.json: gameHosts.${username}.address must be a non-loopback unicast IPv4 address`);
        }
        if (endpoint.port !== undefined && !validatePort(endpoint.port)) {
            throw new Error(`config/server.json: gameHosts.${username}.port must be an integer from 1 to 65535`);
        }
        result[key] = { address: endpoint.address, port: endpoint.port };
    }
    return result;
}

// authorizedAddress must come from whitelist.getHostAddress. An endpoint override
// changes routing only; it must never grant permission to a denied host.
function resolveGameHost(settings, username, authorizedAddress, reportedPort) {
    const observedAddress = normalizeIpv4(authorizedAddress);
    if (!isUsableAddress(observedAddress)) return null;
    if (reportedPort !== undefined && !validatePort(reportedPort)) {
        throw new Error(`host reported invalid listen port ${reportedPort}`);
    }
    const key = String(username || '').trim().toLowerCase();
    const override = Object.hasOwn(settings.gameHosts || {}, key) ? settings.gameHosts[key] : null;
    return {
        address: override ? override.address : observedAddress,
        port: reportedPort === undefined ? undefined : (override?.port ?? reportedPort),
        reportedPort,
        observedAddress,
        source: override ? 'configured' : 'connection',
    };
}

function peerAddressProblem(endpoint, peerAddress) {
    if (isLoopback(endpoint.address) && !isLoopback(peerAddress)) {
        return 'loopback host address cannot be used by a remote player; configure gameHosts for the host login';
    }
    return null;
}

module.exports = { validateGameHosts, resolveGameHost, peerAddressProblem };
