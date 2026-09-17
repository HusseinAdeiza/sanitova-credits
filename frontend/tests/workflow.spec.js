import { test, expect } from '@playwright/test';

const base = 'http://127.0.0.1:5173';
async function login(page, request, email) {
  const response = await request.post(`${base}/api/auth/login`, { data: { email, password: 'demo123' } });
  expect(response.ok()).toBeTruthy();
  const { token } = await response.json();
  await page.goto(`${base}/login`);
  await page.evaluate(token => localStorage.setItem('token', token), token);
  await page.goto(`${base}/dashboard`);
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
  return token;
}

test('create form validates metadata and persists a real asset', async ({ page, request }) => {
  await login(page, request, 'alice@sanitova.com');
  await page.goto(`${base}/create-asset`);
  const title = `Product form ${Date.now()}`;
  await page.getByLabel('Title').fill(title);
  await page.getByLabel('Metadata (JSON, optional)').fill('[]');
  await page.getByRole('button', { name: 'Create Asset', exact: true }).click();
  await expect(page.getByText('Metadata must be a JSON object, not a list or single value.')).toBeVisible();
  await page.getByLabel('Metadata (JSON, optional)').fill('{"inspection_score":94}');
  await page.getByRole('button', { name: 'Create Asset', exact: true }).click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await expect(page.getByText('94', { exact: true })).toBeVisible();
});

test('asset list recovers after a network failure', async ({ page, request }) => {
  await login(page, request, 'alice@sanitova.com');
  await page.route('**/api/assets?*', route => route.abort());
  await page.goto(`${base}/assets`);
  await expect(page.getByRole('button', { name: 'Retry loading assets' })).toBeVisible();
  await page.unroute('**/api/assets?*');
  await page.getByRole('button', { name: 'Retry loading assets' }).click();
  await expect(page.locator('.asset-card').first()).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('mobile navigation, role and empty search remain usable', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await login(page, request, 'alice@sanitova.com');
  await expect(page.locator('.stat-card').filter({ hasText: 'Your Role' })).toContainText('issuer');
  const menu = page.getByRole('button', { name: 'Open navigation menu' });
  await expect(menu).toBeVisible();
  await expect(page.getByRole('link', { name: 'Compliance Assets' })).not.toBeVisible();
  await menu.click();
  await expect(page.getByRole('button', { name: 'Close navigation menu' })).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await menu.click();
  await page.getByRole('link', { name: 'Compliance Assets' }).click();
  await expect(page.getByRole('heading', { name: 'Compliance Assets' })).toBeVisible();
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('button', { name: 'New Asset' })).toBeVisible();
  await page.getByPlaceholder('Search assets...').fill('no-matching-asset-934857');
  await expect(page.getByRole('heading', { name: 'No assets found' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('issuer transfers to real holder; inspector verifies; regulator reads history', async ({ page, request }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const token = await login(page, request, 'alice@sanitova.com');
  const created = await request.post(`${base}/api/assets`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { asset_type: 'Water Quality Compliance', title: `Browser workflow ${Date.now()}`, description: 'Automated demo workflow verification' },
  });
  expect(created.status()).toBe(201);
  const asset = await created.json();
  await page.goto(`${base}/assets/${asset.id}`);
  await page.getByRole('button', { name: 'Transfer Asset', exact: true }).click();
  await expect(page.locator('#transfer-holder option').filter({ hasText: 'Bob Builder' })).toHaveCount(1);
  const bobId = await page.locator('#transfer-holder option').filter({ hasText: 'Bob Builder' }).getAttribute('value');
  expect(bobId).toMatch(/^[0-9a-f-]{36}$/i);
  await page.getByLabel('New Holder', { exact: true }).selectOption(bobId);
  await page.getByRole('button', { name: 'Confirm Transfer' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('bob@sanitova.com', { exact: true })).toBeVisible();

  await login(page, request, 'clara@sanitova.com');
  await page.goto(`${base}/assets/${asset.id}`);
  await expect(page.getByRole('button', { name: 'Transfer Asset', exact: true })).toHaveCount(0);
  await page.getByLabel('Inspection status').selectOption('verified');
  await page.getByRole('button', { name: 'Save Status' }).click();
  await expect(page.getByText('Status changed from created to verified', { exact: true })).toBeVisible();

  await login(page, request, 'david@sanitova.com');
  await page.goto(`${base}/assets/${asset.id}`);
  await expect(page.getByRole('heading', { name: asset.title })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save Status' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Transfer Asset', exact: true })).toHaveCount(0);
  await expect(page.getByText('Status changed from created to verified', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/workflow.png', fullPage: true });
  expect(errors).toEqual([]);
});
