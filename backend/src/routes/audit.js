const express = require('express');
const { query } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');

const router = express.Router();

router.use(authenticate);

// ─── LIST ALL EVENTS (regulators & inspectors get all, others get their own) ───

router.get('/', requireRole('issuer', 'holder', 'inspector', 'regulator'), async (req, res, next) => {
  try {
    let sql = `
      SELECT e.*, a.asset_type, a.title as asset_title, a.status as asset_status,
             u.full_name as actor_name, u.email as actor_email, u.organization as actor_org,
             r.name as actor_role_label
      FROM asset_events e
      JOIN compliance_assets a ON e.asset_id = a.id
      JOIN users u ON e.actor_id = u.id
      LEFT JOIN (SELECT 'issuer' as name, '🏢 Issuer' as label UNION ALL
                 SELECT 'holder', '📦 Holder' UNION ALL
                 SELECT 'inspector', '🔍 Inspector' UNION ALL
                 SELECT 'regulator', '📋 Regulator') r ON e.actor_role = r.name
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;

    if (req.user.role === 'issuer') {
      sql += ` AND a.issuer_id = $${idx++}`;
      params.push(req.user.userId);
    } else if (req.user.role === 'holder') {
      sql += ` AND a.current_holder_id = $${idx++}`;
      params.push(req.user.userId);
    }
    // inspectors & regulators see all

    if (req.query.asset_id) {
      sql += ` AND e.asset_id = $${idx++}`;
      params.push(req.query.asset_id);
    }
    if (req.query.event_type) {
      sql += ` AND e.event_type = $${idx++}`;
      params.push(req.query.event_type);
    }
    if (req.query.from_date) {
      sql += ` AND e.created_at >= $${idx++}`;
      params.push(req.query.from_date);
    }
    if (req.query.to_date) {
      sql += ` AND e.created_at <= $${idx++}`;
      params.push(req.query.to_date);
    }

    sql += ` ORDER BY e.created_at DESC LIMIT 500`;

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// ─── EXPORT AUDIT LOG AS JSON ───

router.get('/export', requireRole('issuer', 'holder', 'inspector', 'regulator'), async (req, res, next) => {
  try {
    let sql = `
      SELECT e.*, a.asset_type, a.title as asset_title, a.status as asset_status,
             u.full_name as actor_name, u.email as actor_email, u.organization as actor_org,
             r.name as actor_role_label
      FROM asset_events e
      JOIN compliance_assets a ON e.asset_id = a.id
      JOIN users u ON e.actor_id = u.id
      LEFT JOIN (SELECT 'issuer' as name, 'Issuer' as label UNION ALL
                 SELECT 'holder', 'Holder' UNION ALL
                 SELECT 'inspector', 'Inspector' UNION ALL
                 SELECT 'regulator', 'Regulator') r ON e.actor_role = r.name
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;

    if (req.user.role === 'issuer') {
      sql += ` AND a.issuer_id = $${idx++}`;
      params.push(req.user.userId);
    } else if (req.user.role === 'holder') {
      sql += ` AND a.current_holder_id = $${idx++}`;
      params.push(req.user.userId);
    }

    if (req.query.asset_id) {
      sql += ` AND e.asset_id = $${idx++}`;
      params.push(req.query.asset_id);
    }
    if (req.query.event_type) {
      sql += ` AND e.event_type = $${idx++}`;
      params.push(req.query.event_type);
    }
    if (req.query.from_date) {
      sql += ` AND e.created_at >= $${idx++}`;
      params.push(req.query.from_date);
    }
    if (req.query.to_date) {
      sql += ` AND e.created_at <= $${idx++}`;
      params.push(req.query.to_date);
    }

    sql += ` ORDER BY e.created_at DESC`;

    const result = await query(sql, params);

    const exportData = {
      exported_at: new Date().toISOString(),
      exported_by: req.user.email,
      total_events: result.rows.length,
      events: result.rows.map(e => ({
        id: e.id,
        asset_id: e.asset_id,
        asset_type: e.asset_type,
        asset_title: e.asset_title,
        asset_status: e.asset_status,
        event_type: e.event_type,
        description: e.event_description,
        actor_name: e.actor_name,
        actor_email: e.actor_email,
        actor_role: e.actor_role_label,
        actor_org: e.actor_org,
        metadata: e.metadata,
        timestamp: e.created_at,
      })),
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="audit-export-${Date.now()}.json"`);
    res.json(exportData);
  } catch (err) {
    next(err);
  }
});

// ─── AUDIT SUMMARY ───

router.get('/summary', requireRole('issuer', 'holder', 'inspector', 'regulator'), async (req, res, next) => {
  try {
    let sql = `
      SELECT 
        COUNT(*) as total_events,
        COUNT(DISTINCT e.asset_id) as total_assets,
        COUNT(DISTINCT e.actor_id) as total_actors
      FROM asset_events e
      JOIN compliance_assets a ON e.asset_id = a.id
    `;
    const params = [];
    let idx = 1;

    if (req.user.role === 'issuer') {
      sql += ` WHERE a.issuer_id = $${idx++}`;
      params.push(req.user.userId);
    } else if (req.user.role === 'holder') {
      sql += ` WHERE a.current_holder_id = $${idx++}`;
      params.push(req.user.userId);
    }

    const summary = await query(sql, params);
    const rows = summary.rows[0];

    // Event type breakdown
    let typeSql = `
      SELECT event_type, COUNT(*) as count
      FROM asset_events e
      JOIN compliance_assets a ON e.asset_id = a.id
    `;
    const typeParams = [];
    let tIdx = 1;
    if (req.user.role === 'issuer') {
      typeSql += ` WHERE a.issuer_id = $${tIdx++}`;
      typeParams.push(req.user.userId);
    } else if (req.user.role === 'holder') {
      typeSql += ` WHERE a.current_holder_id = $${tIdx++}`;
      typeParams.push(req.user.userId);
    }
    typeSql += ` GROUP BY event_type ORDER BY count DESC`;

    const typeBreakdown = await query(typeSql, typeParams);

    res.json({
      total_events: rows.total_events,
      total_assets: rows.total_assets,
      total_actors: rows.total_actors,
      event_types: typeBreakdown.rows,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
