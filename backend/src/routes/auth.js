const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../db');
const { generateToken, authenticate, requireRole } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');

const router = express.Router();

// POST /api/auth/register - Register a new user
router.post('/register', async (req, res, next) => {
  try {
    const { email, password, full_name, role, organization } = req.body;
    if (!email || !password || !full_name || !role) {
      throw new AppError('email, password, full_name, and role are required', 400);
    }
    if (!['issuer', 'holder', 'inspector', 'regulator'].includes(role)) {
      throw new AppError('Invalid role. Must be issuer, holder, inspector, or regulator', 400);
    }

    // Check if user exists
    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      throw new AppError('Email already registered', 409);
    }

    // Get role ID
    const roleRes = await query('SELECT id FROM roles WHERE name = $1', [role]);
    if (roleRes.rows.length === 0) {
      throw new AppError('Role not found', 400);
    }
    const roleId = roleRes.rows[0].id;

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user
    const result = await query(
      `INSERT INTO users (email, password_hash, full_name, role_id, organization)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, full_name, role_id, organization, created_at`,
      [email, passwordHash, full_name, roleId, organization || null]
    );

    const user = result.rows[0];
    const token = generateToken({ id: user.id, role, email: user.email });

    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role,
        organization: user.organization,
      },
      token,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login - Login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      throw new AppError('Email and password are required', 400);
    }

    const result = await query(
      `SELECT u.id, u.email, u.full_name, u.organization, u.password_hash, r.name as role
       FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE u.email = $1 AND u.is_active = true`,
      [email]
    );

    if (result.rows.length === 0) {
      throw new AppError('Invalid email or password', 401);
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      throw new AppError('Invalid email or password', 401);
    }

    const token = generateToken({ id: user.id, role: user.role, email: user.email });

    res.json({
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        organization: user.organization,
      },
      token,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me - Current user
router.get('/me', authenticate, requireRole('issuer', 'holder', 'inspector', 'regulator'), async (req, res, next) => {
  try {
    const result = await query(
      `SELECT u.id, u.email, u.full_name, u.organization, r.name as role
       FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE u.id = $1`,
      [req.user.userId]
    );
    if (result.rows.length === 0) {
      throw new AppError('User not found', 404);
    }
    const user = result.rows[0];
    res.json({
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      organization: user.organization,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/roles - Available roles (for registration)
router.get('/roles', (req, res) => {
  res.json([
    { value: 'issuer', label: 'Issuer', description: 'Enterprise that creates compliance assets' },
    { value: 'holder', label: 'Holder', description: 'Entity that holds compliance assets' },
    { value: 'inspector', label: 'Inspector', description: 'Verifies and updates asset status' },
    { value: 'regulator', label: 'Regulator', description: 'Read-only audit access' },
  ]);
});

module.exports = router;
