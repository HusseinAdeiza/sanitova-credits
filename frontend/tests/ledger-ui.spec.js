import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
const require = createRequire(import.meta.url);

test('browser login and issuance return an actual Canton receipt', async ({ page, request }) => {
  const login = await request.post('http://localhost:4000/api/auth/login', { data: { email: 'alice@sanitova.com', password: 'demo123' } });
  expect(login.ok()).toBeTruthy();
  const { user } = await login.json();
  const parties = {};
  for (const role of ['issuer', 'inspector', 'regulator']) {
    const response = await request.post('http://localhost:7575/v2/parties', { data: { partyIdHint: `browser-${role}-${randomUUID()}` } });
    expect(response.ok()).toBeTruthy();
    parties[role] = (await response.json()).partyDetails.party;
  }
  process.env.PORT = '0';
  process.env.CANTON_LOCAL_ENABLED = 'true';
  process.env.CANTON_ISSUANCE_ASSIGNMENTS = JSON.stringify({ [user.id]: parties });
  const { server } = require('../../backend/src/index.js');
  if (!server.listening) await new Promise(resolve => server.once('listening', resolve));
  const api = `http://127.0.0.1:${server.address().port}`;
  // Forward to the actual isolated Express API; no mocked ledger responses.
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    const response = await route.fetch({ url: `${api}${url.pathname}${url.search}` });
    await route.fulfill({ response });
  });
  try {
    await page.goto('http://127.0.0.1:5173/login');
    await page.locator('input[type=email]').fill('alice@sanitova.com');
    await page.locator('input[type=password]').fill('demo123');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByRole('link', { name: 'Canton Issuance' }).click();
    await page.getByLabel('Contract title').fill(`Browser Canton ${Date.now()}`);
    const responsePromise = page.waitForResponse(res => res.url().endsWith('/api/ledger/assets') && res.request().method() === 'POST');
    await page.getByRole('button', { name: 'Issue on Canton' }).click();
    const response = await responsePromise;
    expect(response.status()).toBe(201);
    const receipt = await response.json();
    expect(receipt.asset.issuer).toBe(parties.issuer);
    await expect(page.getByRole('heading', { name: 'Issuance confirmed' })).toBeVisible();
    await expect(page.getByTestId('ledger-contract')).toHaveText(receipt.contractId);
    await expect(page.getByTestId('ledger-update')).toHaveText(receipt.updateId);
    await expect(page.getByRole('button', { name: 'Issue on Canton' })).toBeDisabled();
    await page.reload();
    await expect(page.getByTestId('ledger-contract')).toHaveText(receipt.contractId);
    await page.getByRole('button', { name: 'Start another asset' }).click();
    process.env.CANTON_ISSUANCE_ASSIGNMENTS = '{}';
    await page.getByLabel('Contract title').fill('Unapproved issuance');
    await page.getByRole('button', { name: 'Issue on Canton' }).click();
    await expect(page.getByRole('alert')).toContainText('No approved Canton issuance assignment');
    await expect(page.getByRole('heading', { name: 'Issuance confirmed' })).toHaveCount(0);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
