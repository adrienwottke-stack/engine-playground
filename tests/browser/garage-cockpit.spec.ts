import { test, expect, type Page } from '@playwright/test';
import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { cockpitNeedleAngle, COCKPIT_SCALES } from '../../src/cockpit-gauges';

const evidence = process.env.EP_WORKSHOP_LIGHTING ? 'evidence/workshop-lighting-01' : process.env.EP_WORKSHOP_DETAIL ? 'evidence/workshop-detail-01' : process.env.EP_COCKPIT_PREVIEW ? 'evidence/cockpit-feedback-2026-10-24' : 'evidence/garage-refinement-02';
const workshopUrl = process.env.EP_COCKPIT_PREVIEW ? '/cockpit-preview/index.html' : '/';
test.use({ trace: 'off', launchOptions: { args: ['--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] } });
const state = (page: Page) => page.evaluate(() => {
  const d = (window as any).__playground;
  return { state: d.state ? { source: d.state.source, engineName: d.state.engineName, rpm: d.state.rpm, speedKmh: d.state.speedKmh, gear: d.state.gear, ignition: d.state.ignition, starter: d.state.starter, geometry: d.state.geometry } : null, scene: d.engine3d.scene, config: d.config };
});

function observe(page: Page) {
  const errors: string[] = [], failures: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('requestfailed', request => { if (!request.failure()?.errorText.includes('ERR_ABORTED')) failures.push(request.url()); });
  return { errors, failures };
}

async function collectCockpitSamples(page: Page) {
  return page.evaluate(async () => {
    const rows: any[] = [], began = performance.now();
    let previous = '';
    while (performance.now() - began < 1500) {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      const d = (window as any).__playground, native = d.state;
      const rpm = document.querySelector<HTMLElement>('[data-cockpit-gauge="rpm"]')!, torque = document.querySelector<HTMLElement>('[data-cockpit-gauge="speedKmh"]')!;
      const signature = `${rpm.dataset.value}/${torque.dataset.value}`;
      if (!native || signature === previous) continue;
      previous = signature;
      rows.push({ source: native.source, rpm: native.rpm, speedKmh: native.speedKmh, shownRpm: Number(rpm.dataset.value), shownSpeed: Number(torque.dataset.value), rpmAngle: Number(rpm.dataset.angle), speedAngle: Number(torque.dataset.angle), rpmText: document.getElementById('rpm')!.textContent, speedText: document.getElementById('speed')!.textContent });
    }
    // The first row may predate this observer. Later changed pairs are read in
    // the same animation frame as the application's 20 Hz instrument update.
    return rows.slice(1);
  });
}

test('isolated analog cockpit keeps the real readout nodes and readable black dials at desktop and 375px', async ({ page }) => {
  test.setTimeout(45000);
  await mkdir(evidence, { recursive: true });
  const errors = observe(page);
  const bundle = await build({ entryPoints: ['src/cockpit-gauges.ts'], bundle: true, write: false, format: 'iife', globalName: 'CockpitModule' });
  const css = await Promise.all(['src/style.css', 'src/classic-shell.css', 'src/cockpit-gauges.css'].map(path => readFile(path, 'utf8')));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.setContent(`<style>${css.join('\n')}</style><div class="workspace"><aside class="control-panel"><h2 id="engine-name">BMW M54B30 <span>3,0 L · REIHENSECHSER</span></h2><section id="garage-cockpit" class="garage-instruments garage-cockpit-host"><div><strong id="rpm">0</strong></div><div><strong id="torque">0</strong></div><div><strong id="speed">0</strong></div><div><strong id="power">0,0</strong></div></section></aside></div>`);
  await page.evaluate(() => document.body.classList.add('classic-ui'));
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.evaluate(() => {
    const fixture = { rpm: document.getElementById('rpm'), torque: document.getElementById('torque'), speed: document.getElementById('speed'), power: document.getElementById('power') };
    const gauges = (window as any).CockpitModule.installCockpitGauges(document.getElementById('garage-cockpit'));
    (window as any).__cockpitFixture = { gauges, fixture };
    gauges.update(Object.freeze({ rpm: 3450, speedKmh: 82.4 }));
  });
  expect(await page.evaluate(() => {
    const { fixture } = (window as any).__cockpitFixture;
    return fixture.rpm === document.getElementById('rpm') && fixture.speed === document.getElementById('speed') && fixture.torque === document.getElementById('torque') && fixture.power === document.getElementById('power');
  })).toBe(true);
  await expect(page.locator('[data-cockpit-gauge="rpm"]')).toHaveAttribute('data-angle', String(cockpitNeedleAngle(3450, COCKPIT_SCALES.rpm)));
  await expect(page.locator('[data-cockpit-gauge="speedKmh"]')).toHaveAttribute('data-value', '82.4');
  await expect(page.locator('[data-redline-start]')).toHaveAttribute('data-redline-start', '6500');
  await page.locator('#garage-cockpit').screenshot({ path: `${evidence}/cockpit-desktop-component.png` });
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('#garage-cockpit').screenshot({ path: `${evidence}/cockpit-mobile-component.png` });
  await page.evaluate(() => (window as any).__cockpitFixture.gauges.update({ rpm: 9200, speedKmh: -14 }));
  await expect(page.locator('#rpm')).toHaveText('9.200');
  await expect(page.locator('[data-cockpit-gauge="rpm"]')).toHaveAttribute('data-range', 'above');
  await expect(page.locator('#speed')).toHaveText('-14');
  await page.evaluate(() => (window as any).__cockpitFixture.gauges.update(null));
  await expect(page.locator('#rpm')).toHaveText('—');
  expect(await page.locator('[data-cockpit-gauge="rpm"] [data-cockpit-needle]').evaluate(node => getComputedStyle(node).opacity)).toBe('0');
  await page.evaluate(() => (window as any).__cockpitFixture.gauges.destroy());
  expect(await page.evaluate(() => ['rpm','speed','torque','power'].every(id => document.getElementById(id)?.isConnected))).toBe(true);
  expect(errors.errors).toEqual([]); expect(errors.failures).toEqual([]);
});

test('M54 cockpit follows native RPM and speed; canvas focus keeps gear arrows and presentation switches working', async ({ page }) => {
  test.setTimeout(180000);
  await mkdir(evidence, { recursive: true });
  const errors = observe(page);
  await page.goto(workshopUrl);
  await expect(page.locator('.engine-three-host')).toHaveAttribute('data-webgl', 'ready', { timeout: 35000 });
  await expect(page.locator('#engine-name')).toContainText('BMW M54B30');
  await expect(page.locator('#engine-name')).toContainText('3,0 L');
  await expect(page.locator('#start')).toBeEnabled({ timeout: 20000 });
  await page.locator('#reset').click();
  await expect.poll(async () => (await state(page)).state?.ignition).toBe(false);
  const initial = await state(page), geometry = initial.state?.geometry;
  expect(initial.state?.engineName).toContain('M54B30');
  expect(geometry.boreMm).toBe(84); expect(geometry.strokeMm).toBe(89.6);
  expect(6 * Math.PI / 4 * geometry.boreMm ** 2 * geometry.strokeMm / 1e6).toBeCloseTo(2.979, 3);
  await page.locator('#start').click();
  await expect.poll(async () => (await state(page)).state?.rpm ?? 0, { timeout: 20000 }).toBeGreaterThan(700);
  await expect.poll(async () => (await state(page)).state?.starter, { timeout: 12000 }).toBe(false);
  const idleSamples = await collectCockpitSamples(page);
  expect(idleSamples.length).toBeGreaterThan(2);
  for (const row of idleSamples) {
    expect(row.source).toBe('ange-physical');
    expect(row.shownRpm).toBe(row.rpm); expect(row.shownSpeed).toBe(row.speedKmh);
    expect(row.rpmAngle).toBe(cockpitNeedleAngle(row.rpm, COCKPIT_SCALES.rpm));
    expect(row.speedAngle).toBe(cockpitNeedleAngle(row.speedKmh, COCKPIT_SCALES.speedKmh));
  }
  const canvas = page.locator('#engine-3d-canvas');
  await canvas.click();
  await expect(canvas).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect.poll(async () => (await state(page)).state?.gear).toBe(1);
  await page.keyboard.press('ArrowUp');
  await expect.poll(async () => (await state(page)).state?.gear).toBe(2);
  await page.keyboard.press('ArrowDown');
  await expect.poll(async () => (await state(page)).state?.gear).toBe(1);
  await page.keyboard.press('ArrowDown');
  await expect.poll(async () => (await state(page)).state?.gear).toBe(0);
  await page.locator('#throttle').press('End');
  await expect.poll(async () => (await state(page)).state?.rpm ?? 0, { timeout: 15000 }).toBeGreaterThan(2500);
  const acceleratedSamples = await collectCockpitSamples(page);
  expect(acceleratedSamples.some(row => row.shownRpm > 2500)).toBe(true);
  for (const row of acceleratedSamples) {
    expect(row.shownRpm).toBe(row.rpm); expect(row.shownSpeed).toBe(row.speedKmh);
  }
  await page.locator('#throttle').press('Home');
  await page.locator('#start').click();
  await expect.poll(async () => (await state(page)).state?.ignition).toBe(false);
  const presentations: Record<string, any> = {};
  for (const mode of ['closed','cutaway','flow']) {
    await page.locator(`button[data-presentation="${mode}"]`).click();
    await expect(page.locator(`button[data-presentation="${mode}"]`)).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(async () => (await state(page)).scene?.presentation).toBe(mode);
    const scene = (await state(page)).scene;
    presentations[mode] = scene.visibility;
    expect(scene.visibility.mechanical).toBe(mode === 'cutaway');
    expect(scene.visibility.housing).toBe(mode !== 'flow');
    await page.locator('.engine-three-stage').screenshot({ path: `${evidence}/presentation-${mode}.png`, timeout: 30000 });
  }
  expect(presentations.closed).not.toEqual(presentations.cutaway);
  expect(presentations.cutaway).not.toEqual(presentations.flow);
  await page.locator('button[data-presentation="cutaway"]').click();
  await page.screenshot({ path: `${evidence}/cockpit-workshop-desktop.png`, fullPage: true, timeout: 30000 });
  expect(errors.errors).toEqual([]); expect(errors.failures).toEqual([]);
  await writeFile(`${evidence}/cockpit-native.json`, JSON.stringify({ passed: true, initial, idleSamples, acceleratedSamples, presentations, errors }, null, 2));
});

test('375px M54 cockpit and three view controls fit with touch-sized targets', async ({ page }) => {
  test.setTimeout(90000);
  await mkdir(evidence, { recursive: true });
  const errors = observe(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(workshopUrl);
  await expect(page.locator('.engine-three-host')).toHaveAttribute('data-webgl', 'ready', { timeout: 35000 });
  await expect(page.locator('#engine-name')).toContainText('M54B30');
  await expect(page.locator('[data-cockpit-gauge]')).toHaveCount(2);
  for (const selector of ['#start','#throttle','#clutch','#three-camera','#three-camera-reset','[data-gear="1"]','button[data-presentation="closed"]','button[data-presentation="cutaway"]','button[data-presentation="flow"]']) {
    const box = await page.locator(selector).boundingBox();
    expect(box?.height, `${selector} touch target`).toBeGreaterThanOrEqual(44);
  }
  for (const mode of ['closed','cutaway','flow']) {
    await page.locator(`button[data-presentation="${mode}"]`).click();
    await expect.poll(async () => (await state(page)).scene?.presentation).toBe(mode);
  }
  await page.locator('button[data-presentation="cutaway"]').click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `${evidence}/cockpit-workshop-mobile.png`, fullPage: true, timeout: 30000 });
  await page.screenshot({ path: `${evidence}/workshop-mobile-viewport.png`, timeout: 30000 });
  expect(errors.errors).toEqual([]); expect(errors.failures).toEqual([]);
});

test('desktop speedometer and workshop preview render without starting a native load run', async ({ page }) => {
  test.setTimeout(120000);
  await mkdir(evidence, { recursive: true });
  const errors = observe(page);
  await page.goto(workshopUrl);
  await expect(page.locator('.engine-three-host')).toHaveAttribute('data-webgl', 'ready', { timeout: 45000 });
  await expect(page.locator('[data-cockpit-gauge]')).toHaveCount(2);
  await expect(page.locator('[data-cockpit-gauge="speedKmh"]')).toBeVisible();
  await expect(page.locator('#torque')).toBeHidden();
  await expect(page.locator('#power')).toBeHidden();
  await expect(page.locator('#speed')).toBeVisible();
  if (process.env.EP_WORKSHOP_LIGHTING) {
    await expect.poll(async () => JSON.parse(await page.locator('.engine-three-host').getAttribute('data-workshop-lighting') ?? '{}').shadowReady, { timeout: 20000 }).toBe(true);
  }
  await page.screenshot({ path: `${evidence}/workshop-desktop-initial.png`, timeout: 30000 });
  const initialRendering = await page.locator('.engine-three-host').evaluate(node => ({ ...((node as HTMLElement).dataset) }));
  console.log('Workshop renderer:', JSON.stringify(initialRendering));
  for (const mode of ['closed', 'cutaway', 'flow']) {
    await page.locator(`button[data-presentation="${mode}"]`).click();
    await expect.poll(async () => (await state(page)).scene?.presentation, { timeout: 20000 }).toBe(mode);
  }
  await page.locator('button[data-presentation="cutaway"]').click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `${evidence}/cockpit-workshop-desktop.png`, fullPage: true, timeout: 30000 });
  await page.screenshot({ path: `${evidence}/workshop-desktop-viewport.png`, timeout: 30000 });
  if (process.env.EP_WORKSHOP_DETAIL) {
    const room = JSON.parse(await page.locator('.engine-three-host').getAttribute('data-workshop') ?? '{}');
    expect(['workshop-detail-01', 'workshop-background-01']).toContain(room.revision);
    expect(room.textureMaps).toBe(6);
    expect(room.batches).toBeLessThanOrEqual(40);
    expect(room.sourceMeshes).toBeGreaterThan(500);
    await writeFile(`${evidence}/workshop-checks.json`, JSON.stringify({ room, errors }, null, 2));
  }
  if (process.env.EP_WORKSHOP_LIGHTING) {
    const lighting = JSON.parse(await page.locator('.engine-three-host').getAttribute('data-workshop-lighting') ?? '{}');
    expect(lighting.revision).toBe('workshop-lighting-01');
    expect(lighting.shadowReady).toBe(true);
    expect(lighting.reflectionSource).toBe('workshop-room');
    expect(lighting.casters).toBeGreaterThan(20);
    expect(lighting.receivers).toBeGreaterThan(20);
    await page.locator('#three-camera').selectOption('intake');
    await expect(page.locator('.engine-three-host')).toHaveAttribute('data-workshop-open-wall', 'true');
    await page.screenshot({ path: `${evidence}/workshop-lighting-intake.png`, timeout: 30000 });
    await page.locator('#three-camera-reset').click();
    await writeFile(`${evidence}/lighting-checks.json`, JSON.stringify({ lighting, initialRendering, errors }, null, 2));
  }
  expect(errors.errors).toEqual([]); expect(errors.failures).toEqual([]);
});
