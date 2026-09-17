import { test, expect } from '@playwright/test';

test('live app issues as Alice and verifies as Clara on Canton', async ({ page }) => {
  async function login(email) {
    await page.goto('http://127.0.0.1:5173/login');
    await page.locator('input[type=email]').fill(email);
    await page.locator('input[type=password]').fill('demo123');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
  }
  await login('alice@sanitova.com');
  await page.getByRole('link', { name: 'Canton Issuance' }).click();
  await page.getByLabel('Contract title').fill(`Live inspection ${Date.now()}`);
  await page.getByRole('button', { name: 'Issue on Canton' }).click();
  await expect(page.getByRole('heading', { name: 'Issuance confirmed' })).toBeVisible();
  const original = await page.getByTestId('ledger-contract').innerText();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await login('clara@sanitova.com');
  await page.getByRole('link', { name: 'Canton Inspection' }).click();
  await page.getByLabel('Current Canton contract ID').fill(original);
  await page.getByLabel('New ledger status').selectOption('Verified');
  await page.getByRole('button', { name: 'Update on Canton' }).click();
  await expect(page.getByRole('heading', { name: 'Inspection confirmed' })).toBeVisible();
  const replacement = await page.getByTestId('inspection-contract').innerText();
  expect(replacement).not.toBe(original);
  expect(await page.getByTestId('inspection-update').innerText()).toBeTruthy();
  await expect(page.getByText('Verified', { exact: true }).last()).toBeVisible();
});
