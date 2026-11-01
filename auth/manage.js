const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { Writable } = require('node:stream');
const { hashDigest, passwordDigest } = require('./passwords');

async function secret(prompt) {
    if (!process.stdin.isTTY) throw new Error('Run in an interactive terminal.');
    const output = new Writable({ write(chunk, encoding, done) { done(); } });
    const rl = readline.createInterface({ input: process.stdin, output, terminal: true });
    process.stdout.write(prompt);
    try { return await new Promise((resolve, reject) => {
        rl.once('SIGINT', () => reject(new Error('Cancelled')));
        rl.question('', resolve);
    }); } finally { rl.close(); process.stdout.write('\n'); }
}

async function main(db, args) {
    if (args[0] === 'migrate') {
        await db.pool.query(fs.readFileSync(path.join(__dirname, '../database/auth-schema.sql'), 'utf8'));
        console.log('Credential table ready. Existing player data preserved.');
    } else if (args[0] === 'set-password' && args[1]) {
        const account = await db.getAccountByUsername(args[1]);
        if (!account) throw new Error('Account not found.');
        const password = await secret('New password (8-16 letters/digits): ');
        const confirm = await secret('Confirm password: ');
        if (password !== confirm) throw new Error('Passwords do not match.');
        const encoded = await hashDigest(passwordDigest(password));
        await db.pool.execute('INSERT INTO account_credentials (account_id, password_hash) VALUES (?, ?) ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)', [account.id, encoded]);
        console.log('Password saved. Restart the game server to invalidate existing login tokens.');
    } else throw new Error('Usage: node auth/manage.js migrate | set-password USERNAME');
}

if (require.main === module) {
    const db = require('../database/db');
    main(db, process.argv.slice(2)).catch(err => { console.error(err.message); process.exitCode = 1; }).finally(() => db.pool.end());
}
module.exports = { main };
