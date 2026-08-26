/**
 * Sesiune de autentificare — provider local.
 *
 * Auth-ul Base44 (OAuth + /api/apps/public + token in URL) a fost scos complet.
 * Pana la backend-ul central (Faza 1), sesiunea e locala si serveste un singur
 * scop: sa deblocheze ecranele gate-uite pe rol (Setari, Conectori) ca sa poata
 * fi dezvoltate si testate.
 *
 * ⚠ NU E AUTENTIFICARE REALA. Nu verifica nicio parola, nu vorbeste cu niciun
 * server. In build de productie refuza sa porneasca (fail closed) tocmai ca sa
 * nu ajunga din greseala pe un domeniu public. Se inlocuieste cu un provider
 * server-side cand exista backend — vezi createHttpAdapter pentru acelasi tipar.
 */

const SESSION_KEY = 'zof:session';

const DEV_USER = {
  id: 'local-dev-user',
  email: 'owner@zof.local',
  full_name: 'Owner (sesiune locala)',
  role: 'admin',
  assigned_location: null,
};

function readSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeSession(user) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  } catch (err) {
    console.error('[auth] Nu pot salva sesiunea:', err);
  }
}

export function createLocalAuth() {
  return {
    name: 'local',

    async me() {
      if (import.meta.env.PROD) {
        const err = new Error(
          'Autentificare neconfigurata. Providerul local e permis doar in dezvoltare — ' +
            'conecteaza un provider server-side inainte de deploy.',
        );
        err.type = 'auth_not_configured';
        throw err;
      }

      let user = readSession();
      if (!user) {
        user = DEV_USER;
        writeSession(user);
      }
      return user;
    },

    async logout() {
      try {
        localStorage.removeItem(SESSION_KEY);
      } catch {
        /* storage indisponibil — sesiunea moare oricum la reload */
      }
      window.location.reload();
    },

    /** Doar pentru dezvoltare: verifica gate-urile de rol fara backend. */
    async setRole(role) {
      const user = { ...(readSession() ?? DEV_USER), role };
      writeSession(user);
      return user;
    },
  };
}
