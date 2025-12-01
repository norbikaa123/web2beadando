import express from 'express';
import expressLayouts from 'express-ejs-layouts';
import session from 'express-session';
import methodOverride from 'method-override';
import bcrypt from 'bcryptjs';
import { openDb } from './db.js';
import { ensureAuth, ensureAdmin } from './auth.js';

const app = express();
const BASE = '/app156';
const PORT = process.env.PORT || 4156;

/* ---------- STATIC ---------- */
app.use(BASE + '/public', express.static('public'));

/* ---------- EJS + Layout ---------- */
app.set('view engine', 'ejs');
app.use(expressLayouts);
app.set('layout', 'partials/layout');

app.use(express.urlencoded({ extended: true }));
app.use(methodOverride('_method'));

/* ---------- SESSION ---------- */
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'change-this-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 2 },
  })
);

app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  res.locals.title = res.locals.title || 'Tanösvény';
  next();
});

/* ---------- ROUTES ---------- */

// Home
app.get(BASE + '/', (req, res) => {
  res.render('index', { title: 'Tanösvény – Fõoldal' });
});

// Adatbázis
app.get(BASE + '/adatbazis', async (req, res) => {
  const db = await openDb();
  const { np, telepules, vezetes } = req.query;

  let sql = `
    SELECT id, ut_nev, hossz, allomas, ido,
           CASE WHEN vezetes=1 THEN 'van' ELSE 'nincs' END AS vezetes,
           telepules_nev, np_nev
    FROM v_ut_reszletes
    WHERE 1=1
  `;
  const params = [];

  if (np) { sql += ' AND np_nev = ?'; params.push(np); }
  if (telepules) { sql += ' AND telepules_nev = ?'; params.push(telepules); }
  if (vezetes === 'van') { sql += ' AND vezetes = 1'; }
  if (vezetes === 'nincs') { sql += ' AND vezetes = 0'; }

  sql += ' ORDER BY ut_nev';

  const utak = await db.all(sql, params);
  const nps = await db.all('SELECT DISTINCT np_nev FROM v_ut_reszletes ORDER BY np_nev');
  const telepulesek = await db.all('SELECT DISTINCT telepules_nev FROM v_ut_reszletes ORDER BY telepules_nev');

  res.render('adatbazis', {
    title: 'Tanösvény – Adatbázis',
    utak,
    nps,
    telepulesek,
    filters: { np, telepules, vezetes },
  });
});

// Kapcsolat
app.get(BASE + '/kapcsolat', (req, res) => {
  res.render('kapcsolat', { title: 'Tanösvény – Kapcsolat' });
});

app.post(BASE + '/kapcsolat', async (req, res) => {
  const { name, email, message } = req.body;
  if (!name || !email || !message) {
    return res.status(400).send('Minden mezõ kötelezõ.');
  }
  const db = await openDb();
  await db.run('INSERT INTO messages (name, email, message) VALUES (?, ?, ?)', [
    name,
    email,
    message,
  ]);
  res.render('kapcsolat-siker', { title: 'Üzenet elküldve – Tanösvény' });
});

// Üzenetek
app.get(BASE + '/uzenetek', ensureAuth, async (req, res) => {
  const db = await openDb();
  const msgs = await db.all(`
    SELECT id, name, email, message, created_at
    FROM messages
    ORDER BY created_at DESC
  `);

  msgs.forEach((m) => {
    const dt = new Date(m.created_at);
    m.created_at_formatted = dt.toLocaleString('hu-HU', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  });

  res.render('uzenetek', {
    title: 'Tanösvény – Üzenetek',
    msgs,
  });
});

// Auth
app.get(BASE + '/register', (req, res) => {
  res.render('auth/register', { title: 'Regisztráció – Tanösvény' });
});

app.post(BASE + '/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password)
    return res.status(400).send('Hiányzó adatok.');

  const db = await openDb();
  const exists = await db.get('SELECT id FROM users WHERE email = ?', email);

  if (exists) return res.status(400).send('Már van ilyen emaillel fiók.');

  const hash = await bcrypt.hash(password, 10);
  await db.run(
    'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
    [name, email, hash, 'registered']
  );

  res.redirect(BASE + '/login');
});

app.get(BASE + '/login', (req, res) => {
  res.render('auth/login', {
    title: 'Bejelentkezés – Tanösvény',
    next: req.query.next || BASE + '/',
  });
});

app.post(BASE + '/login', async (req, res) => {
  const { email, password, next } = req.body;

  const db = await openDb();
  const user = await db.get('SELECT * FROM users WHERE email = ?', email);

  if (!user) return res.status(400).send('Hibás bejelentkezés.');

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(400).send('Hibás bejelentkezés.');

  req.session.user = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };

  res.redirect(next || BASE + '/');
});

app.post(BASE + '/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect(BASE + '/');
  });
});

// Admin
app.get(BASE + '/admin', ensureAdmin, (req, res) => {
  res.render('admin', {
    title: 'Admin – Tanösvény',
  });
});

// CRUD UT list
app.get(BASE + '/crud/ut', ensureAuth, async (req, res) => {
  const db = await openDb();
  const utak = await db.all(`
    SELECT u.id, u.nev, u.hossz, u.allomas, u.ido, u.vezetes,
           t.nev AS telepules_nev
    FROM ut u
    JOIN telepules t ON t.id = u.telepulesid
    ORDER BY u.nev;
  `);

  res.render('crud/ut-list', {
    title: 'Útvonalak – Tanösvény',
    utak,
  });
});

// CRUD new
app.get(BASE + '/crud/ut/new', ensureAuth, async (req, res) => {
  const db = await openDb();
  const telepulesek = await db.all(
    'SELECT id, nev FROM telepules ORDER BY nev'
  );

  res.render('crud/ut-form', {
    title: 'Új út hozzáadása – Tanösvény',
    ut: null,
    telepulesek,
  });
});

// CRUD create
app.post(BASE + '/crud/ut', ensureAuth, async (req, res) => {
  const { nev, hossz, allomas, ido, vezetes, telepulesid } = req.body;

  const db = await openDb();
  await db.run(
    'INSERT INTO ut (nev, hossz, allomas, ido, vezetes, telepulesid) VALUES (?, ?, ?, ?, ?, ?)',
    [
      nev,
      hossz || null,
      allomas || null,
      ido || null,
      vezetes === '1' ? 1 : 0,
      telepulesid,
    ]
  );

  res.redirect(BASE + '/crud/ut');
});

// CRUD edit
app.get(BASE + '/crud/ut/:id/edit', ensureAuth, async (req, res) => {
  const db = await openDb();
  const ut = await db.get('SELECT * FROM ut WHERE id = ?', req.params.id);

  if (!ut) return res.status(404).send('Nem található.');

  const telepulesek = await db.all(
    'SELECT id, nev FROM telepules ORDER BY nev'
  );

  res.render('crud/ut-form', {
    title: 'Út szerkesztése – Tanösvény',
    ut,
    telepulesek,
  });
});

// CRUD update
app.put(BASE + '/crud/ut/:id', ensureAuth, async (req, res) => {
  const { nev, hossz, allomas, ido, vezetes, telepulesid } = req.body;

  const db = await openDb();
  await db.run(
    'UPDATE ut SET nev=?, hossz=?, allomas=?, ido=?, vezetes=?, telepulesid=? WHERE id=?',
    [
      nev,
      hossz || null,
      allomas || null,
      ido || null,
      vezetes === '1' ? 1 : 0,
      telepulesid,
      req.params.id,
    ]
  );

  res.redirect(BASE + '/crud/ut');
});

// CRUD delete
app.delete(BASE + '/crud/ut/:id', ensureAuth, async (req, res) => {
  const db = await openDb();
  await db.run('DELETE FROM ut WHERE id = ?', req.params.id);

  res.redirect(BASE + '/crud/ut');
});

// 404
app.use((req, res) => {
  res.status(404).send('Az oldal nem található.');
});

// Start
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Szerver fut: http://0.0.0.0:${PORT}`);
});
