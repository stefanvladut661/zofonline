import { all, get, run } from '../db/index.js';
import { decryptSecret, safeEqual, signPayload, sha256 } from './crypto.js';
import { unauthorized, badRequest } from './http.js';

/**
 * Autentificarea agentilor din locatii.
 *
 * Contractul (identic cu server/README.md):
 *   X-Connector-Id : id-ul agentului
 *   X-Timestamp    : ISO 8601, momentul cererii
 *   X-Signature    : HMAC-SHA256(api_key, `${timestamp}.${rawBody}`), hex
 *
 * Cheia API nu circula niciodata pe retea. Serverul o decripteaza local ca sa
 * recalculeze semnatura si compara in timp constant.
 *
 * Doua aparari peste semnatura:
 *   1. fereastra de timp — o cerere mai veche de 5 minute e respinsa;
 *   2. semnaturi vazute — aceeasi semnatura nu se accepta de doua ori.
 * Fara ele, cineva care intercepteaza o cerere valida ar putea sa o retrimita.
 */

const CLOCK_SKEW_MS = 5 * 60 * 1000;
const SIGNATURE_TTL_MS = 24 * 60 * 60 * 1000;

export function authenticateAgent(req, rawBody) {
  const connectorId = req.headers['x-connector-id'];
  const timestamp = req.headers['x-timestamp'];
  const signature = req.headers['x-signature'];

  if (!connectorId || !timestamp || !signature) {
    throw unauthorized('Lipsesc X-Connector-Id, X-Timestamp sau X-Signature');
  }

  const sent = Date.parse(timestamp);
  if (Number.isNaN(sent)) throw badRequest('X-Timestamp nu e o data ISO 8601 valida');

  const drift = Math.abs(Date.now() - sent);
  if (drift > CLOCK_SKEW_MS) {
    throw unauthorized(
      `Cerere in afara ferestrei de timp (${Math.round(drift / 1000)}s). ` +
        'Verifica ceasul calculatorului din locatie.',
    );
  }

  const connector = get('SELECT * FROM connectors WHERE connector_id = ?', connectorId);
  if (!connector) throw unauthorized('Connector necunoscut');

  const keys = all(
    'SELECT * FROM api_keys WHERE connector_id = ? AND is_active = 1',
    connectorId,
  );
  if (!keys.length) throw unauthorized('Niciun API key activ pentru acest connector');

  // Un connector poate avea mai multe chei active in timpul unei rotatii.
  const matched = keys.find((k) => {
    let apiKey;
    try {
      apiKey = decryptSecret({ ct: k.key_ct, iv: k.key_iv, tag: k.key_tag });
    } catch {
      return false; // cheie criptata cu alt ZOF_SECRET_KEY
    }
    return safeEqual(signature, signPayload(apiKey, timestamp, rawBody));
  });

  if (!matched) throw unauthorized('Semnatura invalida');

  // Anti-replay. Cheia e hash-ul semnaturii, nu semnatura in sine.
  const seenKey = sha256(`${connectorId}:${signature}`);
  if (get('SELECT signature FROM seen_signatures WHERE signature = ?', seenKey)) {
    throw unauthorized('Cerere deja procesata (replay)');
  }
  run('INSERT INTO seen_signatures (signature) VALUES (?)', seenKey);
  run("DELETE FROM seen_signatures WHERE seen_at < datetime('now', ?)",
    `-${Math.round(SIGNATURE_TTL_MS / 1000)} seconds`);

  run('UPDATE api_keys SET last_used = ? WHERE id = ?', new Date().toISOString(), matched.id);

  return { connector, apiKeyId: matched.id };
}
