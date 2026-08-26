import crypto from 'node:crypto';

/**
 * Primitivele criptografice pentru autentificarea agentilor.
 *
 * De ce cheia e criptata, nu doar hash-uita: agentul NU trimite niciodata cheia
 * pe retea. Trimite doar o semnatura HMAC calculata cu ea. Ca sa verifice
 * semnatura, serverul are nevoie de cheia in clar — deci hash-ul singur nu ar fi
 * suficient. O tinem criptata cu AES-256-GCM sub ZOF_SECRET_KEY, care sta in
 * mediu, nu in baza de date. Un dump de DB furat nu deconspira nicio cheie.
 *
 * Hash-ul se pastreaza in paralel, pentru cautare si detectarea duplicatelor.
 */

const KEY_BYTES = 32;

/** Cheie API cu 256 de biti de entropie. */
export function generateApiKey(connectorId) {
  return `zof_${connectorId}_${crypto.randomBytes(KEY_BYTES).toString('hex')}`;
}

export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function apiKeyPrefix(keyValue) {
  return `${keyValue.slice(0, 12)}…${keyValue.slice(-4)}`;
}

function masterKey() {
  const raw = process.env.ZOF_SECRET_KEY;
  if (!raw) {
    throw new Error(
      'ZOF_SECRET_KEY lipseste din mediu. Genereaza una cu:\n' +
        "  node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
  }
  const key = Buffer.from(raw, 'hex');
  if (key.length !== KEY_BYTES) {
    throw new Error(`ZOF_SECRET_KEY trebuie sa fie ${KEY_BYTES} bytes in hex (64 caractere)`);
  }
  return key;
}

export function encryptSecret(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', masterKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    ct: ct.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
  };
}

export function decryptSecret({ ct, iv, tag }) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ct, 'base64')), decipher.final()]).toString('utf8');
}

/**
 * Semnatura pe care o calculeaza si agentul, identic:
 *   HMAC-SHA256(api_key, `${timestamp}.${rawBody}`)
 * Timestamp-ul intra in semnatura ca sa nu poata fi schimbat de un atacator.
 */
export function signPayload(apiKey, timestamp, rawBody) {
  return crypto.createHmac('sha256', apiKey).update(`${timestamp}.${rawBody}`).digest('hex');
}

/** Comparatie in timp constant — o comparatie normala scurge informatie. */
export function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

export function randomId() {
  return crypto.randomUUID();
}
