const { chromium } = require('playwright-core');
const fs = require('node:fs/promises');
const path = require('node:path');

(async () => {
  const folder = path.resolve(__dirname, '../extension/icons');
  const svg = await fs.readFile(path.join(folder, 'icon.svg'), 'utf8');
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true });
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    for (const size of [16, 48, 128]) {
      await page.setContent(`<style>body{margin:0}svg{width:${size}px;height:${size}px;display:block}</style>${svg}`);
      await page.locator('svg').screenshot({ path: path.join(folder, `${size}.png`), omitBackground: true });
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
