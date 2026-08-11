import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import { z } from 'zod';

const app = express();
const PORT = Number(process.env.PORT || 8787);
const DATABASE_URL = process.env.DATABASE_URL || '';
const JWT_SECRET = process.env.JWT_SECRET || '';
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const APP_ENV = process.env.APP_ENV || 'development';
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

if (!DATABASE_URL) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('JWT_SECRET with at least 32 chars is required');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
});

app.use(express.json({ limit: '1mb' }));
app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (!allowedOrigins.length) return cb(null, true);
    return allowedOrigins.includes(origin)
      ? cb(null, true)
      : cb(new Error('Origin not allowed'));
  },
  credentials: true
}));

const rateMap = new Map();
function rateLimit(key, limit, windowMs) {
  const now = Date.now();
  const current = rateMap.get(key);
  if (!current || now - current.start > windowMs) {
    rateMap.set(key, { start: now, count: 1 });
    return true;
  }
  current.count += 1;
  return current.count <= limit;
}

async function db(query, values = []) {
  const result = await pool.query(query, values);
  return result;
}

function signToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, email: user.email },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function auth(req, res, next) {
  try {
    const authHeader = String(req.headers.authorization || '');
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) return res.status(401).json({ ok: false, error: 'Unauthorized' });
    req.user = jwt.verify(token, JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ ok: false, error: 'Forbidden' });
  return next();
}

function calculateCosts(input) {
  const filamentCost = (input.rollPrice / input.rollWeightGrams) * input.usedGrams;
  const energyKwh = (input.powerWatts / 1000) * input.printHours;
  const powerCost = energyKwh * input.electricityPerKwh;
  const extras = input.packaging + input.shipping + input.additional;
  const subtotal = filamentCost + powerCost + extras;
  const fee = subtotal * (input.platformFeePercent / 100);
  const baseTotal = subtotal + fee;
  const salePrice = baseTotal + input.targetProfit;
  const profit = salePrice - baseTotal;
  const marginPercent = salePrice > 0 ? (profit / salePrice) * 100 : 0;
  const marginPrice = input.targetMarginPercent > 0
    ? baseTotal / (1 - input.targetMarginPercent / 100)
    : salePrice;
  return {
    filamentCost,
    powerCost,
    extras,
    subtotal,
    platformFee: fee,
    totalCost: baseTotal,
    suggestedSalePrice: Math.max(salePrice, marginPrice),
    profit,
    marginPercent
  };
}

const registerSchema = z.object({
  email: z.string().email().max(320),
  username: z.string().min(3).max(40).regex(/^[a-zA-Z0-9_-]+$/),
  password: z.string().min(10).max(128)
});

const loginSchema = z.object({
  emailOrUsername: z.string().min(3).max(320),
  password: z.string().min(1).max(128)
});

const forgotSchema = z.object({ email: z.string().email().max(320) });
const resetSchema = z.object({ token: z.string().min(20).max(256), newPassword: z.string().min(10).max(128) });

const calcSchema = z.object({
  rollPrice: z.number().nonnegative(),
  rollWeightGrams: z.number().positive(),
  usedGrams: z.number().nonnegative(),
  printHours: z.number().nonnegative(),
  electricityPerKwh: z.number().nonnegative(),
  powerWatts: z.number().nonnegative(),
  packaging: z.number().nonnegative().default(0),
  shipping: z.number().nonnegative().default(0),
  additional: z.number().nonnegative().default(0),
  platformFeePercent: z.number().min(0).max(100).default(0),
  targetProfit: z.number().nonnegative().default(0),
  targetMarginPercent: z.number().min(0).max(95).default(0)
});

const filamentSchema = z.object({
  manufacturer: z.string().min(1).max(100),
  material: z.string().min(1).max(80),
  color: z.string().min(1).max(80),
  spoolWeight: z.number().positive(),
  remainingWeight: z.number().min(0),
  purchasePrice: z.number().nonnegative(),
  purchaseDate: z.string().optional().nullable(),
  notes: z.string().max(400).optional().nullable()
});

const printerSchema = z.object({
  manufacturer: z.string().min(1).max(100),
  model: z.string().min(1).max(100),
  buildVolume: z.string().max(100).optional().nullable(),
  powerWatts: z.number().nonnegative().optional().nullable(),
  notes: z.string().max(400).optional().nullable()
});

const projectSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(1000).optional().nullable(),
  status: z.enum(['open', 'in_progress', 'done']).default('open'),
  material: z.string().max(120).optional().nullable(),
  estimatedCost: z.number().nonnegative().optional().nullable()
});

const saleSchema = z.object({
  product: z.string().min(1).max(160),
  quantity: z.number().int().positive(),
  cost: z.number().nonnegative(),
  salePrice: z.number().nonnegative(),
  saleDate: z.string().optional().nullable(),
  platform: z.string().max(80).optional().nullable(),
  customer: z.string().max(120).optional().nullable(),
  notes: z.string().max(400).optional().nullable()
});

const ideaSchema = z.object({ title: z.string().min(5).max(120), description: z.string().min(10).max(1500) });
const voteSchema = z.object({ vote: z.union([z.literal(1), z.literal(-1)]) });

function parseBody(schema, req, res) {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: 'Invalid input', details: parsed.error.flatten() });
    return null;
  }
  return parsed.data;
}

async function bootstrap() {
  await db('CREATE EXTENSION IF NOT EXISTS pgcrypto');
  await db(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT UNIQUE NOT NULL,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS printers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      manufacturer TEXT NOT NULL,
      model TEXT NOT NULL,
      build_volume TEXT,
      power_watts NUMERIC,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS filaments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      manufacturer TEXT NOT NULL,
      material TEXT NOT NULL,
      color TEXT NOT NULL,
      spool_weight NUMERIC NOT NULL,
      remaining_weight NUMERIC NOT NULL,
      purchase_price NUMERIC NOT NULL,
      purchase_date DATE,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS projects (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      material TEXT,
      estimated_cost NUMERIC,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS sales (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      product TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      cost NUMERIC NOT NULL,
      sale_price NUMERIC NOT NULL,
      profit NUMERIC NOT NULL,
      sale_date DATE,
      platform TEXT,
      customer TEXT,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS ideas (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'NEW',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS idea_votes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      idea_id UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      vote SMALLINT NOT NULL CHECK (vote IN (1, -1)),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (idea_id, user_id)
    );
  `);
}

app.get('/health', async (_req, res) => {
  await db('SELECT 1');
  res.json({ ok: true });
});

app.post('/auth/register', async (req, res) => {
  const limited = rateLimit(`register:${req.ip}`, 10, 60000);
  if (!limited) return res.status(429).json({ ok: false, error: 'Too many requests' });

  const body = parseBody(registerSchema, req, res);
  if (!body) return;

  const email = body.email.toLowerCase();
  const role = ADMIN_EMAIL && email === ADMIN_EMAIL ? 'admin' : 'user';
  const hash = await bcrypt.hash(body.password, 12);

  try {
    const result = await db(
      `INSERT INTO users (email, username, password_hash, role) VALUES ($1,$2,$3,$4)
       RETURNING id, email, username, role, status, created_at`,
      [email, body.username, hash, role]
    );
    const user = result.rows[0];
    const token = signToken(user);
    return res.status(201).json({ ok: true, user, token });
  } catch (err) {
    if (String(err.message).includes('duplicate key')) {
      return res.status(409).json({ ok: false, error: 'Email or username already in use' });
    }
    throw err;
  }
});

app.post('/auth/login', async (req, res) => {
  const limited = rateLimit(`login:${req.ip}`, 20, 60000);
  if (!limited) return res.status(429).json({ ok: false, error: 'Too many requests' });

  const body = parseBody(loginSchema, req, res);
  if (!body) return;

  const value = body.emailOrUsername.toLowerCase();
  const result = await db(
    `SELECT id, email, username, password_hash, role, status
     FROM users WHERE lower(email) = $1 OR lower(username) = $1 LIMIT 1`,
    [value]
  );
  const user = result.rows[0];
  if (!user) return res.status(401).json({ ok: false, error: 'Invalid credentials' });
  if (user.status !== 'active') return res.status(403).json({ ok: false, error: 'Account is not active' });

  const ok = await bcrypt.compare(body.password, user.password_hash);
  if (!ok) return res.status(401).json({ ok: false, error: 'Invalid credentials' });

  const token = signToken(user);
  res.json({
    ok: true,
    token,
    user: { id: user.id, email: user.email, username: user.username, role: user.role, status: user.status }
  });
});

app.post('/auth/forgot-password', async (req, res) => {
  const limited = rateLimit(`forgot:${req.ip}`, 5, 60000);
  if (!limited) return res.status(429).json({ ok: false, error: 'Too many requests' });

  const body = parseBody(forgotSchema, req, res);
  if (!body) return;

  const email = body.email.toLowerCase();
  const result = await db('SELECT id FROM users WHERE email = $1 LIMIT 1', [email]);
  if (!result.rows[0]) return res.json({ ok: true });

  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + 1000 * 60 * 30).toISOString();

  await db('UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL', [result.rows[0].id]);
  await db(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [result.rows[0].id, tokenHash, expiresAt]
  );

  return res.json({ ok: true, ...(APP_ENV !== 'production' ? { resetToken: token } : {}) });
});

app.post('/auth/reset-password', async (req, res) => {
  const body = parseBody(resetSchema, req, res);
  if (!body) return;

  const tokenHash = crypto.createHash('sha256').update(body.token).digest('hex');
  const tokenResult = await db(
    `SELECT id, user_id FROM password_reset_tokens
     WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()
     ORDER BY created_at DESC LIMIT 1`,
    [tokenHash]
  );

  const tokenRow = tokenResult.rows[0];
  if (!tokenRow) return res.status(400).json({ ok: false, error: 'Invalid or expired token' });

  const hash = await bcrypt.hash(body.newPassword, 12);
  await db('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hash, tokenRow.user_id]);
  await db('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1', [tokenRow.id]);

  return res.json({ ok: true });
});

app.post('/auth/change-password', auth, async (req, res) => {
  const schema = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(10).max(128) });
  const body = parseBody(schema, req, res);
  if (!body) return;

  const result = await db('SELECT password_hash FROM users WHERE id = $1', [req.user.sub]);
  const row = result.rows[0];
  if (!row) return res.status(404).json({ ok: false, error: 'User not found' });

  const ok = await bcrypt.compare(body.currentPassword, row.password_hash);
  if (!ok) return res.status(401).json({ ok: false, error: 'Current password invalid' });

  const hash = await bcrypt.hash(body.newPassword, 12);
  await db('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hash, req.user.sub]);
  return res.json({ ok: true });
});

app.get('/me', auth, async (req, res) => {
  const result = await db('SELECT id, email, username, role, status, created_at FROM users WHERE id = $1', [req.user.sub]);
  const user = result.rows[0];
  if (!user) return res.status(404).json({ ok: false, error: 'User not found' });
  return res.json({ ok: true, user });
});

app.post('/calculator/cost', auth, async (req, res) => {
  const body = parseBody(calcSchema, req, res);
  if (!body) return;
  const out = calculateCosts(body);
  res.json({ ok: true, result: out });
});

function crudRoutes(pathName, schema, table, fields, mapIn, mapOut = (x) => x) {
  app.get(`/${pathName}`, auth, async (req, res) => {
    const result = await db(`SELECT * FROM ${table} WHERE user_id = $1 ORDER BY created_at DESC`, [req.user.sub]);
    res.json({ ok: true, items: result.rows.map(mapOut) });
  });

  app.post(`/${pathName}`, auth, async (req, res) => {
    const body = parseBody(schema, req, res);
    if (!body) return;
    const valuesObj = mapIn(body);
    const cols = Object.keys(valuesObj);
    const vals = Object.values(valuesObj);
    const placeholders = cols.map((_, i) => `$${i + 2}`).join(',');
    const q = `INSERT INTO ${table} (user_id, ${cols.join(',')}) VALUES ($1, ${placeholders}) RETURNING *`;
    const result = await db(q, [req.user.sub, ...vals]);
    res.status(201).json({ ok: true, item: mapOut(result.rows[0]) });
  });

  app.put(`/${pathName}/:id`, auth, async (req, res) => {
    const body = parseBody(schema, req, res);
    if (!body) return;
    const valuesObj = mapIn(body);
    const cols = Object.keys(valuesObj);
    const vals = Object.values(valuesObj);
    const setClause = cols.map((c, i) => `${c} = $${i + 1}`).join(', ');
    const q = `UPDATE ${table} SET ${setClause} WHERE id = $${cols.length + 1} AND user_id = $${cols.length + 2} RETURNING *`;
    const result = await db(q, [...vals, req.params.id, req.user.sub]);
    if (!result.rows[0]) return res.status(404).json({ ok: false, error: 'Not found' });
    res.json({ ok: true, item: mapOut(result.rows[0]) });
  });

  app.delete(`/${pathName}/:id`, auth, async (req, res) => {
    const result = await db(`DELETE FROM ${table} WHERE id = $1 AND user_id = $2 RETURNING id`, [req.params.id, req.user.sub]);
    if (!result.rows[0]) return res.status(404).json({ ok: false, error: 'Not found' });
    res.json({ ok: true });
  });
}

crudRoutes(
  'filaments',
  filamentSchema,
  'filaments',
  ['manufacturer', 'material', 'color', 'spool_weight', 'remaining_weight', 'purchase_price', 'purchase_date', 'notes'],
  (b) => ({
    manufacturer: b.manufacturer,
    material: b.material,
    color: b.color,
    spool_weight: b.spoolWeight,
    remaining_weight: b.remainingWeight,
    purchase_price: b.purchasePrice,
    purchase_date: b.purchaseDate || null,
    notes: b.notes || null
  }),
  (r) => ({
    ...r,
    spoolWeight: Number(r.spool_weight),
    remainingWeight: Number(r.remaining_weight),
    purchasePrice: Number(r.purchase_price),
    pricePerGram: Number(r.purchase_price) / Number(r.spool_weight || 1),
    remainingValue: (Number(r.purchase_price) / Number(r.spool_weight || 1)) * Number(r.remaining_weight)
  })
);

crudRoutes(
  'printers',
  printerSchema,
  'printers',
  ['manufacturer', 'model', 'build_volume', 'power_watts', 'notes'],
  (b) => ({
    manufacturer: b.manufacturer,
    model: b.model,
    build_volume: b.buildVolume || null,
    power_watts: b.powerWatts ?? null,
    notes: b.notes || null
  }),
  (r) => ({ ...r, powerWatts: r.power_watts === null ? null : Number(r.power_watts) })
);

crudRoutes(
  'projects',
  projectSchema,
  'projects',
  ['name', 'description', 'status', 'material', 'estimated_cost'],
  (b) => ({
    name: b.name,
    description: b.description || null,
    status: b.status,
    material: b.material || null,
    estimated_cost: b.estimatedCost ?? null
  }),
  (r) => ({ ...r, estimatedCost: r.estimated_cost === null ? null : Number(r.estimated_cost) })
);

crudRoutes(
  'sales',
  saleSchema,
  'sales',
  ['product', 'quantity', 'cost', 'sale_price', 'profit', 'sale_date', 'platform', 'customer', 'notes'],
  (b) => ({
    product: b.product,
    quantity: b.quantity,
    cost: b.cost,
    sale_price: b.salePrice,
    profit: b.salePrice - b.cost,
    sale_date: b.saleDate || null,
    platform: b.platform || null,
    customer: b.customer || null,
    notes: b.notes || null
  }),
  (r) => ({
    ...r,
    cost: Number(r.cost),
    salePrice: Number(r.sale_price),
    profit: Number(r.profit)
  })
);

app.get('/dashboard/summary', auth, async (req, res) => {
  const uid = req.user.sub;
  const [sales, projects, filaments] = await Promise.all([
    db(`SELECT COALESCE(SUM(sale_price),0) as revenue,
               COALESCE(SUM(cost),0) as cost,
               COALESCE(SUM(profit),0) as profit,
               COUNT(*) as count
        FROM sales WHERE user_id = $1`, [uid]),
    db(`SELECT COUNT(*) FILTER (WHERE status != 'done') as open_count FROM projects WHERE user_id = $1`, [uid]),
    db(`SELECT COALESCE(SUM(remaining_weight),0) as remaining_grams FROM filaments WHERE user_id = $1`, [uid])
  ]);

  res.json({
    ok: true,
    summary: {
      revenue: Number(sales.rows[0].revenue),
      cost: Number(sales.rows[0].cost),
      profit: Number(sales.rows[0].profit),
      salesCount: Number(sales.rows[0].count),
      openProjects: Number(projects.rows[0].open_count),
      filamentStockGrams: Number(filaments.rows[0].remaining_grams)
    }
  });
});

app.get('/ideas', auth, async (req, res) => {
  const rows = await db(
    `SELECT i.id, i.title, i.description, i.status, i.created_at, u.username,
            COALESCE(SUM(v.vote),0) as score,
            COALESCE(MAX(CASE WHEN v.user_id = $1 THEN v.vote ELSE NULL END),0) as user_vote
     FROM ideas i
     JOIN users u ON u.id = i.user_id
     LEFT JOIN idea_votes v ON v.idea_id = i.id
     GROUP BY i.id, u.username
     ORDER BY score DESC, i.created_at DESC`,
    [req.user.sub]
  );
  res.json({ ok: true, items: rows.rows });
});

app.post('/ideas', auth, async (req, res) => {
  const body = parseBody(ideaSchema, req, res);
  if (!body) return;

  const duplicate = await db(
    `SELECT id, title FROM ideas
     WHERE similarity(lower(title), lower($1)) > 0.5
        OR lower(title) = lower($1)
     ORDER BY created_at DESC LIMIT 1`,
    [body.title]
  ).catch(() => ({ rows: [] }));

  if (duplicate.rows[0]) {
    return res.status(409).json({ ok: false, error: 'Ähnlicher Vorschlag existiert bereits.', existing: duplicate.rows[0] });
  }

  const result = await db(
    `INSERT INTO ideas (user_id, title, description) VALUES ($1, $2, $3) RETURNING *`,
    [req.user.sub, body.title, body.description]
  );
  res.status(201).json({ ok: true, item: result.rows[0] });
});

app.post('/ideas/:id/vote', auth, async (req, res) => {
  const body = parseBody(voteSchema, req, res);
  if (!body) return;

  const idea = await db('SELECT id FROM ideas WHERE id = $1', [req.params.id]);
  if (!idea.rows[0]) return res.status(404).json({ ok: false, error: 'Idea not found' });

  await db(
    `INSERT INTO idea_votes (idea_id, user_id, vote)
     VALUES ($1, $2, $3)
     ON CONFLICT (idea_id, user_id)
     DO UPDATE SET vote = EXCLUDED.vote, created_at = NOW()`,
    [req.params.id, req.user.sub, body.vote]
  );

  res.json({ ok: true });
});

app.patch('/ideas/:id/status', auth, requireAdmin, async (req, res) => {
  const schema = z.object({
    status: z.enum(['NEW', 'REVIEWING', 'PLANNED', 'IN_DEVELOPMENT', 'IMPLEMENTED', 'REJECTED'])
  });
  const body = parseBody(schema, req, res);
  if (!body) return;

  const result = await db('UPDATE ideas SET status = $1 WHERE id = $2 RETURNING *', [body.status, req.params.id]);
  if (!result.rows[0]) return res.status(404).json({ ok: false, error: 'Idea not found' });
  res.json({ ok: true, item: result.rows[0] });
});

app.get('/admin/users', auth, requireAdmin, async (_req, res) => {
  const result = await db('SELECT id, email, username, role, status, created_at FROM users ORDER BY created_at DESC');
  res.json({ ok: true, items: result.rows });
});

app.patch('/admin/users/:id/status', auth, requireAdmin, async (req, res) => {
  const schema = z.object({ status: z.enum(['active', 'blocked']) });
  const body = parseBody(schema, req, res);
  if (!body) return;

  const result = await db('UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING id, email, username, role, status', [body.status, req.params.id]);
  if (!result.rows[0]) return res.status(404).json({ ok: false, error: 'User not found' });
  res.json({ ok: true, item: result.rows[0] });
});

app.use((err, _req, res, _next) => {
  if (err.message === 'Origin not allowed') return res.status(403).json({ ok: false, error: 'Origin not allowed' });
  console.error(err);
  return res.status(500).json({ ok: false, error: 'Internal server error' });
});

bootstrap()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`PrintProfit3D backend listening on ${PORT}`);
    });
  })
  .catch((e) => {
    console.error('Failed to bootstrap backend', e);
    process.exit(1);
  });
