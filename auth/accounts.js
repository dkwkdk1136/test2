const { hashDigest, verifyDigest, normalizeDigest } = require('./passwords');
const REGISTER_PREFIX = '!REG!';

function readCString(buffer, start, size) {
    const field = buffer.subarray(start, start + size);
    const end = field.indexOf(0);
    if (end < 0 || field.subarray(0, end).some(byte => byte > 127)) throw new Error('Invalid login field');
    return field.subarray(0, end).toString('ascii');
}

function parseLogin(body) {
    if (!Buffer.isBuffer(body) || body.length !== 0x381) throw new Error('Invalid login size');
    let username = readCString(body, 0, 0x65);
    const register = username.startsWith(REGISTER_PREFIX);
    if (register) username = username.slice(REGISTER_PREFIX.length);
    const validName = register ? /^[A-Za-z0-9_]{3,24}$/ : /^[A-Za-z0-9_]{1,25}$/;
    if (!validName.test(username)) throw new Error('Invalid username');
    const digest = normalizeDigest(readCString(body, 0x65, 0x21));
    return { username, digest, register };
}

// Bound both expensive password work and per-IP request volume, across connections.
const attempts = new Map();
let active = 0;
function allowAttempt(address, now = Date.now()) {
    for (const [key, entry] of attempts) if (entry.until <= now) attempts.delete(key);
    const entry = attempts.get(address) || { count: 0, until: now + 60000 };
    if (!attempts.has(address) && attempts.size >= 4096) return false;
    attempts.set(address, entry);
    return ++entry.count <= 10;
}

async function authenticate(db, request, address) {
    if (!allowAttempt(address || 'unknown') || active >= 4) return null;
    active++;
    try {
        if (request.register) {
            if (await db.getAccountByUsername(request.username)) return null;
            const encoded = await hashDigest(request.digest);
            try {
                const id = await db.createAccount(request.username, request.username, 101, encoded);
                return await db.getAccountById(id);
            } catch (err) {
                if (err.code === 'ER_DUP_ENTRY') return null;
                throw err;
            }
        }
        const account = await db.getAccountByUsername(request.username);
        if (!account) return null;
        const [rows] = await db.pool.execute('SELECT password_hash FROM account_credentials WHERE account_id = ?', [account.id]);
        // Legacy accounts must be provisioned by the administrator, never claimed by public signup.
        if (!rows.length || !await verifyDigest(request.digest, rows[0].password_hash)) return null;
        return account;
    } finally { active--; }
}

async function assertReady(db) {
    await db.pool.query('SELECT account_id, password_hash FROM account_credentials LIMIT 0');
}

module.exports = { parseLogin, authenticate, assertReady, allowAttempt, REGISTER_PREFIX };
