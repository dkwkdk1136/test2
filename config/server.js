const fs = require('fs');
const path = require('path');
const { isIPv4 } = require('net');
const { validateGameHosts } = require('./game-hosts');

let cachedConfig;

function load()
{
    if (cachedConfig) return cachedConfig;
    const filename = path.join(__dirname, 'server.json');
    let config;
    try {
        config = JSON.parse(fs.readFileSync(filename, 'utf8'));
    } catch (err) {
        if (err.code !== 'ENOENT') throw err;
        config = {};
    }
    // Publish the cached configuration only after all validation succeeds.
    const host = config.publicHost || '127.0.0.1';
    if (!isIPv4(host)) throw new Error('config/server.json: publicHost must be an IPv4 address');
    config.publicHost = host;
    const startingCredits = config.startingCredits == null ? 100000 : Number(config.startingCredits);
    if (!Number.isSafeInteger(startingCredits) || startingCredits < 0 || startingCredits > 2147483647) {
        throw new Error('config/server.json: startingCredits must be an integer from 0 to 2147483647');
    }
    if (config.grantAllItemsAndMaxCredits != null && typeof config.grantAllItemsAndMaxCredits !== 'boolean') {
        throw new Error('config/server.json: grantAllItemsAndMaxCredits must be true or false');
    }
    if (config.whitelistEnabled != null && typeof config.whitelistEnabled !== 'boolean') {
        throw new Error('config/server.json: whitelistEnabled must be true or false');
    }
    config.startingCredits = startingCredits;
    config.grantAllItemsAndMaxCredits = config.grantAllItemsAndMaxCredits === true;
    config.whitelistEnabled = config.whitelistEnabled === true;
    config.gameHosts = validateGameHosts(config.gameHosts);
    cachedConfig = config;
    return config;
}

// In TLS mode each player's game/lobby connection must return through their own local bridge.
function getPublicHost() { const config = load(); return config.tls?.enabled === true ? '127.0.0.1' : config.publicHost; }

module.exports = { getPublicHost, getAccountSettings: () => load(), load };
