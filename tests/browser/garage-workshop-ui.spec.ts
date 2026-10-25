import { test, expect } from '@playwright/test';

test.use({ trace: 'off', launchOptions: { args: ['--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] } });

test('workshop opens only the complete 3D motor and keeps the simpler controls connected', async ({ page }) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('requestfailed', request => { if (!request.failure()?.errorText.includes('ERR_ABORTED')) errors.push(request.url()); });
  await page.goto('/?component=piston&view=2d#experiments');
  await expect(page.locator('.workspace')).toHaveAttribute('data-current-page', 'mechanics');
  await expect(page.locator('.engine-panel')).toHaveAttribute('data-engine-view', '3d');
  await expect(page.locator('.engine-three-panel')).toHaveAttribute('data-component', 'engine');
  await expect(page.locator('#three-camera')).toBeVisible();
  await expect(page.locator('#slow')).toBeVisible();
  await expect(page.locator('#throttle')).toBeVisible();
  await expect(page.locator('#clutch')).toBeVisible();
  await expect(page.locator('[data-gear]')).toHaveCount(6);
  await expect(page.locator('#ignition-toggle')).toBeVisible();
  await expect(page.locator('#starter-hold')).toBeVisible();
  await expect(page.locator('#garage-tuning-slot')).toHaveCount(1);
  await expect(page.locator('#three-component,#engine-view-2d,.three-media,.three-presets,.three-options')).toHaveCount(0);
  for (const selector of ['.side-nav', '.page-heading', '.cutaway-toolbar', '.cylinder-readings', '.engine-spec', '#stop', '#rev', '#launch', '#volume', '#config-import', '#config-export', '#load', '#brake', '.audio-timeline', '#footer-state']) {
    await expect(page.locator(selector)).toBeHidden();
  }
  expect(await page.evaluate(() => ['rpm', 'rpm-bar', 'torque', 'power', 'speed', 'actual-throttle', 'focus-cylinder', 'view-detail', 'live-chart', 'thermal-chart', 'comparison-chart', 'mode-note'].every(id => document.getElementById(id)?.isConnected))).toBe(true);
  expect(await page.locator('.garage-legacy').evaluateAll(nodes => nodes.every(node => (node as HTMLElement).inert && (node as HTMLElement).hidden && node.getAttribute('aria-hidden') === 'true'))).toBe(true);
  await page.locator('#three-camera').selectOption('front');
  await page.locator('#three-camera-reset').click();
  await expect(page.locator('#three-camera')).toHaveValue('overview');
  await page.locator('#slow').check();
  await expect.poll(() => page.evaluate(() => (window as any).__playground.slow)).toBe(true);
  await expect(page.locator('.engine-three-host')).toHaveAttribute('data-webgl', 'ready', { timeout: 20000 });
  await page.screenshot({ path: 'evidence/garage-round/ui-desktop.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('375 px workshop has a large 3D stage, touch-sized controls and no horizontal overflow', async ({ page }) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await expect(page.locator('#three-camera')).toBeVisible();
  const stage = await page.locator('.engine-three-stage').boundingBox();
  expect(stage?.width).toBe(375);
  expect(stage?.height).toBeGreaterThanOrEqual(365);
  for (const selector of ['#start', '#throttle', '#clutch', '#three-camera', '#three-camera-reset', '#ignition-toggle', '#starter-hold', '[data-gear="1"]']) {
    const box = await page.locator(selector).boundingBox();
    expect(box?.height, `${selector} has a touch-sized target`).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const positions = await page.evaluate(() => {
    const y = (selector: string) => document.querySelector(selector)!.getBoundingClientRect().top + scrollY;
    return { motor: y('.engine-panel'), controls: y('.control-panel'), tuning: y('#garage-tuning-slot') };
  });
  expect(positions.controls).toBeGreaterThan(positions.motor);
  expect(positions.tuning).toBeGreaterThan(positions.controls);
  const readings = await page.locator('.garage-instruments').boundingBox();
  const start = await page.locator('#start').boundingBox();
  const throttle = await page.locator('.throttle-control').boundingBox();
  expect(start!.y).toBeGreaterThan(readings!.y);
  expect(throttle!.y).toBeGreaterThan(start!.y);
  await expect(page.locator('.engine-three-host')).toHaveAttribute('data-webgl', 'ready', { timeout: 20000 });
  await page.screenshot({ path: 'evidence/garage-round/ui-mobile.png', fullPage: true });
});
