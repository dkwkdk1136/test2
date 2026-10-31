'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { validateGameHosts, resolveGameHost, peerAddressProblem } = require('../config/game-hosts');

test('same-PC host advertises its configured public IP and client-reported port', () => {
    const settings = { publicHost: '198.51.100.10', gameHosts: validateGameHosts({
        Alice: { address: '203.0.113.20' },
    }) };
    const endpoint = resolveGameHost(settings, 'ALICE', '::ffff:127.0.0.1', 7777);
    assert.equal(endpoint.address, '203.0.113.20');
    assert.equal(endpoint.port, 7777);
    assert.equal(endpoint.source, 'configured');
    assert.equal(peerAddressProblem(endpoint, '198.51.100.25'), null);
});

test('separate server does not substitute its own IP for the game host', () => {
    const endpoint = resolveGameHost({ publicHost: '203.0.113.10' }, 'Alice', '::ffff:198.51.100.20', 7778);
    assert.equal(endpoint.address, '198.51.100.20');
    assert.equal(endpoint.port, 7778);
    assert.equal(endpoint.source, 'connection');
});

test('port mapping advertises the external port but retains the real host port', () => {
    const settings = { gameHosts: validateGameHosts({ alice: { address: '203.0.113.20', port: 40000 } }) };
    const endpoint = resolveGameHost(settings, 'alice', '192.168.1.10', 7777);
    assert.equal(endpoint.port, 40000);
    assert.equal(endpoint.reportedPort, 7777);
    assert.equal(resolveGameHost(settings, 'bob', '198.51.100.20', 7777).port, 7777);
    assert.equal(resolveGameHost(settings, 'alice', null, 7777), null, 'override must not bypass whitelist');
    assert.throws(() => resolveGameHost(settings, 'alice', '192.168.1.10', 0), /invalid listen port/);
});

test('loopback cannot be sent to another PC, while VPN IPv4 addresses are supported', () => {
    const local = resolveGameHost({}, 'alice', '127.0.0.1', 7777);
    assert.match(peerAddressProblem(local, '198.51.100.20'), /loopback/);
    assert.equal(peerAddressProblem(local, '::ffff:127.0.0.1'), null);
    const settings = { gameHosts: validateGameHosts({ alice: { address: '10.20.30.40' } }) };
    assert.equal(resolveGameHost(settings, 'alice', '192.168.1.10', 7777).address, '10.20.30.40');
});

test('invalid addresses, duplicate names and invalid ports fail during configuration loading', () => {
    for (const address of ['127.0.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255', 'example.com', '::1', '1.2.3.999', '1.2.3.4/Map']) {
        assert.throws(() => validateGameHosts({ alice: { address } }), /address/);
    }
    for (const port of [0, 65536, -1, 3.5, '7777', null]) {
        assert.throws(() => validateGameHosts({ alice: { address: '203.0.113.20', port } }), /port/);
    }
    assert.throws(() => validateGameHosts([]), /object/);
    assert.throws(() => validateGameHosts({ Alice: { address: '203.0.113.20' }, alice: { address: '203.0.113.21' } }), /duplicate/);
});

test('invalid configuration is not cached as a valid configuration on a second load', () => {
    const fs = require('fs');
    const read = fs.readFileSync;
    const configPath = require.resolve('../config/server');
    delete require.cache[configPath];
    const server = require(configPath);
    let settings = { gameHosts: { alice: { address: '127.0.0.1' } } };
    fs.readFileSync = function(filename, ...args) {
        if (String(filename).endsWith('server.json')) return JSON.stringify(settings);
        return read.call(this, filename, ...args);
    };
    try {
        assert.throws(() => server.load(), /address/);
        assert.throws(() => server.load(), /address/);
        settings = { gameHosts: { Alice: { address: '203.0.113.20' } } };
        assert.equal(server.load().gameHosts.alice.address, '203.0.113.20');
    } finally {
        fs.readFileSync = read;
        delete require.cache[configPath];
    }
});
