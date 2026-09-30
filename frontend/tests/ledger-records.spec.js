import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
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
    const alice = await page('issuer');
    await expect(alice.getByRole('heading', { name: 'Canton Records' })).toBeVisible();
    await expect(alice.getByText(/Ledger checkpoint offset \d+/)).toBeVisible();
    expect(await alice.getByRole('article').count()).toBeGreaterThan(0);

    // Bob sees only contracts where his party is a ledger witness, and every
    // visible article must reference his party (as recipient or holder).
    const bob = await page('holder');
    await expect(bob.getByText(/synchronized|stale/).first()).toBeVisible();
    const bobParty = await bob.evaluate(async () => {
      const response = await fetch('/api/ledger/records?page=0', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
      const body = await response.json();
      // The holder's own party appears as recipient on TransferProposal records.
      const proposal = body.contracts.find(row => row.template_id?.endsWith(':Main:TransferProposal'));
      return proposal ? proposal.payload.recipient : null;
    });
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
