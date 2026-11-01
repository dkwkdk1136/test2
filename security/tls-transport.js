const fs = require('node:fs');
const path = require('node:path');
const tls = require('node:tls');

const POLICY = Object.freeze({ minVersion: 'TLSv1.3', maxVersion: 'TLSv1.3', ciphers: 'TLS_AES_256_GCM_SHA384' });

function port(value, fallback, label) {
    const n = value === undefined ? fallback : value;
    if (!Number.isInteger(n) || n < 1 || n > 65535) throw new Error(`${label}: expected TCP port 1-65535`);
    return n;
}

function loadServerTransport(config, root) {
    const settings = config.tls;
    if (settings === undefined) return { enabled: false, authPort: 9211, gamePort: 30907 };
    if (!settings || typeof settings !== 'object' || Array.isArray(settings) || typeof settings.enabled !== 'boolean') {
        throw new Error('tls.enabled must be an explicit boolean');
    }
    if (!settings.enabled) return { enabled: false, authPort: 9211, gamePort: 30907 };
    const authPort = port(settings.authPort, 19211, 'tls.authPort');
    const gamePort = port(settings.gamePort, 40907, 'tls.gamePort');
    if (authPort === gamePort || [authPort, gamePort].some(p => p === 9211 || p === 30907)) {
        throw new Error('TLS ports must be distinct and leave 9211/30907 free for the local client bridge');
    }
    for (const field of ['keyFile', 'certFile']) {
        if (typeof settings[field] !== 'string' || !settings[field]) throw new Error(`tls.${field} is required`);
    }
    const options = {
        ...POLICY,
        key: fs.readFileSync(path.resolve(root, settings.keyFile)),
        cert: fs.readFileSync(path.resolve(root, settings.certFile)),
        handshakeTimeout: 10000,
    };
    // Reject invalid/mismatched key material before binding either listener.
    tls.createSecureContext(options);
    return { enabled: true, authPort, gamePort, options };
}

module.exports = { POLICY, port, loadServerTransport };
