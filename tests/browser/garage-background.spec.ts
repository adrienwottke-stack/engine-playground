import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

test.use({ trace: 'off', launchOptions: { args: ['--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] } });
const evidence = 'evidence/workshop-background-01';

test('375px workshop background renders without gaps or horizontal overflow', async ({ page }) => {
  test.setTimeout(150000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await mkdir(evidence, { recursive: true });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/cockpit-preview/index.html', { waitUntil: 'domcontentloaded' });
  const host = page.locator('.engine-three-host');
  await expect(host).toHaveAttribute('data-webgl', 'ready', { timeout: 90000 });
  await expect.poll(async () => JSON.parse(await host.getAttribute('data-workshop-lighting') ?? '{}').shadowReady, { timeout: 20000 }).toBe(true);
  const background = JSON.parse(await host.getAttribute('data-workshop-background') ?? '{}');
  expect(background.revision).toBe('workshop-background-01');
  expect(background.enclosure).toBe(true);
  expect(await page.evaluate(() => innerWidth)).toBe(375);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: evidence + '/background-mobile.png', timeout: 30000 });
  expect(errors).toEqual([]);
  await writeFile(evidence + '/checks.json', JSON.stringify({ passed: true, width: 375, height: 812, background, errors }, null, 2));
});