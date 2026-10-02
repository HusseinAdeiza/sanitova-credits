import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
const require = createRequire(import.meta.url);
const { query } = require('../../backend/src/db');
const { generateToken } = require('../../backend/src/middleware/auth');

test('Canton Records scope by party and show checkpoint freshness', async ({ browser }) => {
  const result = await query(`SELECT u.id, u.email, r.name AS role FROM users u JOIN roles r ON r.id=u.role_id WHERE u.email = ANY($1)`, [['alice@sanitova.com', 'bob@sanitova.com']]);
  const contexts = [];
  async function page(role) {
    const user = result.rows.find(row => row.role === role);
    expect(user).toBeTruthy();
    const context = await browser.newContext();
    contexts.push(context);
    await context.addInitScript(token => localStorage.setItem('token', token), generateToken(user));
    const view = await context.newPage();
    await view.goto('http://127.0.0.1:5173/ledger-records');
    return view;
  }
  try {
    // Self-contained fixture: issue as Alice and propose a transfer to Bob so
    // the holder always has an active TransferProposal, regardless of prior
    // ledger state.
    const aliceUser = result.rows.find(row => row.role === 'issuer');
    const bobUser = result.rows.find(row => row.role === 'holder');
    async function api(path, user, body) {
      const response = await fetch(`http://127.0.0.1:4000/api/ledger${path}`, {
        method: body ? 'POST' : 'GET',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${generateToken(user)}` },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      return { status: response.status, data: await response.json() };
    }
    const issued = await api('/assets', aliceUser, { assetId: randomUUID(), title: `Records scope fixture ${Date.now()}` });
    expect(issued.status).toBe(201);
    const proposed = await api(`/assets/${issued.data.contractId}/transfers`, aliceUser, { recipientUserId: bobUser.id });
    expect(proposed.status).toBe(201);

    const alice = await page('issuer');
    await expect(alice.getByRole('heading', { name: 'Canton Records' })).toBeVisible();
    await expect(alice.getByText(/Ledger checkpoint offset \d+/)).toBeVisible();
    expect(await alice.getByRole('article').count()).toBeGreaterThan(0);

    // Bob sees only contracts where his party is a ledger witness, and every
    // visible article must reference his party (as recipient or holder).
    // The projection worker syncs every few seconds, so poll until the fresh
    // proposal is projected instead of racing it.
    const bob = await page('holder');
    await expect(bob.getByText(/synchronized|stale/).first()).toBeVisible();
    async function bobRecipientParty() {
      return bob.evaluate(async () => {
        const response = await fetch('/api/ledger/records?page=0', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
        const body = await response.json();
        // The holder's own party appears as recipient on TransferProposal records.
        const proposal = body.contracts.find(row => row.template_id?.endsWith(':Main:TransferProposal'));
        return proposal ? proposal.payload.recipient : null;
      });
    }
    let bobParty = null;
    for (let attempt = 0; attempt < 20 && !bobParty; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      bobParty = await bobRecipientParty();
    }
    expect(bobParty).toBeTruthy();
    const bobArticles = await bob.getByRole('article').count();
    for (let i = 0; i < bobArticles; i++) {
      expect((await bob.getByRole('article').nth(i).innerText())).toContain(bobParty);
    }

    await alice.getByRole('tab', { name: 'Ledger events' }).click();
    await expect(alice.getByRole('article').first()).toBeVisible();
    await expect(alice.getByText('Offset', { exact: true }).first()).toBeVisible();
  } finally {
    for (const context of contexts) await context.close();
  }
});
