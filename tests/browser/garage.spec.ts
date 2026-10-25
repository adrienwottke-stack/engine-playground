import { test, expect, type Locator, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

const debug = (page: Page) => page.evaluate(() => (window as any).__playground);
async function range(locator: Locator, target: number) {
  const min = Number(await locator.getAttribute('min')), max = Number(await locator.getAttribute('max')), step = Number(await locator.getAttribute('step') || 1);
  const fromMin = Math.round((target - min) / step), fromMax = Math.round((max - target) / step);
  await locator.focus(); await locator.press(fromMin <= fromMax ? 'Home' : 'End');
  for (let i = 0; i < Math.min(fromMin, fromMax); i++) await locator.press(fromMin <= fromMax ? 'ArrowRight' : 'ArrowLeft');
}

test('desktop: one native six-cylinder engine, keyboard throttle, audio, exports and no console errors', async ({ page }) => {
  test.setTimeout(70000);
  const errors: string[] = [], failures: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('requestfailed', request => { if (request.failure()?.errorText !== 'net::ERR_ABORTED') failures.push(request.url()); });
  await page.goto('/?view=2d');
  await expect(page.locator('#connection')).toHaveText('Physischer Kern');
  await page.locator('#reset').click();
  await expect.poll(async () => (await debug(page)).state?.rpm ?? Infinity).toBeLessThan(5);
  await expect(page.locator('.brand')).toBeVisible();
  await expect(page.locator('#backend')).toBeHidden();
  await expect(page.locator('#engine-preset')).toHaveCount(0);
  await expect(page.locator('#throttle')).toBeHidden();
  await expect(page.locator('#view-detail')).toBeHidden();
  await expect(page.locator('#focus-cylinder')).toBeHidden();
  await expect(page.locator('#wave-tab')).toHaveCount(0);
  await expect(page.locator('.classic-scope')).not.toHaveAttribute('open', '');
  await expect(page.locator('.classic-instruments [data-gauge]')).toHaveCount(6);
  expect(await page.locator('.classic-instruments [data-gauge]').evaluateAll(nodes => nodes.map(node => (node as HTMLElement).dataset.gauge))).toEqual(['rpm', 'speedKmh', 'powerKw', 'torqueNm', 'coolantC', 'fuelRateGS']);
  await expect(page.locator('#engine-canvas')).toHaveAccessibleName(/Sechs Zylinder nebeneinander/);
  await page.getByRole('button', { name: 'Motor starten', exact: true }).click();
  await expect.poll(async () => (await debug(page)).state?.rpm, { timeout: 12000 }).toBeGreaterThan(700);
  await expect.poll(async () => (await debug(page)).audio.rms).toBeGreaterThan(.0001);
  const idle = await debug(page);
  expect(idle.mode).toBe('core'); expect(idle.state.source).toBe('ange-physical');
  expect(idle.state.engineName).toBe('BMW M52B28'); expect(idle.state.cylinders).toHaveLength(6);
  expect(idle.audio.state).toBe('running'); expect(idle.audio.volume).toBe(.08);
  for (const [key, pedal] of [['q', .01], ['w', .1], ['e', .2], ['r', 1]] as const) {
    await page.keyboard.down(key);
    try {
      await expect.poll(async () => (await debug(page)).state.pedal).toBeCloseTo(pedal, 4);
      if (key === 'r') await expect.poll(async () => (await debug(page)).state.rpm).toBeGreaterThan(idle.state.rpm + 500);
    } finally { await page.keyboard.up(key); }
    await expect.poll(async () => (await debug(page)).state.pedal).toBe(0);
  }
  await page.screenshot({ path: 'evidence/v04-desktop-live.png', fullPage: true });
  const sound = await debug(page);
  const frameIntervals = await page.evaluate(() => new Promise<number[]>(resolve => {
    const values: number[] = []; let previous = performance.now();
    function step(now: number) { values.push(now - previous); previous = now; if (values.length < 60) requestAnimationFrame(step); else resolve(values.slice(1)); }
    requestAnimationFrame(step);
  }));
  const sorted = frameIntervals.slice().sort((a, b) => a - b);
  await writeFile('evidence/v04-browser-signal-performance.json', JSON.stringify({ scope: 'Headless Chromium with actual native C++ PCM. Physical speaker listening is not covered.', viewport: { width: 1280, height: 800 }, measuredRpm: sound.state.rpm, signalRms: sound.audio.rms, sampleRate: sound.audio.sampleRate, animationMedianFrameMs: sorted[Math.floor(sorted.length / 2)], animationP95FrameMs: sorted[Math.floor(sorted.length * .95)] }, null, 2));
  await page.getByRole('button', { name: 'Ton stummschalten' }).click();
  expect((await debug(page)).audio.muted).toBe(true);
  await expect.poll(async () => (await debug(page)).audio.rms).toBeLessThan(.00001);
  const jsonPromise = page.waitForEvent('download'); await page.locator('#config-export').click(); expect((await jsonPromise).suggestedFilename()).toContain('.json');
  await page.locator('.classic-scope > summary').click();
  await expect(page.locator('#history-tab')).toHaveAttribute('aria-selected', 'true');
  const csvPromise = page.waitForEvent('download'); await page.locator('#csv-export').click(); expect((await csvPromise).suggestedFilename()).toContain('.csv');
  await page.locator('#stop').click(); await expect.poll(async () => (await debug(page)).state.ignition).toBe(false);
  await page.locator('#reset').click(); await expect.poll(async () => (await debug(page)).state?.rpm ?? Infinity).toBeLessThan(5);
  await page.screenshot({ path: 'evidence/v04-desktop.png', fullPage: true });
  expect(errors).toEqual([]); expect(failures).toEqual([]);
});

test('vehicle settings, cooling and a reproducible A/B model experiment remain operable', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('#connection')).toHaveText('Physischer Kern');
  await page.locator('#reset').click();
  await page.getByRole('button', { name: 'Antrieb', exact: true }).click();
  await expect(page.getByRole('slider', { name: 'Schwungrad-Trägheit', exact: true })).toBeDisabled();
  await expect(page.getByRole('slider', { name: 'Bohrung', exact: true })).toBeDisabled();
  await range(page.getByRole('slider', { name: 'Fahrzeugmasse', exact: true }), 1800);
  await expect.poll(async () => (await debug(page)).config.vehicle.massKg).toBe(1800);
  await page.getByRole('button', { name: 'Kühlung', exact: true }).click();
  await page.locator('#heat-mode').selectOption('manual');
  await range(page.getByRole('slider', { name: 'Konstanter Wärmeeintrag', exact: true }), 70);
  await expect.poll(async () => (await debug(page)).state.heatInKw).toBe(70);
  await expect.poll(async () => (await debug(page)).state.engineC).toBeGreaterThan(22);
  await page.getByRole('button', { name: 'Versuche', exact: true }).click();
  await page.locator('#example-pair').click(); await page.locator('#run-experiment').click();
  await expect(page.locator('#experiment-results table')).toBeVisible();
  await expect(page.locator('#run-experiment')).toBeEnabled();
  const first = (await debug(page)).result; expect(first.A.length).toBe(241);
  await page.locator('#run-experiment').click(); await expect(page.locator('#run-experiment')).toBeEnabled();
  expect((await debug(page)).result).toEqual(first);
  expect((await debug(page)).mode).toBe('core');
  await page.screenshot({ path: 'evidence/v04-experiment.png', fullPage: true });
});

test('native outage is explicit across SSE and HTTP and never selects a substitute engine', async ({ page }) => {
  await page.route('**/api/core/events', route => route.abort());
  await page.route('**/api/core/state', route => route.fulfill({ json: { connected: false, state: null, reason: 'TEST: simulated unavailable core' } }));
  await page.goto('/');
  await expect(page.locator('#rpm')).toHaveText('—');
  await expect(page.locator('#start')).toBeDisabled();
  expect((await debug(page)).mode).toBe('core'); expect((await debug(page)).state).toBeNull();
  await expect(page.locator('#backend')).toBeHidden();
  await expect(page.locator('#mode-note')).toContainText('TEST: simulated unavailable core');
});

test('375 px mobile: all pages fit and the native engine can be started and stopped', async ({ page }) => {
  test.setTimeout(45000);
  await page.setViewportSize({ width: 375, height: 812 }); await page.goto('/');
  await expect(page.locator('#connection')).toHaveText('Physischer Kern'); await page.locator('#reset').click();
  for (const name of ['Mechanik', 'Antrieb', 'Kühlung', 'Versuche', 'Modell']) {
    await page.getByRole('button', { name, exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.getByRole('button', { name: 'Mechanik', exact: true }).click();
  await page.locator('#start').click(); await expect.poll(async () => (await debug(page)).state?.rpm, { timeout: 12000 }).toBeGreaterThan(700);
  await expect(page.locator('#throttle')).toBeHidden(); await expect(page.locator('#exhaust-ir')).toBeVisible();
  await page.screenshot({ path: 'evidence/v04-mobile.png', fullPage: true });
  await page.locator('#stop').click(); await expect.poll(async () => (await debug(page)).state.ignition).toBe(false);
});

