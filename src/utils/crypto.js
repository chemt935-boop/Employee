const crypto = require('crypto');

function sha256Bytes(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest();
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function tokenHashBytes(token) {
  return crypto.createHash('sha256').update(token, 'utf8').digest();
}

module.exports = { sha256Bytes, sha256Hex, randomToken, tokenHashBytes };

