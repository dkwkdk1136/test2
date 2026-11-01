const crypto = require('node:crypto');
const { promisify } = require('node:util');
const scrypt = promisify(crypto.scrypt);
const OPTIONS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const EMPTY_MD5 = 'd41d8cd98f00b204e9800998ecf8427e';

function normalizeDigest(value) {
    if (!/^[a-fA-F0-9]{32}$/.test(value) || value.toLowerCase() === EMPTY_MD5) {
        throw new Error('Invalid credential');
    }
    return value.toLowerCase();
}

async function hashDigest(value) {
    const digest = normalizeDigest(value);
    const salt = crypto.randomBytes(16);
    const key = await scrypt(digest, salt, 32, OPTIONS);
    return `scrypt-v1$${salt.toString('hex')}$${key.toString('hex')}`;
}

async function verifyDigest(value, encoded) {
    const digest = normalizeDigest(value);
    if (!/^scrypt-v1\$[0-9a-f]{32}\$[0-9a-f]{64}$/.test(encoded || '')) return false;
    const [, salt, hash] = encoded.split('$');
    const key = await scrypt(digest, Buffer.from(salt, 'hex'), 32, OPTIONS);
    return crypto.timingSafeEqual(key, Buffer.from(hash, 'hex'));
}

function passwordDigest(password) {
    // The original client accepts ASCII letters/digits and sends their MD5 hex digest.
    if (!/^[A-Za-z0-9]{8,16}$/.test(password)) throw new Error('Use 8-16 ASCII letters/digits.');
    return crypto.createHash('md5').update(password, 'ascii').digest('hex');
}

module.exports = { hashDigest, verifyDigest, normalizeDigest, passwordDigest };
