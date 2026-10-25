import { test, expect, type Locator, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

const debug = (page: Page) => page.evaluate(() => (window as any).__playground);
async function range(locator: Locator, target: number) {
  const min = Number(await locator.getAttribute('min')), max = Number(await locator.getAttribute('max')), step = Number(await locator.getAttribute('step') || 1);
  const lo = Math.round((target - min) / step), hi = Math.round((max - target) / step);
  await locator.focus(); await locator.press(lo <= hi ? 'Home' : 'End');
  for (let i = 0; i < Math.min(lo, hi); i++) await locator.press(lo <= hi ? 'ArrowRight' : 'ArrowLeft');
}

test('native M52: keyboard ignition, clutch and shifts drive the actual vehicle while engine geometry stays fixed', async ({ page }) => {
  test.setTimeout(75000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/'); await expect(page.locator('#connection')).toHaveText('Physischer Kern');
  await page.locator('#reset').click(); await expect.poll(async () => (await debug(page)).state?.rpm ?? Infinity).toBeLessThan(5);
  await page.keyboard.press('a'); await expect.poll(async () => (await debug(page)).state.ignition).toBe(true);
  await page.keyboard.down('s');
  try { await expect.poll(async () => (await debug(page)).state.rpm, { timeout: 12000 }).toBeGreaterThan(700); }
  finally { await page.keyboard.up('s'); }
  await expect.poll(async () => (await debug(page)).audio.rms).toBeGreaterThan(.0001);
  const idle = await debug(page);
  expect(idle.state.source).toBe('ange-physical'); expect(idle.state.engineName).toBe('BMW M52B28');
  expect(idle.state.cylinders).toHaveLength(6); expect(idle.state.reference).toBe(true); expect(idle.detailView).toBe(false);
  await expect(page.locator('#engine-preset')).toHaveCount(0); await expect(page.locator('#backend')).toBeHidden();
  await range(page.locator('#clutch'), 100); await expect.poll(async () => (await debug(page)).state.clutch).toBe(1);
  await page.keyboard.down('Shift');
  try {
    await expect.poll(async () => (await debug(page)).state.clutch).toBe(0);
    await page.keyboard.down('ArrowUp');
    await expect.poll(async () => (await debug(page)).state.gear).toBe(1);
    await page.keyboard.down('ArrowUp'); await page.waitForTimeout(250);
    expect((await debug(page)).state.gear).toBe(1);
    await page.keyboard.up('ArrowUp');
    await page.keyboard.press('ArrowDown'); await expect.poll(async () => (await debug(page)).state.gear).toBe(0);
    await page.keyboard.press('ArrowDown'); await expect.poll(async () => (await debug(page)).state.gear).toBe(0);
  } finally { await page.keyboard.up('ArrowUp'); await page.keyboard.up('Shift'); }
  await expect.poll(async () => (await debug(page)).state.clutch).toBe(1);
  await page.keyboard.press('ArrowUp'); await expect.poll(async () => (await debug(page)).state.gear).toBe(1);
  await expect(page.locator('#selected-gear')).toHaveText('1');
  // The launch button performs a progressive clutch engagement rather than an instantaneous lock.
  await page.locator('#launch').click();
  await expect.poll(async () => (await debug(page)).state.speedKmh, { timeout: 15000 }).toBeGreaterThan(10);
  await expect.poll(async () => (await debug(page)).state.clutch, { timeout: 10000 }).toBe(1);
  const moving = await debug(page); expect(moving.state.gear).toBe(1); expect(moving.state.wheelRpm).toBeGreaterThan(0);
  await page.keyboard.down('e');
  try {
    await page.keyboard.down('Shift'); await expect.poll(async () => (await debug(page)).state.clutch).toBe(0);
    await page.keyboard.press('ArrowUp'); await expect.poll(async () => (await debug(page)).state.gear).toBe(2);
    await page.keyboard.up('Shift'); await expect.poll(async () => (await debug(page)).state.clutch).toBe(1);
    await expect.poll(async () => (await debug(page)).state.pedal).toBeCloseTo(.2, 4);
    await expect.poll(async () => (await debug(page)).state.fuelRateGS).toBeGreaterThan(0);
    await page.screenshot({ path: 'evidence/v04-six-cylinders-driving.png', fullPage: true });
  } finally { await page.keyboard.up('Shift'); await page.keyboard.up('e'); }
  await page.getByRole('button', { name: 'Antrieb', exact: true }).click();
  for (const name of ['Schwungrad-Trägheit', 'Bohrung', 'Hub', 'Pleuellänge']) await expect(page.getByRole('slider', { name, exact: true })).toBeDisabled();
  expect((await debug(page)).state.geometry.boreMm).toBeCloseTo(84, 6);
  expect((await debug(page)).state.geometry.strokeMm).toBeCloseTo(84, 6);
  await range(page.getByRole('slider', { name: 'Achsübersetzung', exact: true }), 5);
  await expect.poll(async () => { const value = await debug(page); return value.state.totalRatio - value.config.vehicle.gears[value.state.gear - 1] * value.config.vehicle.finalDrive; }).toBeCloseTo(0, 5);
  await range(page.getByRole('slider', { name: 'Fahrzeugmasse', exact: true }), 3000);
  await expect.poll(async () => (await debug(page)).config.vehicle.massKg).toBe(3000);
  expect((await debug(page)).state.ignition).toBe(true);
  await page.screenshot({ path: 'evidence/v04-drivetrain-desktop.png', fullPage: true });
  await page.locator('#mute').click(); await expect.poll(async () => (await debug(page)).audio.rms).toBeLessThan(.00001);
  await page.locator('#stop').click(); await expect.poll(async () => (await debug(page)).state.ignition).toBe(false);
  await page.locator('#reset').click(); await expect.poll(async () => (await debug(page)).state?.rpm ?? Infinity).toBeLessThan(5);
  await writeFile('evidence/v04-physical-browser.json', JSON.stringify({ scope: 'Actual original C++ physics and Synthesizer PCM in Chromium AudioWorklet. Physical speaker listening is not covered.', idle: { rpm: idle.state.rpm, signal: idle.audio }, moving: { speedKmh: moving.state.speedKmh, gear: moving.state.gear, wheelRpm: moving.state.wheelRpm, clutch: moving.state.clutch }, errors }, null, 2));
  expect(errors).toEqual([]);
});

test('warm cooling: pump and fan alter heat transfers; thermal acceleration leaves the engine clock real-time', async ({ page }) => {
  test.setTimeout(45000); await page.goto('/'); await expect(page.locator('#connection')).toHaveText('Physischer Kern');
  await page.locator('#reset').click();
  await page.getByRole('button', { name: 'Kühlung', exact: true }).click(); await page.locator('#warm-cooling').click();
  await range(page.getByRole('slider', { name: 'Pumpen-Durchfluss', exact: true }), 0);
  await expect.poll(async () => (await debug(page)).state.coolantRadiatorKw).toBe(0);
  const off = await debug(page);
  await page.locator('#warm-cooling').click(); await range(page.getByRole('slider', { name: 'Pumpen-Durchfluss', exact: true }), 100);
  await expect.poll(async () => Math.abs((await debug(page)).state.coolantRadiatorKw)).toBeGreaterThan(5);
  const on = await debug(page); expect(on.state.coolantSlopeCS).not.toBeCloseTo(off.state.coolantSlopeCS, 3);
  await range(page.getByRole('slider', { name: 'Kühler-Wärmeübergang UA', exact: true }), 0);
  await expect.poll(async () => (await debug(page)).state.radiatorAmbientKw).toBe(0);
  const noRadiator = await debug(page);
  await range(page.getByRole('slider', { name: 'Kühler-Wärmeübergang UA', exact: true }), 1200);
  await range(page.getByRole('slider', { name: 'Lüfterstufe', exact: true }), 3);
  await expect.poll(async () => (await debug(page)).state.heatOutKw).toBeGreaterThan(noRadiator.state.heatOutKw + 5);
  await page.locator('#thermal-rate').selectOption('30'); const start = await debug(page); await page.waitForTimeout(1200); const end = await debug(page);
  expect(end.state.thermalTimeS - start.state.thermalTimeS).toBeGreaterThan(20); expect(end.state.t - start.state.t).toBeLessThan(4);
  expect(Math.abs(end.state.energyResidualJ)).toBeLessThan(.01);
  await page.screenshot({ path: 'evidence/v04-cooling-desktop.png', fullPage: true });
  await writeFile('evidence/v04-cooling-response.json', JSON.stringify({ off: off.state, on: on.state, radiatorBefore: noRadiator.state, after: end.state, thermalRate: 30 }, null, 2));
});

test('six-cylinder cutaway and cooling fit mobile and tablet while live pressure is available', async ({ page }) => {
  test.setTimeout(45000); await page.setViewportSize({ width: 375, height: 812 }); await page.goto('/');
  await expect(page.locator('#connection')).toHaveText('Physischer Kern'); await page.locator('#reset').click();
  await page.locator('#start').click(); await expect.poll(async () => (await debug(page)).state?.rpm, { timeout: 12000 }).toBeGreaterThan(700);
  await expect(page.locator('#cylinder-pressure')).not.toHaveText('—');
  await page.screenshot({ path: 'evidence/v04-mechanics-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Kühlung', exact: true }).click(); await page.locator('#warm-cooling').click();
  await page.screenshot({ path: 'evidence/v04-cooling-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 768, height: 1024 }); await page.getByRole('button', { name: 'Mechanik', exact: true }).click();
  await page.screenshot({ path: 'evidence/v04-mechanics-tablet.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('#stop').click();
});

