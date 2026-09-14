/**
 * Encryption Service — AES-256-CBC Field-Level Encryption
 * Implements CONF-01: sensitive DB fields encrypted at rest.
 *
 * Format stored in DB: iv_hex:ciphertext_hex
 * A fresh random IV is generated per encryption to prevent pattern analysis.
 */
'use strict';

const crypto = require('crypto');
const { encryptionKey } = require('../config/security');

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16; // AES block size

/**
 * Encrypts a plaintext string using AES-256-CBC with a random IV.
 * @param {string} plaintext
 * @returns {string} "iv_hex:ciphertext_hex"
 */
function encrypt(plaintext) {
    if (plaintext === null || plaintext === undefined) return null;

    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, encryptionKey, iv);

    let encrypted = cipher.update(String(plaintext), 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return `${iv.toString('hex')}:${encrypted}`;
}

/**
 * Decrypts an AES-256-CBC ciphertext string.
 * @param {string} ciphertext "iv_hex:ciphertext_hex"
 * @returns {string} plaintext
 */
function decrypt(ciphertext) {
    if (!ciphertext) return null;

    const parts = ciphertext.split(':');
    if (parts.length !== 2) {
        throw new Error('Invalid ciphertext format');
    }

    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];

    const decipher = crypto.createDecipheriv(ALGORITHM, encryptionKey, iv);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
}

/**
 * Encrypts an object by JSON-serialising it first.
 * Used for snapshot_data in medical_record_history (INT-02).
 */
function encryptObject(obj) {
    return encrypt(JSON.stringify(obj));
}

/**
 * Decrypts and JSON-parses an encrypted object string.
 */
function decryptObject(ciphertext) {
    const json = decrypt(ciphertext);
    return json ? JSON.parse(json) : null;
}

module.exports = { encrypt, decrypt, encryptObject, decryptObject };
