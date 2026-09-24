const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const port = 3000;
const root = __dirname;
const db = new DatabaseSync(path.join(root, 'lockcard.db'));
const sessions = new Map();

function initializeDatabase() {
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ativo',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      identifier TEXT NOT NULL UNIQUE,
      user_name TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ativo',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS doors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'fechada',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS access_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_name TEXT NOT NULL,
      card TEXT NOT NULL,
      door TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER,
      action TEXT NOT NULL,
      details TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (account_id) REFERENCES accounts(id)
    );
  `);
  const doors = db.prepare('SELECT COUNT(*) AS total FROM doors').get();
  if (doors.total === 0) {
    const addDoor = db.prepare('INSERT INTO doors (name, description) VALUES (?, ?)');
    addDoor.run('Porta Principal', 'Entrada do edifício');
    addDoor.run('Academia', 'Acesso à área de exercícios');
    addDoor.run('Sala de Reunião', 'Sala 201 - 2º andar');
  }
  const users = db.prepare('SELECT COUNT(*) AS total FROM users').get();
  if (users.total === 0) {
    const addUser = db.prepare('INSERT INTO users (name, email, phone, status) VALUES (?, ?, ?, ?)');
    addUser.run('Usuário 1', 'user1@email.com', '(DDD) XXXXX-XXXX', 'ativo');
    addUser.run('Usuário 2', 'user2@email.com', '(DDD) XXXXX-XXXX', 'ativo');
    addUser.run('Usuário 3', 'user3@email.com', '(DDD) XXXXX-XXXX', 'inativo');
  }
  const cards = db.prepare('SELECT COUNT(*) AS total FROM cards').get();
  if (cards.total === 0) {
    const addCard = db.prepare('INSERT INTO cards (identifier, user_name, type, created_at) VALUES (?, ?, ?, ?)');
    addCard.run('A1:B2:C3:D4', 'Usuário 1', 'RFID', '2026-08-01 00:00:00');
    addCard.run('E5:F6:G7:H8', 'Usuário 2', 'NFC', '2026-08-02 00:00:00');
  }
  const accesses = db.prepare('SELECT COUNT(*) AS total FROM access_logs').get();
  if (accesses.total === 0) {
    const addAccess = db.prepare('INSERT INTO access_logs (user_name, card, door, type, status, created_at) VALUES (?, ?, ?, ?, ?, ?)');
    addAccess.run('Usuário 1', 'A1:B2:C3:D4', 'Porta Principal', 'Cofre', 'Permitido', '2026-08-04 14:32:15');
    addAccess.run('Usuário 2', 'E5:F6:G7:H8', 'Academia', 'Porta', 'Permitido', '2026-08-04 14:28:42');
    addAccess.run('Usuário 3', 'I9:J0:K1:L2', 'Porta Principal', 'Porta', 'Negado', '2026-08-04 14:25:10');
  }
}

function send(response, status, data, headers = {}) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  response.end(JSON.stringify(data));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', chunk => { body += chunk; });
    request.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new Error('JSON inválido')); }
    });
    request.on('error', reject);
  });
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}

function passwordMatches(password, stored) {
  const [salt, hash] = stored.split(':');
  const candidate = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(candidate, Buffer.from(hash, 'hex'));
}

function tokenFor(accountId) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, accountId);
  return token;
}

function accountFrom(request) {
  const cookies = request.headers.cookie || '';
  const token = cookies.split(';').map(item => item.trim()).find(item => item.startsWith('lockcard_session='))?.split('=')[1];
  const id = token && sessions.get(token);
  return id ? db.prepare('SELECT id, name, email FROM accounts WHERE id = ?').get(id) : null;
}

function requireAccount(request, response) {
  const account = accountFrom(request);
  if (!account) send(response, 401, { error: 'Faça login para continuar.' });
  return account;
}

function logAction(accountId, action, details = '') {
  db.prepare('INSERT INTO audit_logs (account_id, action, details) VALUES (?, ?, ?)').run(accountId, action, details);
}

async function handleApi(request, response, url) {
  try {
    if (request.method === 'POST' && url.pathname === '/api/auth/register') {
      const { name, email, password } = await readBody(request);
      if (!name || !email || !password || password.length < 6) return send(response, 400, { error: 'Informe nome, e-mail e senha com pelo menos 6 caracteres.' });
      const result = db.prepare('INSERT INTO accounts (name, email, password_hash) VALUES (?, ?, ?)').run(name.trim(), email.trim().toLowerCase(), hashPassword(password));
      const token = tokenFor(Number(result.lastInsertRowid));
      return send(response, 201, { name, email }, { 'Set-Cookie': `lockcard_session=${token}; HttpOnly; SameSite=Lax; Path=/` });
    }
    if (request.method === 'POST' && url.pathname === '/api/auth/login') {
      const { email, password } = await readBody(request);
      const account = db.prepare('SELECT * FROM accounts WHERE email = ?').get(email?.trim().toLowerCase());
      if (!account || !passwordMatches(password || '', account.password_hash)) return send(response, 401, { error: 'E-mail ou senha inválidos.' });
      const token = tokenFor(account.id);
      logAction(account.id, 'login');
      return send(response, 200, { name: account.name, email: account.email }, { 'Set-Cookie': `lockcard_session=${token}; HttpOnly; SameSite=Lax; Path=/` });
    }
    if (request.method === 'POST' && url.pathname === '/api/auth/logout') {
      const cookies = request.headers.cookie || '';
      const token = cookies.split(';').map(item => item.trim()).find(item => item.startsWith('lockcard_session='))?.split('=')[1];
      if (token) sessions.delete(token);
      return send(response, 200, { ok: true }, { 'Set-Cookie': 'lockcard_session=; Max-Age=0; HttpOnly; SameSite=Lax; Path=/' });
    }
    if (request.method === 'GET' && url.pathname === '/api/auth/me') return send(response, 200, { account: accountFrom(request) });

    const account = requireAccount(request, response);
    if (!account) return;
    const resourceMatch = url.pathname.match(/^\/api\/(users|cards|doors)\/(\d+)$/);
    if (resourceMatch && request.method === 'PUT') {
      const [, resource, id] = resourceMatch;
      const body = await readBody(request);
      const statements = {
        users: ['UPDATE users SET name = ?, email = ?, phone = ?, status = ? WHERE id = ?', [body.name, body.email, body.phone, body.status, id]],
        cards: ['UPDATE cards SET identifier = ?, user_name = ?, type = ?, status = ? WHERE id = ?', [body.identifier, body.userName, body.type, body.status, id]],
        doors: ['UPDATE doors SET name = ?, description = ?, status = ? WHERE id = ?', [body.name, body.description, body.status || 'fechada', id]]
      };
      const [sql, values] = statements[resource];
      const result = db.prepare(sql).run(...values);
      if (!result.changes) return send(response, 404, { error: 'Registro não encontrado.' });
      logAction(account.id, `update_${resource}`, id);
      return send(response, 200, { ok: true });
    }
    if (resourceMatch && request.method === 'DELETE') {
      const [, resource, id] = resourceMatch;
      const result = db.prepare(`DELETE FROM ${resource} WHERE id = ?`).run(id);
      if (!result.changes) return send(response, 404, { error: 'Registro não encontrado.' });
      logAction(account.id, `delete_${resource}`, id);
      return send(response, 200, { ok: true });
    }
    if (request.method === 'GET' && url.pathname === '/api/users') return send(response, 200, db.prepare('SELECT * FROM users ORDER BY id DESC').all());
    if (request.method === 'POST' && url.pathname === '/api/users') {
      const body = await readBody(request);
      const result = db.prepare('INSERT INTO users (name, email, phone, status) VALUES (?, ?, ?, ?)').run(body.name, body.email, body.phone, body.status || 'ativo');
      logAction(account.id, 'create_user', body.email);
      return send(response, 201, db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid));
    }
    if (request.method === 'GET' && url.pathname === '/api/cards') return send(response, 200, db.prepare('SELECT * FROM cards ORDER BY id DESC').all());
    if (request.method === 'POST' && url.pathname === '/api/cards') {
      const body = await readBody(request);
      const result = db.prepare('INSERT INTO cards (identifier, user_name, type) VALUES (?, ?, ?)').run(body.identifier, body.userName, body.type);
      logAction(account.id, 'create_card', body.identifier);
      return send(response, 201, db.prepare('SELECT * FROM cards WHERE id = ?').get(result.lastInsertRowid));
    }
    if (request.method === 'GET' && url.pathname === '/api/doors') return send(response, 200, db.prepare('SELECT * FROM doors ORDER BY id').all());
    if (request.method === 'POST' && url.pathname === '/api/doors') {
      const body = await readBody(request);
      const result = db.prepare('INSERT INTO doors (name, description) VALUES (?, ?)').run(body.name, body.description);
      logAction(account.id, 'create_door', body.name);
      return send(response, 201, db.prepare('SELECT * FROM doors WHERE id = ?').get(result.lastInsertRowid));
    }
    if (request.method === 'POST' && url.pathname === '/api/accesses') {
      const body = await readBody(request);
      db.prepare('INSERT INTO access_logs (user_name, card, door, type, status) VALUES (?, ?, ?, ?, ?)').run(body.userName, body.card, body.door, body.type || 'Porta', body.status || 'Permitido');
      logAction(account.id, 'create_access', body.door);
      return send(response, 201, { ok: true });
    }
    if (request.method === 'GET' && url.pathname === '/api/accesses') return send(response, 200, db.prepare('SELECT * FROM access_logs ORDER BY id DESC').all());
    return send(response, 404, { error: 'Rota não encontrada.' });
  } catch (error) {
    const message = error.code === 'SQLITE_CONSTRAINT_UNIQUE' ? 'Este registro já existe.' : 'Não foi possível concluir a operação.';
    return send(response, 400, { error: message });
  }
}

function serveStatic(request, response, url) {
  const requested = url.pathname === '/' ? '/index.html' : url.pathname;
  const filePath = path.resolve(root, `.${requested}`);
  if (!filePath.startsWith(root) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return send(response, 404, { error: 'Arquivo não encontrado.' });
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
  response.writeHead(200, { 'Content-Type': types[path.extname(filePath)] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(response);
}

initializeDatabase();
http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  if (url.pathname.startsWith('/api/')) return handleApi(request, response, url);
  if (request.method === 'GET') return serveStatic(request, response, url);
  send(response, 405, { error: 'Método não permitido.' });
}).listen(port, () => console.log(`LockCard disponível em http://localhost:${port}`));
