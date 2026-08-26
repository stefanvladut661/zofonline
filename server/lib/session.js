import crypto from 'node:crypto';
import { get, run } from '../db/index.js';
import { randomId, safeEqual } from './crypto.js';
import { unauthorized } from './http.js';

/**
 * Autentificarea utilizatorilor dashboard-ului.
 *
 * Parole: scrypt cu salt per utilizator. Nu se stocheaza niciodata in clar si
 * nu se pot recupera — daca cineva uita parola, se reseteaza, nu se citeste.
 *
 * Sesiune: cookie HttpOnly semnat cu HMAC sub ZOF_SECRET_KEY. Fara stocare de
 * sesiuni in DB (nimic de curatat), fara JWT (nimic de invalidat gresit).
 * HttpOnly inseamna ca JavaScript-ul din pagina nu poate citi cookie-ul, deci
 * un XSS nu poate fura sesiunea.
 */

const COOKIE_NAME = 'zof_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 ore
const SCRYPT_KEYLEN = 64;

function sessionSecret() {
  const raw = process.env.ZOF_SECRET_KEY;
  if (!raw) throw new Error('ZOF_SECRET_KEY lipseste din mediu');
  return Buffer.from(raw, 'hex');
}

// ─── Parole ──────────────────────────────────────────────────────────────────

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return { hash, salt };
}

export function verifyPassword(password, storedHash, salt) {
  const { hash } = hashPassword(password, salt);
  return safeEqual(hash, storedHash);
}

// ─── Token de sesiune ────────────────────────────────────────────────────────

function sign(value) {
  return crypto.createHmac('sha256', sessionSecret()).update(value).digest('base64url');
}

export function createSessionToken(userId) {
  const payload = Buffer.from(
    JSON.stringify({ uid: userId, exp: Date.now() + SESSION_TTL_MS }),
  ).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function readSessionToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, signature] = token.split('.');
  if (!safeEqual(signature, sign(payload))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.exp || Date.now() > data.exp) return null;
    return data;
  } catch {
    return null;
  }
}

// ─── Cookie ──────────────────────────────────────────────────────────────────

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function sessionCookie(token, { secure }) {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  return [
    `${COOKIE_NAME}=${token}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    secure ? 'Secure' : null,
    `Max-Age=${maxAge}`,
  ].filter(Boolean).join('; ');
}

export function clearCookie({ secure }) {
  return [
    `${COOKIE_NAME}=`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    secure ? 'Secure' : null,
    'Max-Age=0',
  ].filter(Boolean).join('; ');
}

// ─── Utilizatori ─────────────────────────────────────────────────────────────

const publicUser = (u) => ({
  id: u.id,
  email: u.email,
  full_name: u.full_name,
  role: u.role,
  assigned_location: u.assigned_location,
});

export function createUser({ email, password, fullName = null, role = 'angajat', assignedLocation = null }) {
  if (!email || !password) throw new Error('email si password sunt obligatorii');
  if (password.length < 10) throw new Error('Parola trebuie sa aiba minimum 10 caractere');
  if (!['admin', 'angajat'].includes(role)) throw new Error("role trebuie sa fie 'admin' sau 'angajat'");

  const { hash, salt } = hashPassword(password);
  const id = randomId();
  run(`
    INSERT INTO users (id, email, full_name, password_hash, password_salt, role, assigned_location)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, id, email, fullName, hash, salt, role, assignedLocation);
  return publicUser({ id, email, full_name: fullName, role, assigned_location: assignedLocation });
}

export function authenticate(email, password) {
  const user = get('SELECT * FROM users WHERE email = ? AND is_active = 1', email);

  // Chiar si cand contul nu exista, facem o verificare de parola, ca durata
  // raspunsului sa nu spuna atacatorului daca adresa e inregistrata.
  if (!user) {
    hashPassword(password, 'dummy-salt-constant-work');
    return null;
  }
  if (!verifyPassword(password, user.password_hash, user.password_salt)) return null;

  run('UPDATE users SET last_login = ? WHERE id = ?', new Date().toISOString(), user.id);
  return publicUser(user);
}

/** Utilizatorul cererii curente, sau null. */
export function currentUser(req) {
  const token = parseCookies(req.headers.cookie ?? '')[COOKIE_NAME];
  const session = token ? readSessionToken(token) : null;
  if (!session) return null;
  const user = get('SELECT * FROM users WHERE id = ? AND is_active = 1', session.uid);
  return user ? publicUser(user) : null;
}

export function requireUser(req) {
  const user = currentUser(req);
  if (!user) throw unauthorized('Autentificare necesara');
  return user;
}

export function requireAdmin(req) {
  const user = requireUser(req);
  if (user.role !== 'admin') throw unauthorized('Necesita rol de administrator');
  return user;
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
