// READMEと紹介ページの画像を、同梱サンプル・隔離プロファイルで再生成する。
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const browser = await chromium.launch({
  headless: true,
  ...(process.env.LOCALCSV_CHROMIUM_PATH ? { executablePath: process.env.LOCALCSV_CHROMIUM_PATH } : {}),
});
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, locale: 'ja-JP', reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', request => { if (/^https?:/.test(request.url())) errors.push(request.url()); });
  await page.goto(pathToFileURL(path.join(ROOT, 'LocalCSV.html')).href);
  await page.locator('#pasteZone').waitFor();
  await page.evaluate(() => { window.showOpenFilePicker = undefined; });
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#openFileBtn').click();
  await (await chooser).setFiles(path.join(ROOT, 'public/sample_preview.csv'));
  await page.locator('#wizHeader').check();
  await page.locator('#wizNextBtn').click();
  await page.locator('#wizImportBtn').click();
  await page.locator('#importWizardOverlay.show').waitFor({ state: 'hidden' });
  await page.locator('#tableBody td').first().waitFor();
  await page.locator('#settingsBtn').click();
  await page.locator('#settingShowStatusBar').check();
  await page.locator('#settingsCloseBtn').click();
  await page.waitForFunction(() => document.querySelector('#saveStatus').dataset.state === 'saved');
  // 通知とツールチップが消えてから、同じ画角で撮影する。
  await page.locator('.toast').waitFor({ state: 'hidden' });
  await page.locator('#searchInput').focus();
  await page.mouse.move(0, 0);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(ROOT, 'public/preview.png') });
  await page.locator('#themeModeToggle').click();
  await page.locator('#searchInput').focus();
  await page.mouse.move(0, 0);
  await page.waitForFunction(() => document.documentElement.style.colorScheme === 'dark');
  await page.screenshot({ path: path.join(ROOT, 'public/preview-dark.png') });
  assert.deepEqual(errors, [], 'Screenshots require an error-free, offline editor');
  console.log('Updated public/preview.png and public/preview-dark.png (1440 × 960)');
} finally {
  await browser.close();
}
