const express = require('express');
const { query } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

// GET /api/dashboard/stats - Dashboard statistics
router.get('/stats', requireRole('issuer', 'holder', 'inspector', 'regulator'), async (req, res, next) => {
  try {
    // Asset counts by status
    let assetSql = `SELECT status, COUNT(*)::int as count FROM compliance_assets`;
    const assetParams = [];
    let aIdx = 1;

    if (req.user.role === 'issuer') {
      assetSql += ` WHERE issuer_id = $${aIdx++}`;
      assetParams.push(req.user.userId);
    } else if (req.user.role === 'holder') {
      assetSql += ` WHERE current_holder_id = $${aIdx++}`;
      assetParams.push(req.user.userId);
    }

    assetSql += ` GROUP BY status ORDER BY count DESC`;
    const statusCounts = await query(assetSql, assetParams);

    // Event type counts
    let eventSql = `SELECT event_type, COUNT(*)::int as count FROM asset_events e JOIN compliance_assets a ON e.asset_id = a.id`;
    const eventParams = [];
    let eIdx = 1;

    if (req.user.role === 'issuer') {
      eventSql += ` WHERE a.issuer_id = $${eIdx++}`;
      eventParams.push(req.user.userId);
    } else if (req.user.role === 'holder') {
      eventSql += ` WHERE a.current_holder_id = $${eIdx++}`;
      eventParams.push(req.user.userId);
    }

    eventSql += ` GROUP BY event_type ORDER BY count DESC`;
    const eventCounts = await query(eventSql, eventParams);

    // Recent assets
    let recentSql = `
      SELECT a.id, a.asset_type, a.title, a.status, a.location,
             a.created_at, u.email as issuer_email, u.full_name as issuer_name,
             uh.email as holder_email, uh.full_name as holder_name
      FROM compliance_assets a
      JOIN users u ON a.issuer_id = u.id
      JOIN users uh ON a.current_holder_id = uh.id
    `;
    const recentParams = [];
    let rIdx = 1;

    if (req.user.role === 'issuer') {
      recentSql += ` WHERE a.issuer_id = $${rIdx++}`;
      recentParams.push(req.user.userId);
    } else if (req.user.role === 'holder') {
      recentSql += ` WHERE a.current_holder_id = $${rIdx++}`;
      recentParams.push(req.user.userId);
    }

    recentSql += ` ORDER BY a.created_at DESC LIMIT 5`;
    const recentAssets = await query(recentSql, recentParams);

    // Asset types breakdown
    let typeSql = `SELECT asset_type, COUNT(*)::int as count FROM compliance_assets`;
    const typeParams = [];
    let tIdx = 1;

    if (req.user.role === 'issuer') {
      typeSql += ` WHERE issuer_id = $${tIdx++}`;
      typeParams.push(req.user.userId);
    } else if (req.user.role === 'holder') {
      typeSql += ` WHERE current_holder_id = $${tIdx++}`;
      typeParams.push(req.user.userId);
    }

    typeSql += ` GROUP BY asset_type ORDER BY count DESC`;
    const typeCounts = await query(typeSql, typeParams);

    res.json({
      asset_status_counts: statusCounts.rows,
      event_type_counts: eventCounts.rows,
      recent_assets: recentAssets.rows,
      asset_type_counts: typeCounts.rows,
      total_assets: statusCounts.rows.reduce((sum, r) => sum + r.count, 0),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/dashboard/recent-events - Recent activity feed
router.get('/recent-events', requireRole('issuer', 'holder', 'inspector', 'regulator'), async (req, res, next) => {
  try {
    let sql = `
      SELECT e.*, a.asset_type, a.title as asset_title, a.status as asset_status,
             u.full_name as actor_name, u.email as actor_email,
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

    sql += ` ORDER BY e.created_at DESC LIMIT 20`;
    const events = await query(sql, params);

    res.json(events.rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
