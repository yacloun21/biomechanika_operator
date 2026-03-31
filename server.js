const path = require('path');
const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
require('dotenv').config();

const PORT = Number(process.env.PORT || 3000);
const DATABASE_URL = process.env.DATABASE_URL;
const TOKEN_SECRET = process.env.JWT_SECRET || 'change_me';
const TOKEN_TTL_SECONDS = 60 * 60 * 24;

if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env and set your PostgreSQL connection string.');
  process.exit(1);
}

function resolvePgSsl(connectionString) {
  if (process.env.PGSSL === 'disable') return false;
  if (process.env.PGSSL === 'require') return { rejectUnauthorized: false };
  const looksLocal = /(localhost|127\.0\.0\.1)/i.test(connectionString);
  return looksLocal ? false : { rejectUnauthorized: false };
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: resolvePgSsl(DATABASE_URL)
});

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function calculateHealthIndex(weight, height) {
  const w = Number(weight);
  const h = Number(height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  const meters = h / 100;
  const bmi = w / (meters * meters);
  return Number(bmi.toFixed(1));
}

function parseMetricValue(value) {
  if (value === '' || value === null || value === undefined) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function base64UrlEncode(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(input) {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (normalized.length % 4)) % 4;
  return Buffer.from(normalized + '='.repeat(padLength), 'base64').toString('utf8');
}

function signToken(payload) {
  const body = base64UrlEncode(JSON.stringify(payload));
  const signature = crypto
    .createHmac('sha256', TOKEN_SECRET)
    .update(body)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${body}.${signature}`;
}

function verifyToken(token) {
  if (!token || !token.includes('.')) return null;
  const [body, signature] = token.split('.');
  const expectedSignature = crypto
    .createHmac('sha256', TOKEN_SECRET)
    .update(body)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  if (signature !== expectedSignature) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(body));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function createOperatorToken(operator) {
  const now = Math.floor(Date.now() / 1000);
  return signToken({
    sub: operator.id,
    login: operator.login,
    role: operator.role,
    exp: now + TOKEN_TTL_SECONDS
  });
}

function getBearerToken(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  return header.slice(7).trim();
}

async function authMiddleware(req, res, next) {
  const token = getBearerToken(req);
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }

  try {
    const { rows } = await pool.query(
      'SELECT id, login, role FROM operators WHERE id = $1',
      [payload.sub]
    );

    if (!rows.length) {
      return res.status(401).json({ error: 'Оператор не найден' });
    }

    req.operator = rows[0];
    next();
  } catch (error) {
    next(error);
  }
}

async function withTransaction(handler) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await handler(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function buildUsersResponse(usersRows, measurementRows) {
  const historyByUser = new Map();

  for (const row of measurementRows) {
    if (!historyByUser.has(row.user_id)) {
      historyByUser.set(row.user_id, {
        heightHistory: [],
        weightHistory: [],
        bmiHistory: []
      });
    }

    const target = historyByUser.get(row.user_id);
    if (row.height !== null) target.heightHistory.push(Number(row.height));
    if (row.weight !== null) target.weightHistory.push(Number(row.weight));
    if (row.health_index !== null) target.bmiHistory.push(Number(row.health_index));
  }

  return usersRows.map((user) => {
    const history = historyByUser.get(user.id) || {
      heightHistory: [],
      weightHistory: [],
      bmiHistory: []
    };

    return {
      id: Number(user.id),
      fullName: user.full_name,
      group: user.study_group,
      photo: user.photo_url || '',
      weight: user.current_weight === null ? null : Number(user.current_weight),
      height: user.current_height === null ? null : Number(user.current_height),
      healthIndex: user.current_health_index === null ? null : Number(user.current_health_index),
      healthGroup: user.health_group,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
      heightHistory: history.heightHistory,
      weightHistory: history.weightHistory,
      bmiHistory: history.bmiHistory
    };
  });
}

async function fetchUsersDetailed(client) {
  const usersResult = await client.query(`
    SELECT
      id,
      full_name,
      study_group,
      photo_url,
      health_group,
      current_weight,
      current_height,
      current_health_index,
      created_at,
      updated_at
    FROM users
    ORDER BY created_at DESC, id DESC
  `);

  const measurementsResult = await client.query(`
    SELECT user_id, weight, height, health_index, measured_at
    FROM user_measurements
    ORDER BY measured_at ASC, id ASC
  `);

  return buildUsersResponse(usersResult.rows, measurementsResult.rows);
}

app.get('/api/health', async (req, res, next) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, database: 'postgresql' });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const login = String(req.body.login || '').trim();
    const password = String(req.body.password || '');

    if (!login || !password) {
      return res.status(400).json({ error: 'Введите логин и пароль' });
    }

    const { rows } = await pool.query(
      'SELECT id, login, password_hash, role FROM operators WHERE login = $1 LIMIT 1',
      [login]
    );

    if (!rows.length) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }

    const operator = rows[0];
    const passwordMatches = await bcrypt.compare(password, operator.password_hash);
    if (!passwordMatches) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }

    const token = createOperatorToken(operator);

    res.json({
      token,
      operator: {
        id: Number(operator.id),
        login: operator.login,
        role: operator.role
      }
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/users', authMiddleware, async (req, res, next) => {
  try {
    const users = await fetchUsersDetailed(pool);
    res.json({ users });
  } catch (error) {
    next(error);
  }
});

app.post('/api/users', authMiddleware, async (req, res, next) => {
  try {
    const payload = req.body || {};
    const fullName = String(payload.fullName || '').trim();
    const studyGroup = String(payload.group || '').trim();
    const photoUrl = String(payload.photo || '').trim() || null;
    const healthGroup = String(payload.healthGroup || 'Основная').trim() || 'Основная';
    const weight = parseMetricValue(payload.weight);
    const height = parseMetricValue(payload.height);
    const healthIndex = calculateHealthIndex(weight, height);

    if (!fullName || !studyGroup) {
      return res.status(400).json({ error: 'ФИО и группа обязательны' });
    }

    const createdUser = await withTransaction(async (client) => {
      const userInsert = await client.query(
        `INSERT INTO users (
          full_name,
          study_group,
          photo_url,
          health_group,
          current_weight,
          current_height,
          current_health_index
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id`,
        [fullName, studyGroup, photoUrl, healthGroup, weight, height, healthIndex]
      );

      const userId = userInsert.rows[0].id;

      if (weight !== null || height !== null || healthIndex !== null) {
        await client.query(
          `INSERT INTO user_measurements (user_id, operator_id, weight, height, health_index)
           VALUES ($1, $2, $3, $4, $5)`,
          [userId, req.operator.id, weight, height, healthIndex]
        );
      }

      return userId;
    });

    const users = await fetchUsersDetailed(pool);
    const user = users.find((item) => item.id === Number(createdUser));
    res.status(201).json({ user });
  } catch (error) {
    next(error);
  }
});

app.put('/api/users/:id', authMiddleware, async (req, res, next) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ error: 'Некорректный ID пользователя' });
    }

    const payload = req.body || {};
    const fullName = String(payload.fullName || '').trim();
    const studyGroup = String(payload.group || '').trim();
    const photoUrl = String(payload.photo || '').trim() || null;
    const healthGroup = String(payload.healthGroup || 'Основная').trim() || 'Основная';
    const weight = parseMetricValue(payload.weight);
    const height = parseMetricValue(payload.height);
    const healthIndex = calculateHealthIndex(weight, height);

    if (!fullName || !studyGroup) {
      return res.status(400).json({ error: 'ФИО и группа обязательны' });
    }

    await withTransaction(async (client) => {
      const existingResult = await client.query(
        `SELECT id, current_weight, current_height, current_health_index
         FROM users WHERE id = $1 LIMIT 1`,
        [userId]
      );

      if (!existingResult.rows.length) {
        const notFoundError = new Error('Пользователь не найден');
        notFoundError.statusCode = 404;
        throw notFoundError;
      }

      const existing = existingResult.rows[0];

      await client.query(
        `UPDATE users
         SET full_name = $1,
             study_group = $2,
             photo_url = $3,
             health_group = $4,
             current_weight = $5,
             current_height = $6,
             current_health_index = $7
         WHERE id = $8`,
        [fullName, studyGroup, photoUrl, healthGroup, weight, height, healthIndex, userId]
      );

      const metricsChanged =
        Number(existing.current_weight ?? null) !== Number(weight ?? null) ||
        Number(existing.current_height ?? null) !== Number(height ?? null) ||
        Number(existing.current_health_index ?? null) !== Number(healthIndex ?? null);

      if (metricsChanged && (weight !== null || height !== null || healthIndex !== null)) {
        await client.query(
          `INSERT INTO user_measurements (user_id, operator_id, weight, height, health_index)
           VALUES ($1, $2, $3, $4, $5)`,
          [userId, req.operator.id, weight, height, healthIndex]
        );
      }
    });

    const users = await fetchUsersDetailed(pool);
    const user = users.find((item) => item.id === userId);
    res.json({ user });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/users/:id', authMiddleware, async (req, res, next) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ error: 'Некорректный ID пользователя' });
    }

    const result = await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((error, req, res, next) => {
  console.error(error);
  const statusCode = error.statusCode || 500;
  res.status(statusCode).json({
    error: statusCode === 500 ? 'Внутренняя ошибка сервера' : error.message
  });
});

app.listen(PORT, () => {
  console.log(`SportLab Operator server started on http://localhost:${PORT}`);
});
