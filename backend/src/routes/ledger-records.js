const express = require('express');
const { getClient } = require('../db');
const { requireRole } = require('../middleware/auth');
const router = express.Router();

router.get('/', requireRole('issuer', 'holder', 'inspector', 'regulator'), async (req, res) => {
  if (Object.keys(req.query).some(key => key !== 'page') ||
      (req.query.page !== undefined && (typeof req.query.page !== 'string' || !/^\d{1,6}$/.test(req.query.page)))) {
    return res.status(400).json({ error: 'Supply a non-negative page only; party and source are server-assigned' });
  }
  let assignment;
  try {
    const assignments = JSON.parse(process.env.CANTON_RECORD_ASSIGNMENTS || '{}');
    if (!assignments || typeof assignments !== 'object' || Array.isArray(assignments)) throw new Error('Invalid assignments');
    assignment = Object.hasOwn(assignments, req.user.userId) ? assignments[req.user.userId] : null;
  } catch {
    return res.status(503).json({ error: 'Canton record assignments are misconfigured' });
  }
  if (!assignment || assignment.role !== req.user.role || typeof assignment.party !== 'string' || !assignment.party) {
    return res.status(403).json({ error: 'No approved Canton records assignment' });
  }
  const source = process.env.CANTON_PROJECTION_SOURCE || 'local-app';
  const page = Number(req.query.page || 0);
  let client;
  try {
    client = await getClient();
    // Read checkpoint and records from the same snapshot while the worker commits new pages.
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const state = (await client.query('SELECT last_offset, synced_at, parties FROM canton_projection_sources WHERE source=$1', [source])).rows[0];
    if (!state || !state.synced_at || !state.parties.includes(assignment.party)) {
      await client.query('ROLLBACK');
      return res.status(503).json({ error: 'Projection is not initialized for this account' });
    }
    const rows = await client.query(`SELECT contract_id, template_id, payload, created_offset, created_update_id
      FROM canton_contracts WHERE source=$1 AND $2=ANY(witnesses) AND archived_offset IS NULL
      ORDER BY created_offset DESC, contract_id LIMIT 51 OFFSET $3`, [source, assignment.party, page * 50]);
    await client.query('COMMIT');
    res.set('Cache-Control', 'no-store');
    res.json({ contracts: rows.rows.slice(0, 50), page, nextPage: rows.rows.length > 50 ? page + 1 : null,
      checkpoint: { offset: state.last_offset, syncedAt: state.synced_at,
        stale: Date.now() - new Date(state.synced_at).getTime() > 30000 },
    });
  } catch {
    if (client) await client.query('ROLLBACK').catch(() => {});
    res.status(503).json({ error: 'Projected Canton records unavailable' });
  } finally { if (client) client.release(); }
});

router.get('/events', requireRole('issuer', 'holder', 'inspector', 'regulator'), async (req, res) => {
  if (Object.keys(req.query).some(key => key !== 'page') ||
      (req.query.page !== undefined && (typeof req.query.page !== 'string' || !/^\d{1,6}$/.test(req.query.page)))) {
    return res.status(400).json({ error: 'Supply a non-negative page only; party and source are server-assigned' });
  }
  let assignment;
  try {
    const assignments = JSON.parse(process.env.CANTON_RECORD_ASSIGNMENTS || '{}');
    if (!assignments || typeof assignments !== 'object' || Array.isArray(assignments)) throw new Error('Invalid assignments');
    assignment = Object.hasOwn(assignments, req.user.userId) ? assignments[req.user.userId] : null;
  } catch {
    return res.status(503).json({ error: 'Canton record assignments are misconfigured' });
  }
  if (!assignment || assignment.role !== req.user.role || typeof assignment.party !== 'string' || !assignment.party) {
    return res.status(403).json({ error: 'No approved Canton records assignment' });
  }
  const source = process.env.CANTON_PROJECTION_SOURCE || 'local-app';
  const page = Number(req.query.page || 0);
  let client;
  try {
    client = await getClient();
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const state = (await client.query('SELECT last_offset, synced_at, parties FROM canton_projection_sources WHERE source=$1', [source])).rows[0];
    if (!state || !state.synced_at || !state.parties.includes(assignment.party)) {
      await client.query('ROLLBACK');
      return res.status(503).json({ error: 'Projection is not initialized for this account' });
    }
    // ACS-delta visibility: witnesses, not business rules. Titles resolve within the same
    // snapshot so archived contracts stay describable.
    const rows = await client.query(`SELECT e.update_id, e.node_id, e.ledger_offset, e.contract_id, e.event_type,
        c.payload->>'title' AS title, c.payload->>'status' AS status, (c.payload->>'assetId') AS asset_id
      FROM canton_events e LEFT JOIN canton_contracts c ON c.source=e.source AND c.contract_id=e.contract_id
      WHERE e.source=$1 AND $2=ANY(e.witnesses)
      ORDER BY e.ledger_offset DESC, e.node_id DESC LIMIT 51 OFFSET $3`,
    [source, assignment.party, page * 50]);
    await client.query('COMMIT');
    res.set('Cache-Control', 'no-store');
    res.json({ events: rows.rows.slice(0, 50).map(row => ({
      eventId: `${row.update_id}:${row.node_id}`, updateId: row.update_id, nodeId: row.node_id,
      ledgerOffset: row.ledger_offset, contractId: row.contract_id, eventType: row.event_type,
      title: row.title, status: row.status, assetId: row.asset_id,
    })), page, nextPage: rows.rows.length > 50 ? page + 1 : null,
      checkpoint: { offset: state.last_offset, syncedAt: state.synced_at,
        stale: Date.now() - new Date(state.synced_at).getTime() > 30000 },
    });
  } catch {
    if (client) await client.query('ROLLBACK').catch(() => {});
    res.status(503).json({ error: 'Projected Canton records unavailable' });
  } finally { if (client) client.release(); }
});

module.exports = router;
