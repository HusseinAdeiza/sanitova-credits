const express = require('express');
const { query } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');

const router = express.Router();

// ─── PUBLIC / STATIC ROUTES (must be registered before router.use(authenticate)
// and before /:id so they aren't shadowed or auth-walled) ────────

// GET /api/assets/types - Available asset types
router.get('/types', authenticate, requireRole('issuer', 'holder', 'inspector', 'regulator'), (req, res) => {
  res.json([
    { value: 'Sanitation Inspection Certificate', label: 'Sanitation Inspection Certificate' },
    { value: 'WASH Facility Verification', label: 'WASH Facility Verification' },
    { value: 'Waste Compliance Certificate', label: 'Waste Compliance Certificate' },
    { value: 'Environmental Health Audit Asset', label: 'Environmental Health Audit Asset' },
    { value: 'Water Quality Compliance', label: 'Water Quality Compliance' },
    { value: 'Food Safety Certification', label: 'Food Safety Certification' },
  ]);
});

// GET /api/assets/statuses - Available statuses (public)
router.get('/statuses', (req, res) => {
  res.json([
    { value: 'created', label: '📝 Created', description: 'Asset has been created' },
    { value: 'pending_review', label: '⏳ Pending Review', description: 'Awaiting inspection' },
    { value: 'in_review', label: '🔍 In Review', description: 'Under active review' },
    { value: 'verified', label: '✅ Verified', description: 'Inspection passed - fully verified' },
    { value: 'suspended', label: '⛔ Suspended', description: 'Compliance suspended' },
    { value: 'expired', label: '⏰ Expired', description: 'Certificate expired' },
  ]);
});

// Recipient directory for issuer transfers; expose only selection fields.
router.get('/holders', authenticate, requireRole('issuer'), async (req, res, next) => {
  try {
    const result = await query(`
      SELECT u.id, u.full_name, u.organization
      FROM users u JOIN roles r ON u.role_id = r.id
      WHERE u.is_active = true AND r.name = 'holder'
      ORDER BY u.full_name, u.id
    `);
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// All other asset routes require auth
router.use(authenticate);

// ─── HELPERS ───────────────────────────────────────────────

async function createAssetEvent(assetId, eventType, description, actorId, actorRole, metadata = {}) {
  await query(
    `INSERT INTO asset_events (asset_id, event_type, event_description, actor_id, actor_role, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [assetId, eventType, description, actorId, actorRole, JSON.stringify(metadata)]
  );
}

async function createStatusHistory(assetId, status, changedBy, metadata = {}) {
  await query(
    `INSERT INTO asset_status_history (asset_id, status, changed_by, metadata)
     VALUES ($1, $2, $3, $4)`,
    [assetId, status, changedBy, JSON.stringify(metadata)]
  );
}

// ─── ROUTES ────────────────────────────────────────────────

// GET /api/assets - List assets (filtered by role)
router.get('/', requireRole('issuer', 'holder', 'inspector', 'regulator'), async (req, res, next) => {
  try {
    let sql = `
      SELECT a.*, u_full.email as issuer_email, u_full.full_name as issuer_name,
             u_hold.email as holder_email, u_hold.full_name as holder_name,
             r.name as status_label
      FROM compliance_assets a
      JOIN users u_full ON a.issuer_id = u_full.id
      JOIN users u_hold ON a.current_holder_id = u_hold.id
      LEFT JOIN (SELECT 'verified' as name, '✅ Verified' as label UNION ALL
                 SELECT 'pending_review', '⏳ Pending Review' UNION ALL
                 SELECT 'in_review', '🔍 In Review' UNION ALL
                 SELECT 'suspended', '⛔ Suspended' UNION ALL
                 SELECT 'expired', '⏰ Expired' UNION ALL
                 SELECT 'created', '📝 Created') r ON a.status = r.name
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;

    // Role-based filtering
    if (req.user.role === 'issuer') {
      sql += ` AND a.issuer_id = $${idx++}`;
      params.push(req.user.userId);
    } else if (req.user.role === 'holder') {
      sql += ` AND a.current_holder_id = $${idx++}`;
      params.push(req.user.userId);
    } else if (req.user.role === 'inspector') {
      // Inspectors can see all assets
    } else if (req.user.role === 'regulator') {
      // Regulators can see all assets
    }

    // Status filter
    if (req.query.status) {
      sql += ` AND a.status = $${idx++}`;
      params.push(req.query.status);
    }

    // Type filter
    if (req.query.type) {
      sql += ` AND a.asset_type = $${idx++}`;
      params.push(req.query.type);
    }

    sql += ` ORDER BY a.created_at DESC`;

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/assets/:id - Asset detail
router.get('/:id', requireRole('issuer', 'holder', 'inspector', 'regulator'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await query(`
      SELECT a.*, u_full.email as issuer_email, u_full.full_name as issuer_name, u_full.organization as issuer_org,
             u_hold.email as holder_email, u_hold.full_name as holder_name, u_hold.organization as holder_org,
             r.name as status_label
      FROM compliance_assets a
      JOIN users u_full ON a.issuer_id = u_full.id
      JOIN users u_hold ON a.current_holder_id = u_hold.id
      LEFT JOIN (SELECT 'verified' as name, '✅ Verified' as label UNION ALL
                 SELECT 'pending_review', '⏳ Pending Review' UNION ALL
                 SELECT 'in_review', '🔍 In Review' UNION ALL
                 SELECT 'suspended', '⛔ Suspended' UNION ALL
                 SELECT 'expired', '⏰ Expired' UNION ALL
                 SELECT 'created', '📝 Created') r ON a.status = r.name
      WHERE a.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      throw new AppError('Asset not found', 404);
    }

    // Get status history
    const history = await query(`
      SELECT h.*, u.full_name as changed_by_name, u.email as changed_by_email, r.name as status_label
      FROM asset_status_history h
      JOIN users u ON h.changed_by = u.id
      LEFT JOIN (SELECT 'verified' as name, '✅ Verified' as label UNION ALL
                 SELECT 'pending_review', '⏳ Pending Review' UNION ALL
                 SELECT 'in_review', '🔍 In Review' UNION ALL
                 SELECT 'suspended', '⛔ Suspended' UNION ALL
                 SELECT 'expired', '⏰ Expired' UNION ALL
                 SELECT 'created', '📝 Created') r ON h.status = r.name
      WHERE h.asset_id = $1
      ORDER BY h.changed_at DESC
    `, [id]);

    // Get events
    const events = await query(`
      SELECT e.*, u.full_name as actor_name, u.email as actor_email
      FROM asset_events e
      JOIN users u ON e.actor_id = u.id
      WHERE e.asset_id = $1
      ORDER BY e.created_at DESC
    `, [id]);

    res.json({
      ...result.rows[0],
      status_history: history.rows,
      events: events.rows,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/assets - Create asset
router.post('/', requireRole('issuer'), async (req, res, next) => {
  try {
    const { asset_type, title, description, location, metadata, issued_at } = req.body;
    if (!asset_type || !title) {
      throw new AppError('asset_type and title are required', 400);
    }

    const result = await query(
      `INSERT INTO compliance_assets (asset_type, title, description, issuer_id, current_holder_id, status, location, metadata, issued_at)
       VALUES ($1, $2, $3, $4, $4, 'created', $5, $6, $7)
       RETURNING *`,
      [asset_type, title, description || '', req.user.userId, location || '', metadata || {}, issued_at || new Date()]
    );

    const asset = result.rows[0];
    await createAssetEvent(asset.id, 'created', `Asset created: ${title}`, req.user.userId, req.user.role, { asset_type, title });
    await createStatusHistory(asset.id, 'created', req.user.userId, { note: 'Asset created' });

    // Fetch full detail
    const detail = await query(`
      SELECT a.*, u_full.email as issuer_email, u_full.full_name as issuer_name,
             u_hold.email as holder_email, u_hold.full_name as holder_name
      FROM compliance_assets a
      JOIN users u_full ON a.issuer_id = u_full.id
      JOIN users u_hold ON a.current_holder_id = u_hold.id
      WHERE a.id = $1
    `, [asset.id]);

    res.status(201).json({ ...detail.rows[0], status_history: [], events: [] });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/assets/:id - Update asset (status change, metadata, transfer)
router.patch('/:id', requireRole('issuer', 'holder', 'inspector', 'regulator'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, metadata, holder_id, description, location } = req.body;

    // Check asset exists and user has access
    const existing = await query('SELECT * FROM compliance_assets WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      throw new AppError('Asset not found', 404);
    }
    const asset = existing.rows[0];

    // Authorization checks
    if (req.user.role === 'issuer' && asset.issuer_id !== req.user.userId) {
      throw new AppError('You can only modify your own assets', 403);
    }
    if (req.user.role === 'holder' && asset.current_holder_id !== req.user.userId) {
      throw new AppError('You can only modify assets you hold', 403);
    }
    // Inspectors can only update status
    if (req.user.role === 'inspector') {
      if (status === undefined) {
        throw new AppError('Inspectors can only update asset status', 403);
      }
      // Optionally: check inspector is assigned to this asset via metadata
    }
    // Regulators cannot modify anything
    if (req.user.role === 'regulator') {
      throw new AppError('Regulators have read-only access', 403);
    }

    const updates = [];
    const params = [];
    let idx = 1;
    const oldStatus = asset.status;

    if (status !== undefined) {
      if (!['created', 'pending_review', 'in_review', 'verified', 'suspended', 'expired'].includes(status)) {
        throw new AppError('Invalid status', 400);
      }
      updates.push(`status = $${idx++}`);
      params.push(status);
      updates.push(`updated_at = NOW()`);
    }

    if (holder_id !== undefined) {
      if (req.user.role !== 'issuer') {
        throw new AppError('Only issuers can transfer assets', 403);
      }
      // Verify holder exists and is active
      const holderCheck = await query('SELECT id, email, full_name FROM users WHERE id = $1 AND is_active = true', [holder_id]);
      if (holderCheck.rows.length === 0) {
        throw new AppError('Invalid or inactive holder', 400);
      }
      updates.push(`current_holder_id = $${idx++}`);
      params.push(holder_id);
      updates.push(`updated_at = NOW()`);
    }

    if (metadata !== undefined) {
      updates.push(`metadata = metadata || $${idx++}`);
      params.push(JSON.stringify(metadata));
      updates.push(`updated_at = NOW()`);
    }

    if (description !== undefined) {
      updates.push(`description = $${idx++}`);
      params.push(description);
      updates.push(`updated_at = NOW()`);
    }

    if (location !== undefined) {
      updates.push(`location = $${idx++}`);
      params.push(location);
      updates.push(`updated_at = NOW()`);
    }

    if (updates.length === 0) {
      throw new AppError('No fields to update', 400);
    }

    const setClause = updates.join(', ');
    params.push(id);
    const result = await query(`UPDATE compliance_assets SET ${setClause} WHERE id = $${idx} RETURNING *`, params);

    // Create events
    const updated = result.rows[0];

    if (status && status !== oldStatus) {
      await createAssetEvent(id, 'status_changed', `Status changed from ${oldStatus} to ${status}`, req.user.userId, req.user.role, { previous_status: oldStatus, new_status: status, metadata: req.body.metadata || {} });
      await createStatusHistory(id, status, req.user.userId, { previous_status: oldStatus, new_status: status, metadata: req.body.metadata || {} });
    }

    if (holder_id && holder_id !== asset.current_holder_id.toString()) {
      await createAssetEvent(id, 'transferred', `Asset transferred from ${asset.current_holder_id} to ${holder_id}`, req.user.userId, req.user.role, { from: asset.current_holder_id, to: holder_id, reason: req.body.transfer_reason || 'transfer' });
    }

    // Fetch full detail
    const detail = await query(`
      SELECT a.*, u_full.email as issuer_email, u_full.full_name as issuer_name,
             u_hold.email as holder_email, u_hold.full_name as holder_name
      FROM compliance_assets a
      JOIN users u_full ON a.issuer_id = u_full.id
      JOIN users u_hold ON a.current_holder_id = u_hold.id
      WHERE a.id = $1
    `, [id]);

    res.json({ ...detail.rows[0], status_history: [], events: [] });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/assets/:id - Soft delete (deactivate)
router.delete('/:id', requireRole('issuer'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const asset = await query('SELECT * FROM compliance_assets WHERE id = $1', [id]);
    if (asset.rows.length === 0) {
      throw new AppError('Asset not found', 404);
    }
    if (asset.rows[0].issuer_id !== req.user.userId) {
      throw new AppError('You can only delete your own assets', 403);
    }

    await query('UPDATE compliance_assets SET status = $1, updated_at = NOW() WHERE id = $2', ['expired', id]);
    await createAssetEvent(id, 'status_changed', `Asset marked as expired`, req.user.userId, req.user.role, {});

    res.json({ message: 'Asset expired' });
  } catch (err) {
    next(err);
  }
});

// GET /api/assets/:id/events - Asset events only
router.get('/:id/events', requireRole('issuer', 'holder', 'inspector', 'regulator'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const events = await query(`
      SELECT e.*, u.full_name as actor_name, u.email as actor_email, r.name as actor_role_label
      FROM asset_events e
      JOIN users u ON e.actor_id = u.id
      LEFT JOIN (SELECT 'issuer' as name, '🏢 Issuer' as label UNION ALL
                 SELECT 'holder', '📦 Holder' UNION ALL
                 SELECT 'inspector', '🔍 Inspector' UNION ALL
                 SELECT 'regulator', '📋 Regulator') r ON e.actor_role = r.name
      WHERE e.asset_id = $1
      ORDER BY e.created_at DESC
    `, [id]);
    res.json(events.rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
