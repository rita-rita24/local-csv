import { extractConstDeclaration as extract } from './localcsv-source-audit.mjs';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const names = ['prependBytes', 'encodeUtf16Bytes', 'decodeUtf16Bytes', 'detectBomEncoding', 'decodeWithTextDecoder', 'strictTextDecoderResult', 'collectDecodeWarnings', 'decodeByEncoding', 'encodeToBytes', 'decodeBytesWithMeta', '_isPlainAsciiBuffer', 'decodeFileBytesWithMeta', 'buildCsvLine', 'calcRowBytes'];
const old = await fs.readFile(new URL('./performance-results/round2/baseline-encoding-stats.js', import.meta.url), 'utf8');
const html = await fs.readFile(new URL('../local-csv.html', import.meta.url), 'utf8');
const after = names.map(name => extract(html, name)).join('\n');
const browser = await chromium.launch({ headless: true, executablePath: process.env.LOCALCSV_CHROMIUM_PATH });
try {
  const page = await browser.newPage();
  const result = await page.evaluate(async ({ old, after }) => {
    const load = code => new Function('normalizeEncoding', 'supportsBom', 'HAS_LEGACY_ENCODING_LIB', 'ENCODING_TO_LIBRARY', 'ENCODING_TO_DECODER_LABEL', 'getEncodingDisplayName', code + '\nreturn { decodeFileBytesWithMeta, calcRowBytes };')(value => value, () => true, false, {}, {}, value => value);
    const versions = { before: load(old), after: load(after) };
    const bytes = new TextEncoder().encode('abcdef012345,日本語😀\r\n'.repeat(1000000));
    const rows = Array.from({ length: 100000 }, (_, row) => Array.from({ length: 20 }, (_, col) => `${row}:${col} xxxxxxxxxxxx`));
    const samples = [];
    for (let run = 0; run < 7; run++) {
      for (const version of (run % 2 ? ['after', 'before'] : ['before', 'after'])) {
        const functions = versions[version];
        let start = performance.now();
        const decoded = functions.decodeFileBytesWithMeta(bytes.buffer, 'utf-8');
        samples.push({ operation: 'decode-with-validation', version, run, ms: performance.now() - start, length: decoded.text.length, warnings: decoded.warnings });
        start = performance.now();
        let count = 0;
        for (const row of rows) count += functions.calcRowBytes(row, ',', 'utf-8', 'auto', '\r\n');
        samples.push({ operation: 'size-count', version, run, ms: performance.now() - start, bytes: count });
      }
    }
    const frames = [];
    let last = await new Promise(requestAnimationFrame);
    for (let i = 0; i < 12; i++) { const now = await new Promise(requestAnimationFrame); frames.push(now - last); last = now; }
    return { samples, frameIntervals: frames };
  }, { old, after });
  await fs.writeFile(process.env.LOCALCSV_MICROBENCH_OUTPUT || new URL('./performance-results/round2/microbench.json', import.meta.url), JSON.stringify({ measuredAt: new Date().toISOString(), browser: browser.version(), ...result }, null, 2));
  console.log(result);
} finally { await browser.close(); }
