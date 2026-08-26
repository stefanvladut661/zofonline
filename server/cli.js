#!/usr/bin/env node
import crypto from 'node:crypto';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { openDatabase, all, get, run } from './db/index.js';
import { createUser } from './lib/session.js';
import { createConnector, createLocation, listConnectors, listLocations, rotateApiKey } from './routes/admin.js';

/**
 * Utilitare de administrare din linia de comanda.
 *
 * Motivul pentru care exista: primul cont de admin si prima cheie API nu pot fi
 * create din interfata (nu ai cu ce sa te autentifici inca).
 *
 *   npm run server:key                        genereaza ZOF_SECRET_KEY
 *   npm run server:user                       creeaza un utilizator
 *   npm run server:cli -- locations           listeaza locatiile
 *   npm run server:cli -- location:add <nume> [fizic|online]
 *   npm run server:cli -- connectors          listeaza agentii
 *   npm run server:cli -- connector:add <connector_id> <location_id> [nume]
 *   npm run server:cli -- connector:rotate <connector_id>
 */

const [, , command, ...args] = process.argv;

function needsDb() {
  if (!process.env.ZOF_SECRET_KEY) {
    console.error('ZOF_SECRET_KEY lipseste. Ruleaza intai:  npm run server:key');
    process.exit(1);
  }
  openDatabase();
}

async function prompt(question, { silent = false } = {}) {
  const rl = readline.createInterface({ input: stdin, output: stdout, terminal: true });
  if (!silent) {
    const answer = await rl.question(question);
    rl.close();
    return answer.trim();
  }
  // Ascunde parola in timp ce se tasteaza.
  const answer = await new Promise((resolve) => {
    const onData = (char) => {
      if (['\n', '\r', ''].includes(char.toString())) stdin.removeListener('data', onData);
      else stdout.write('\x1b[2K\x1b[200D' + question + '*'.repeat(rl.line.length));
    };
    stdout.write(question);
    stdin.on('data', onData);
    rl.question('').then((a) => {
      stdin.removeListener('data', onData);
      resolve(a);
    });
  });
  rl.close();
  stdout.write('\n');
  return answer.trim();
}

const commands = {
  key() {
    const secret = crypto.randomBytes(32).toString('hex');
    console.log('\nAdauga linia asta in fisierul .env din radacina proiectului:\n');
    console.log(`ZOF_SECRET_KEY=${secret}\n`);
    console.log('Pastreaza-o. Daca o pierzi, toate cheile API existente devin');
    console.log('imposibil de decriptat si trebuie regenerate pentru fiecare agent.\n');
  },

  async user() {
    needsDb();
    const email = await prompt('Email: ');
    if (!email) return console.error('Email obligatoriu.');
    if (get('SELECT id FROM users WHERE email = ?', email)) {
      return console.error(`Exista deja un utilizator cu adresa "${email}".`);
    }
    const fullName = await prompt('Nume complet (optional): ');
    const password = await prompt('Parola (minimum 10 caractere): ', { silent: true });
    const confirm = await prompt('Confirma parola: ', { silent: true });
    if (password !== confirm) return console.error('Parolele nu coincid.');

    const isFirst = all('SELECT id FROM users').length === 0;
    const role = isFirst ? 'admin' : (await prompt('Rol [admin/angajat] (implicit angajat): ')) || 'angajat';

    try {
      const user = createUser({ email, password, fullName: fullName || null, role });
      console.log(`\nCreat: ${user.email} (rol: ${user.role})`);
      if (isFirst) console.log('Primul cont primeste automat rol de administrator.');
    } catch (err) {
      console.error(`\nEsuat: ${err.message}`);
      process.exitCode = 1;
    }
  },

  locations() {
    needsDb();
    const rows = listLocations();
    if (!rows.length) return console.log('Nicio locatie. Adauga una cu: location:add "<nume>"');
    console.table(rows.map((l) => ({ id: l.id, nume: l.name, tip: l.type, activa: l.is_active })));
  },

  'location:add'() {
    needsDb();
    const [name, type] = args;
    if (!name) return console.error('Utilizare: location:add "<nume>" [fizic|online]');
    const loc = createLocation({ name, type: type ?? 'fizic' });
    console.log(`Locatie creata:\n  id   ${loc.id}\n  nume ${loc.name}\n  tip  ${loc.type}`);
  },

  connectors() {
    needsDb();
    const rows = listConnectors();
    if (!rows.length) return console.log('Niciun agent. Adauga unul cu: connector:add <id> <location_id>');
    console.table(rows.map((c) => ({
      connector_id: c.connector_id, locatie: c.location_name,
      status: c.status, sync: c.sync_count, cheie: c.api_key,
    })));
  },

  'connector:add'() {
    needsDb();
    const [connectorId, locationId, name] = args;
    if (!connectorId || !locationId) {
      return console.error('Utilizare: connector:add <connector_id> <location_id> [nume]');
    }
    const { connector, apiKey } = createConnector({ connector_id: connectorId, location_id: locationId, name });
    console.log(`\nAgent creat: ${connector.connector_id} → ${connector.location_name}`);
    console.log('\n  CHEIA API (se afiseaza O SINGURA DATA):\n');
    console.log(`  ${apiKey}\n`);
    console.log('  Pune-o in configul agentului de pe calculatorul din locatie.');
    console.log('  Daca o pierzi, genereaza alta cu: connector:rotate ' + connector.connector_id + '\n');
  },

  'connector:rotate'() {
    needsDb();
    const [connectorId] = args;
    if (!connectorId) return console.error('Utilizare: connector:rotate <connector_id>');
    const { apiKey } = rotateApiKey(connectorId);
    console.log(`\nCheie rotita pentru ${connectorId}. Cea veche a fost revocata.`);
    console.log('\n  CHEIA API NOUA (se afiseaza O SINGURA DATA):\n');
    console.log(`  ${apiKey}\n`);
    console.log('  Actualizeaza configul agentului din locatie inainte de urmatorul sync.\n');
  },
};

const handler = commands[command];
if (!handler) {
  console.log(`
Utilitare Zof

  npm run server:key                  genereaza ZOF_SECRET_KEY
  npm run server:user                 creeaza un utilizator dashboard
  npm run server:cli -- locations     listeaza locatiile
  npm run server:cli -- location:add "<nume>" [fizic|online]
  npm run server:cli -- connectors    listeaza agentii
  npm run server:cli -- connector:add <connector_id> <location_id> [nume]
  npm run server:cli -- connector:rotate <connector_id>
`);
  process.exit(command ? 1 : 0);
}

await handler();
