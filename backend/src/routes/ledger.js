const express = require('express');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

// Explicit opt-in for the unauthenticated local sandbox only. This is not a
// production ledger adapter; never let client input choose actAs parties.
router.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production' || process.env.CANTON_LOCAL_ENABLED !== 'true') {
    return res.status(503).json({ error: 'Local Canton integration is disabled' });
  }
  next();
});
router.use(authenticate);

router.post('/assets', requireRole('issuer'), async (req, res) => {
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some(key => !['assetId', 'title'].includes(key)) ||
      typeof body.assetId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.assetId) ||
      typeof body.title !== 'string' || !body.title.trim() || body.title.length > 200) {
    return res.status(400).json({ error: 'Supply a UUID assetId and a title of 1–200 characters; parties are assigned by the server' });
  }
  let assignments;
  try {
    assignments = JSON.parse(process.env.CANTON_ISSUANCE_ASSIGNMENTS || '{}');
  } catch {
    return res.status(503).json({ error: 'Canton assignments are not configured correctly' });
  }
  const parties = Object.hasOwn(assignments, req.user.userId) ? assignments[req.user.userId] : null;
  if (!parties || !['issuer', 'inspector', 'regulator'].every(role => typeof parties[role] === 'string' && parties[role])) {
    return res.status(403).json({ error: 'No approved Canton issuance assignment for this account' });
  }
  const asset = {
    issuer: parties.issuer, holder: parties.issuer,
    inspector: parties.inspector, regulator: parties.regulator,
    assetId: body.assetId, title: body.title.trim(), status: 'Created',
  };
  const commandId = `issue-${req.user.userId}-${body.assetId}`;
  try {
    const response = await fetch('http://127.0.0.1:7575/v2/commands/submit-and-wait-for-transaction', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(20000),
      body: JSON.stringify({ commands: {
        userId: 'sanitova-local', commandId, actAs: [parties.issuer],
        commands: [{ CreateCommand: { templateId: '#canton-main:Main:ComplianceAsset', createArguments: asset } }],
      } }),
    });
    if (!response.ok) {
      // Do not expose participant internals or automatically retry commands.
      return res.status(502).json({ error: 'Canton did not confirm issuance. Reconcile the command before retrying.', commandId });
    }
    const result = await response.json();
    const transaction = result.transaction;
    const created = transaction?.events?.map(event => event.CreatedEvent).find(event => event?.createArgument?.assetId === body.assetId);
    if (!created?.contractId || !transaction.updateId) {
      return res.status(502).json({ error: 'Canton response did not contain the expected contract. Reconcile before retrying.', commandId });
    }
    return res.status(201).json({
      backend: 'local-canton', commandId, contractId: created.contractId,
      updateId: transaction.updateId, offset: transaction.offset,
      asset: created.createArgument,
    });
  } catch {
    return res.status(503).json({ error: 'Canton confirmation is unavailable; outcome may be unknown. Reconcile before retrying.', commandId });
  }
});

router.patch('/assets/:contractId/status', requireRole('inspector'), async (req, res) => {
  const { contractId } = req.params;
  const body = req.body;
  if (!/^[0-9a-f]{64,512}$/i.test(contractId) || !body || Array.isArray(body) ||
      Object.keys(body).some(key => key !== 'status') ||
      !['Created', 'PendingReview', 'Verified', 'Suspended'].includes(body.status)) {
    return res.status(400).json({ error: 'Supply a contract ID and a supported status only' });
  }
  let assignments;
  try { assignments = JSON.parse(process.env.CANTON_INSPECTOR_ASSIGNMENTS || '{}'); }
  catch { return res.status(503).json({ error: 'Inspector assignments are misconfigured' }); }
  const party = assignments && Object.hasOwn(assignments, req.user.userId) ? assignments[req.user.userId] : null;
  if (typeof party !== 'string' || !party) return res.status(403).json({ error: 'No approved Canton inspector assignment' });
  const commandId = require('node:crypto').createHash('sha256').update(`${req.user.userId}:${contractId}:${body.status}`).digest('hex');
  try {
    const response = await fetch('http://127.0.0.1:7575/v2/commands/submit-and-wait-for-transaction', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(20000),
      body: JSON.stringify({ commands: { userId: 'sanitova-local', commandId, actAs: [party], commands: [
        { ExerciseCommand: { templateId: '#canton-main:Main:ComplianceAsset', contractId, choice: 'UpdateStatus', choiceArgument: { newStatus: body.status } } },
      ] } }),
    });
    if (!response.ok) {
      const failure = await response.json().catch(() => ({}));
      const code = failure.code || '';
      if (/CONTRACT_NOT_FOUND|CONTRACT_NOT_ACTIVE/.test(code)) return res.status(409).json({ error: 'Contract is no longer active or visible; obtain its current reference', commandId });
      return res.status(502).json({ error: 'Canton did not confirm the status change. Reconcile before retrying.', commandId });
    }
    const { transaction } = await response.json();
    const created = transaction?.events?.map(event => event.CreatedEvent).find(event => event?.createArgument?.inspector === party && event.createArgument.status === body.status);
    if (!created?.contractId || !transaction.updateId) throw new Error('Missing receipt');
    res.json({ backend: 'local-canton', commandId, contractId: created.contractId, updateId: transaction.updateId, offset: transaction.offset, asset: created.createArgument });
  } catch {
    res.status(503).json({ error: 'Status confirmation unavailable; outcome may be unknown. Reconcile before retrying.', commandId });
  }
});

router.use('/records', require('./ledger-records'));
router.use(require('./ledger-transfers'));

module.exports = router;
