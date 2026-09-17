import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { query } = require('../../backend/src/db');
const { generateToken } = require('../../backend/src/middleware/auth');

test('live browser proposes a transfer and recipient accepts from the ledger inbox', async ({ browser }) => {
  const result = await query(`SELECT u.id, u.email, r.name AS role FROM users u JOIN roles r ON r.id=u.role_id WHERE u.email = ANY($1)`, [['alice@sanitova.com', 'bob@sanitova.com']]);
  const contexts = [];
  async function account(role) {
    const user = result.rows.find(row => row.role === role);
    expect(user).toBeTruthy();
    const context = await browser.newContext();
    contexts.push(context);
    await context.addInitScript(token => localStorage.setItem('token', token), generateToken(user));
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:5173/dashboard');
    return page;
  }
  try {
    const alice = await account('issuer');
    await alice.getByRole('link', { name: 'Canton Issuance' }).click();
    const title = `Browser transfer ${Date.now()}`;
    await alice.getByLabel('Contract title').fill(title);
    await alice.getByRole('button', { name: 'Issue on Canton' }).click();
    await expect(alice.getByRole('heading', { name: 'Issuance confirmed' })).toBeVisible();
    const original = await alice.getByTestId('ledger-contract').innerText();
    await alice.getByRole('link', { name: 'Canton Transfers' }).click();
    await alice.getByLabel('Current contract ID').fill(original);
    await alice.getByLabel('Approved recipient').selectOption(result.rows.find(row => row.role === 'holder').id);
    await alice.getByRole('button', { name: 'Propose transfer' }).click();
    await expect(alice.getByRole('heading', { name: 'Transfer proposal confirmed' })).toBeVisible();
    const proposal = await alice.getByTestId('transfer-contract').innerText();
    await alice.reload();
    await expect(alice.getByTestId('transfer-contract')).toHaveText(proposal);
    const bob = await account('holder');
    await bob.getByRole('link', { name: 'Canton Transfers' }).click();
    const row = bob.getByRole('article').filter({ hasText: title });
    await expect(row).toHaveCount(1);
    await row.getByRole('checkbox', { name: 'I agree to accept custody' }).check();
    await row.getByRole('button', { name: 'Accept custody' }).click();
    await expect(bob.getByRole('heading', { name: 'Custody accepted' })).toBeVisible();
    expect(await bob.getByTestId('transfer-contract').innerText()).not.toBe(original);
    await bob.getByRole('button', { name: 'Refresh inbox' }).click();
    await expect(bob.getByRole('article').filter({ hasText: title })).toHaveCount(0);
    await bob.reload();
    await expect(bob.getByRole('heading', { name: 'Custody accepted' })).toBeVisible();
  } finally {
    for (const context of contexts) await context.close();

  }
});

test('issuer cancels from the inbox and keeps a replacement receipt', async ({ page, request }) => {
  const result = await query(`SELECT u.id, u.email, r.name AS role FROM users u JOIN roles r ON r.id=u.role_id WHERE u.email = ANY($1)`, [['alice@sanitova.com', 'bob@sanitova.com']]);
  const alice = result.rows.find(row => row.role === 'issuer');
  const bob = result.rows.find(row => row.role === 'holder');
  const token = generateToken(alice);
  const headers = { Authorization: `Bearer ${token}` };
  const title = `Browser cancellation ${Date.now()}`;
  const issued = await request.post('http://localhost:4000/api/ledger/assets', { headers, data: { assetId: crypto.randomUUID(), title } });
  expect(issued.status()).toBe(201);
  const asset = await issued.json();
  const proposed = await request.post(`http://localhost:4000/api/ledger/assets/${asset.contractId}/transfers`, { headers, data: { recipientUserId: bob.id } });
  expect(proposed.status()).toBe(201);
  const proposal = await proposed.json();
  await page.addInitScript(value => localStorage.setItem('token', value), token);
  await page.goto('http://127.0.0.1:5173/ledger-transfers');
  const row = page.getByRole('article').filter({ hasText: title });
  await expect(row).toHaveCount(1);
  await expect(row.getByRole('button', { name: 'Cancel proposal' })).toBeDisabled();
  await row.getByRole('checkbox', { name: 'I confirm withdrawal of this proposal' }).check();
  await row.getByRole('button', { name: 'Cancel proposal' }).click();
  await expect(page.getByRole('heading', { name: 'Transfer cancelled' })).toBeVisible();
  const replacement = await page.getByTestId('transfer-contract').innerText();
  expect(replacement).not.toBe(proposal.contractId);
  expect(replacement).not.toBe(asset.contractId);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Transfer cancelled' })).toBeVisible();
  await expect(page.getByTestId('transfer-contract')).toHaveText(replacement);
  await expect(page.getByRole('article').filter({ hasText: title })).toHaveCount(0);
});
