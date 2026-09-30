const express = require('express');
const { createHash } = require('node:crypto');
const { requireRole } = require('../middleware/auth');
const router = express.Router();
const ledger = 'http://127.0.0.1:7575/v2';
const template = name => `#canton-main:Main:${name}`;
const validContract = value => typeof value === 'string' && /^[0-9a-f]{64,512}$/i.test(value);

function assignments(name) {
  const value = JSON.parse(process.env[name] || '{}');
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid assignments');
  return value;
}
function own(map, key) { return Object.hasOwn(map, key) ? map[key] : null; }
function partyFor(user) {
  const assignment = user.role === 'issuer'
    ? own(assignments('CANTON_ISSUANCE_ASSIGNMENTS'), user.userId)?.issuer
    : own(assignments('CANTON_HOLDER_ASSIGNMENTS'), user.userId)?.party;
  return typeof assignment === 'string' && assignment ? assignment : null;
}
router.use(requireRole('issuer', 'holder'));
router.use((req, res, next) => {
  try {
    req.ledgerParty = partyFor(req.user);
    if (!req.ledgerParty) return res.status(403).json({ error: 'No approved Canton transfer assignment' });
    next();
  } catch {
    res.status(503).json({ error: 'Canton transfer assignments are misconfigured' });
  }
});

router.get('/transfer-recipients', requireRole('issuer'), (req, res) => {
  try {
    const recipients = Object.entries(assignments('CANTON_HOLDER_ASSIGNMENTS'))
      .filter(([, value]) => typeof value?.party === 'string' && value.party)
      .map(([userId, value]) => ({ userId, label: typeof value.label === 'string' ? value.label : userId }));
    res.json({ recipients });
  } catch {
    res.status(503).json({ error: 'Canton transfer assignments are misconfigured' });
  }
});

router.get('/transfers', async (req, res) => {
  const { pageToken, activeAtOffset } = req.query;
  if (Object.keys(req.query).some(key => !['pageToken', 'activeAtOffset'].includes(key)) ||
      (pageToken !== undefined && (typeof pageToken !== 'string' || pageToken.length > 8192)) ||
      (activeAtOffset !== undefined && (typeof activeAtOffset !== 'string' || !/^\d+$/.test(activeAtOffset) || !Number.isSafeInteger(Number(activeAtOffset)))) ||
      (pageToken && activeAtOffset === undefined)) {
    return res.status(400).json({ error: 'Supply a valid snapshot offset and page token only' });
  }
  try {
    const response = await fetch(`${ledger}/state/active-contracts-page`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(20000),
      body: JSON.stringify({ maxPageSize: 50,
        ...(pageToken ? { pageToken } : {}),
        ...(activeAtOffset !== undefined ? { activeAtOffset: Number(activeAtOffset) } : {}),
        eventFormat: { verbose: true, filtersByParty: { [req.ledgerParty]: { cumulative: [
          { identifierFilter: { TemplateFilter: { value: { templateId: template('TransferProposal') } } } },
        ] } } },
      }),
    });
    if (!response.ok) return res.status(502).json({ error: 'Canton inbox unavailable; refresh the snapshot' });
    const snapshot = await response.json();
    if (!Array.isArray(snapshot.activeContracts)) throw new Error('Missing snapshot');
    const transfers = snapshot.activeContracts.map(item => item.contractEntry?.JsActiveContract?.createdEvent)
      .filter(event => event && (req.user.role === 'holder' ? event.createArgument?.recipient === req.ledgerParty : event.createArgument?.asset?.issuer === req.ledgerParty))
      .map(event => ({ contractId: event.contractId, asset: event.createArgument.asset, recipient: event.createArgument.recipient }));
    res.json({ transfers, activeAtOffset: snapshot.activeAtOffset, nextPageToken: snapshot.nextPageToken || null });
  } catch {
    res.status(503).json({ error: 'Canton inbox unavailable' });
  }
});

async function exercise(req, res, name, choice, args, expected, status = 200) {
  const contractId = req.params.contractId;
  const commandId = createHash('sha256').update(JSON.stringify([req.user.userId, contractId, choice, args])).digest('hex');
  try {
    const response = await fetch(`${ledger}/commands/submit-and-wait-for-transaction`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(20000),
      body: JSON.stringify({ commands: { userId: 'sanitova-local', commandId, actAs: [req.ledgerParty], commands: [
        { ExerciseCommand: { templateId: template(name), contractId, choice, choiceArgument: args } },
      ] } }),
    });
    if (!response.ok) {
      const failure = await response.json().catch(() => ({}));
      if (/CONTRACT_NOT_FOUND|CONTRACT_NOT_ACTIVE|DAML_AUTHORIZATION_ERROR|INTERPRETATION_AUTHORIZATION_ERROR/.test(failure.code || '')) {
        return res.status(409).json({ error: 'Contract is unavailable, already consumed, or not actionable by this account. Refresh the inbox.', commandId });
      }
      return res.status(502).json({ error: 'Transfer not confirmed. Reconcile before retrying.', commandId });
    }
    const { transaction } = await response.json();
    const created = transaction?.events?.map(event => event.CreatedEvent).find(event => event && expected(event.createArgument));
    if (!created?.contractId || !transaction.updateId) throw new Error('Missing receipt');
    const value = created.createArgument;
    res.status(status).json({ backend: 'local-canton', commandId, contractId: created.contractId,
      updateId: transaction.updateId, offset: transaction.offset,
      asset: value.asset || value, ...(value.recipient ? { recipient: value.recipient } : {}),
    });
  } catch {
    res.status(503).json({ error: 'Transfer confirmation unavailable; outcome may be unknown. Reconcile before retrying.', commandId });
  }
}

router.post('/assets/:contractId/transfers', requireRole('issuer'), async (req, res) => {
  const body = req.body;
  if (!validContract(req.params.contractId) || !body || Array.isArray(body) ||
      Object.keys(body).some(key => key !== 'recipientUserId') || typeof body.recipientUserId !== 'string') {
    return res.status(400).json({ error: 'Supply a contract ID and approved recipient user ID only' });
  }
  let recipient;
  try { recipient = own(assignments('CANTON_HOLDER_ASSIGNMENTS'), body.recipientUserId)?.party; }
  catch { return res.status(503).json({ error: 'Canton transfer assignments are misconfigured' }); }
  if (typeof recipient !== 'string' || !recipient) return res.status(400).json({ error: 'Recipient is not approved for Canton transfers' });
  return exercise(req, res, 'ComplianceAsset', 'ProposeTransfer', { newHolder: recipient },
    value => value?.asset?.issuer === req.ledgerParty && value.recipient === recipient, 201);
});

router.post('/transfers/:contractId/accept', requireRole('holder'), async (req, res) => {
  if (!validContract(req.params.contractId) || !req.body || Array.isArray(req.body) || Object.keys(req.body).length) {
    return res.status(400).json({ error: 'Supply a proposal contract ID and an empty body; the recipient party is assigned by the server' });
  }
  return exercise(req, res, 'TransferProposal', 'AcceptTransfer', {}, value => value?.holder === req.ledgerParty);
});

router.post('/transfers/:contractId/cancel', requireRole('issuer'), async (req, res) => {
  if (!validContract(req.params.contractId) || !req.body || Array.isArray(req.body) || Object.keys(req.body).length) {
    return res.status(400).json({ error: 'Supply a proposal contract ID and an empty body; the issuer party is assigned by the server' });
  }
  return exercise(req, res, 'TransferProposal', 'CancelTransfer', {}, value => value?.issuer === req.ledgerParty && typeof value.holder === 'string');
});

module.exports = router;
