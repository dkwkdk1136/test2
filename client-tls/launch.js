'use strict';
const fs = require('node:fs');
const path = require('node:path');
const tls = require('node:tls');
const { spawn } = require('node:child_process');
const { loadConfig, startBridge, POLICY } = require('./bridge');

function verifyEndpoint(config, port) {
    return new Promise((resolve, reject) => {
        const socket = tls.connect({ ...POLICY, host: config.host, port,
            servername: config.serverName, ca: config.ca, rejectUnauthorized: true });
        let finished = false;
        const finish = error => {
            if (finished) return;
            finished = true; clearTimeout(timer); socket.destroy();
            if (error) reject(error); else resolve();
        };
        const timer = setTimeout(() => finish(new Error(`TLS server connection timed out on port ${port}`)), 10000);
        socket.once('error', finish);
        socket.once('close', () => { if (!finished) finish(new Error(`TLS connection closed before verification on port ${port}`)); });
        socket.once('secureConnect', () => {
            if (!socket.authorized || socket.getProtocol() !== 'TLSv1.3' || socket.getCipher().standardName !== 'TLS_AES_256_GCM_SHA384') {
                finish(new Error('TLS authentication or encryption policy mismatch'));
            } else finish();
        });
    });
}

async function launchGame(config, gameDirectory, dependencies = {}) {
    const exists = dependencies.exists || fs.existsSync;
    const openBridge = dependencies.startBridge || startBridge;
    const verify = dependencies.verifyEndpoint || verifyEndpoint;
    const createProcess = dependencies.spawn || spawn;
    const log = dependencies.log || console.log;
    const executable = path.join(gameDirectory, 'MetalRage.exe');
    if (!exists(executable)) throw new Error(`Game executable not found: ${executable}`);
    let bridge;
    try {
        log('[Launcher] Starting the local TLS bridge...');
        bridge = await openBridge(config);
        // Verify both channels before launching a game that would otherwise fail at login.
        const checks = await Promise.allSettled([verify(config, config.authPort), verify(config, config.gamePort)]);
        const failure = checks.find(result => result.status === 'rejected');
        if (failure) throw failure.reason;
        log('[Launcher] Both server certificates verified. Launching Metal Rage.');
        log('[Launcher] Keep this CMD window open while playing. It closes after the game exits.');
        const child = createProcess(executable,
            ['-globalid=TW&ip=127.0.0.1&port=9211&age=30'],
            { cwd: gameDirectory, shell: false, windowsHide: false, stdio: 'ignore' });
        const code = await new Promise((resolve, reject) => {
            child.once('error', reject);
            child.once('exit', (exitCode, signal) => {
                if (signal) reject(new Error(`Game exited with signal ${signal}`));
                else resolve(exitCode);
            });
        });
        if (code !== 0) throw new Error(`Game exited with code ${code}`);
        log('[Launcher] Game closed. Stopping this launcher\'s TLS bridge.');
    } finally {
        if (bridge) await bridge.close();
    }
}

if (require.main === module) {
    const gameDirectory = path.resolve(__dirname, '../data/System');
    Promise.resolve().then(() => loadConfig(path.join(__dirname, 'bridge.json')))
        .then(config => launchGame(config, gameDirectory))
        .catch(error => {
            if (error.code === 'EADDRINUSE') console.error('[Launcher] Port 9211/30907 is already in use. Close your previous TLS launcher or legacy server; no process was stopped automatically.');
            else console.error(`[Launcher] ${error.code || ''} ${error.message}`);
            process.exitCode = 1;
        });
}

module.exports = { launchGame, verifyEndpoint };
