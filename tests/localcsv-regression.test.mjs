import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const LOCALCSV_PATH = path.join(ROOT_DIR, "LocalCSV.html");
const INDEX_PATH = path.join(ROOT_DIR, "index.html");

const html = fs.readFileSync(LOCALCSV_PATH, "utf8");
const indexHtml = fs.readFileSync(INDEX_PATH, "utf8");

const FUNCTION_NAMES = [
  "isImeCompositionKeyEvent",
  "detectSpaceSeparated",
  "_getDelimiterSampleText",
  "detectDelimiter",
  "CSV_PARSE_ERROR_UNCLOSED_QUOTE",
  "parseCSV",
  "_parseClipboardTsv",
  "SPREADSHEET_FORMULA_PREFIX_RE",
  "sanitizeSpreadsheetFormulaCell",
  "findNoQuoteRisks",
  "beginSnapshotEpoch",
  "ensureRowOwned",
  "setCellValue",
  "generateOutputAsync",
];

const extractConstDeclaration = (source, name) => {
  const marker = `const ${name} =`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${name} declaration not found`);
  const regexPrefixChars = new Set(["=", "(", "{", "[", ",", ":", "!", "?", ";"]);
  const previousSignificantChar = (index) => {
    for (let i = index - 1; i >= start; i--) {
      if (!/\s/.test(source[i])) return source[i];
    }
    return "";
  };

  let depth = 0;
  let quote = "";
  let escaped = false;
  let regexCharClass = false;
  let lineComment = false;
  let blockComment = false;

  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    const next = source[i + 1];

    if (lineComment) {
      if (ch === "\n" || ch === "\r") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (ch === "*" && next === "/") {
        blockComment = false;
        i++;
      }
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (quote === "/") {
        if (ch === "[") regexCharClass = true;
        else if (ch === "]") regexCharClass = false;
        else if (ch === "/" && !regexCharClass) {
          quote = "";
        }
        continue;
      }
      if (ch === quote) quote = "";
      continue;
    }
    if (ch === "/" && next === "/") {
      lineComment = true;
      i++;
      continue;
    }
    if (ch === "/" && next === "*") {
      blockComment = true;
      i++;
      continue;
    }
    if (ch === "/" && regexPrefixChars.has(previousSignificantChar(i))) {
      quote = "/";
      regexCharClass = false;
      continue;
    }
    if (ch === "'" || ch === "\"" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "(" || ch === "{" || ch === "[") {
      depth++;
      continue;
    }
    if (ch === ")" || ch === "}" || ch === "]") {
      depth--;
      continue;
    }
    if (ch === ";" && depth === 0) return source.slice(start, i + 1);
  }

  assert.fail(`${name} declaration was not terminated`);
};

const loadCsvCore = () => {
  const declarations = FUNCTION_NAMES
    .map((name) => extractConstDeclaration(html, name))
    .join("\n");
  const script = new vm.Script(`
    const MAX_DELIMITER_SAMPLE_LINES = 8;
    const NO_QUOTE_RISK_SAMPLE_LIMIT = 3;
    const state = { data: [], quoteStyle: "auto", newline: "lf" };
    let _ownedRowsSinceSnapshot = null;
    ${declarations}
    ({
      isImeCompositionKeyEvent,
      detectSpaceSeparated,
      _getDelimiterSampleText,
      detectDelimiter,
      parseCSV,
      _parseClipboardTsv,
      sanitizeSpreadsheetFormulaCell,
      findNoQuoteRisks,
      generateOutputAsync,
      setCellValue,
      _setStateForTest: (patch) => Object.assign(state, patch),
    });
  `);
  return script.runInNewContext({ setTimeout });
};

const loadFileOutputCore = ({ picker } = {}) => {
  const declarations = [
    "SPREADSHEET_FORMULA_PREFIX_RE", "sanitizeSpreadsheetFormulaCell",
    "beginSnapshotEpoch", "ensureRowOwned", "setCellValue", "generateOutputAsync",
    "normalizeLineEndingSetting", "cloneFileOutputMeta", "getCurrentOutputMeta",
    "isSameOutputMeta", "setOpenFileContext", "hasOverwriteFormatMismatch",
    "getFormatLabel", "getFormatExt", "_getSuggestedOutputName", "buildBlob", "_writeFileBlob", "saveFile", "copyData", "downloadData",
  ].map((name) => extractConstDeclaration(html, name)).join("\n");
  return new vm.Script(`
    const state = {
      data: [], delimiter: ",", quoteStyle: "auto", newline: "lf", encoding: "utf-8", bom: false,
    };
    let _ownedRowsSinceSnapshot = null;
    let _fileHandle = null;
    let _openedFileMeta = null;
    let _fileContextRevision = 0;
    let _saveFileInProgress = false;
    const toasts = [], downloads = [], clipboard = [], encodingChecks = [], buttonStates = [];
    const $filenameBadge = { textContent: "" };
    const normalizeExportEncoding = (encoding) => encoding || "utf-8";
    const supportsBom = (encoding) => encoding.startsWith("utf-");
    const updateFilenameBadge = (name) => { $filenameBadge.textContent = name; };
    const updateButtonLabels = () => { buttonStates.push(_saveFileInProgress); };
    const commitActiveCellEdit = () => {};
    const saveToStorage = () => {};
    const isEnglish = () => false;
    const escapeHTML = (text) => text;
    const formatLocalDateStamp = () => "20260911";
    const showToast = (message, type) => toasts.push({ message, type });
    const confirmNoQuoteRisk = () => true;
    const confirmLegacyEncodingRoundTrip = (request) => { encodingChecks.push(request); return true; };
    const buildEncodedBlob = (text, encoding, bom, mimeType) => ({ text, encoding, bom, mimeType });
    const downloadPreparedBlob = (blob, filename, message) => downloads.push({ blob, filename, message });
    const copyTextToClipboard = async (text) => { clipboard.push(text); return true; };
    const getDsvFormatIdByDelimiter = (delimiter) => delimiter === "\\t" ? "tsv" : "csv";
    const getExportFormatConfig = (format) => ({ label: format.toUpperCase(), extension: format });
    const EXPORT_FALLBACK_ENCODING = "utf-8";
    ${declarations}
    ({
      state, toasts, downloads, clipboard, encodingChecks, buttonStates,
      saveFile, copyData, downloadData, setCellValue, setOpenFileContext, getCurrentOutputMeta,
      hasOverwriteFormatMismatch, _getSuggestedOutputName,
      getFileContext: () => ({ fileHandle: _fileHandle, outputMeta: _openedFileMeta }),
    });
  `).runInNewContext({ setTimeout, window: { showSaveFilePicker: picker } });
};

const createLocalStorageMock = (initialEntries = []) => {
  const store = new Map(initialEntries);
  return {
    get length() {
      return store.size;
    },
    getItem(key) {
      const normalizedKey = String(key);
      return store.has(normalizedKey) ? store.get(normalizedKey) : null;
    },
    setItem(key, value) {
      store.set(String(key), String(value));
    },
    removeItem(key) {
      store.delete(String(key));
    },
    key(index) {
      return [...store.keys()][index] ?? null;
    },
    _entries() {
      return [...store.entries()];
    },
  };
};

const createIndexedDBMock = ({ failDeletes = false } = {}) => {
  const stores = new Map();
  let initialized = false;
  const ensureStore = (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    return stores.get(name);
  };
  const createDb = () => ({
    createObjectStore(name) {
      ensureStore(name);
    },
    transaction(storeName) {
      const tx = {
        error: null,
        oncomplete: null,
        onerror: null,
        objectStore() {
          const objectStore = ensureStore(storeName);
          return {
            get(key) {
              const request = {};
              queueMicrotask(() => {
                request.result = objectStore.get(key);
                request.onsuccess?.();
              });
              return request;
            },
            put(value, key) {
              const request = {};
              queueMicrotask(() => {
                objectStore.set(key, value);
                request.result = key;
                request.onsuccess?.();
                tx.oncomplete?.();
              });
              return request;
            },
            delete(key) {
              const request = {};
              queueMicrotask(() => {
                if (failDeletes) {
                  tx.error = new Error(`forced delete failure for ${key}`);
                  request.error = tx.error;
                  request.onerror?.();
                  tx.onerror?.();
                  return;
                }
                objectStore.delete(key);
                request.result = undefined;
                request.onsuccess?.();
                tx.oncomplete?.();
              });
              return request;
            },
          };
        },
      };
      return tx;
    },
  });
  return {
    open() {
      const request = {};
      queueMicrotask(() => {
        request.result = createDb();
        if (!initialized) {
          initialized = true;
          request.onupgradeneeded?.();
        }
        request.onsuccess?.();
      });
      return request;
    },
    _store(name = "kvStore") {
      return ensureStore(name);
    },
  };
};

const loadStorageMigrationCore = ({ localStorage, indexedDB }) => {
  const declarations = [
    "const PRO_STATE_STORAGE_KEY = 'csvEditor_state_pro';",
    "const LEGACY_STATE_STORAGE_KEY = 'csvEditor_state';",
    extractConstDeclaration(html, "IDBStore"),
    extractConstDeclaration(html, "migrateFromLocalStorage"),
  ].join("\n");
  const script = new vm.Script(`
    ${declarations}
    ({ IDBStore, migrateFromLocalStorage });
  `);
  return script.runInNewContext({ indexedDB, localStorage, queueMicrotask });
};

const loadPersistedRowsCore = (chunkEntries) => {
  const declarations = [
    "const PRO_STATE_STORAGE_KEY = 'csvEditor_state_pro';",
    "const PERSIST_CHUNK_VERSION = 3;",
    "const PERSIST_STORAGE_KIND = 'chunked_rows';",
    "const PERSIST_CHUNK_RECORD_KIND = 'rows_chunk';",
    "const PERSIST_CHUNK_INTEGRITY_ERROR = 'persist_chunk_integrity_error';",
    "const PRO_STATE_CHUNK_KEY_PREFIX = `${PRO_STATE_STORAGE_KEY}::chunk::`;",
    "const PERSIST_CHUNK_KEY_SEGMENT_RE = /^[0-9A-Za-z_-]+$/;",
    "const IDBStore = { get: async (key) => chunkMap.get(key) };",
    extractConstDeclaration(html, "getPersistChunkKey"),
    extractConstDeclaration(html, "getPersistDraftChunkKey"),
    extractConstDeclaration(html, "parsePersistChunkKey"),
    extractConstDeclaration(html, "hashPersistString"),
    extractConstDeclaration(html, "hashPersistRows"),
    extractConstDeclaration(html, "getExpectedPersistChunkLength"),
    extractConstDeclaration(html, "createPersistChunkIntegrityError"),
    extractConstDeclaration(html, "isPersistChunkIntegrityError"),
    extractConstDeclaration(html, "normalizePersistChunkRefs"),
    extractConstDeclaration(html, "normalizePersistedChunkRecord"),
    extractConstDeclaration(html, "loadPersistedChunkRows"),
  ].join("\n");
  const script = new vm.Script(`
    ${declarations}
    ({ getPersistDraftChunkKey, hashPersistRows, isPersistChunkIntegrityError, loadPersistedChunkRows });
  `);
  return script.runInNewContext({ chunkMap: new Map(chunkEntries) });
};

const buildRows = (separator, rows = 20) => (
  Array.from({ length: rows }, (_, index) => `r${index + 1};value${index + 1}`).join(separator)
);

const quoteCsvCell = (value) => `"${String(value).replace(/"/g, "\"\"")}"`;
const serializeQuotedCsv = (rows) => rows.map((row) => row.map(quoteCsvCell).join(",")).join("\n");
const cloneJson = (value) => JSON.parse(JSON.stringify(value));
const lineCountFor = (text) => text.split(/\r\n|\r|\n/).length;
const extractCspDirectives = (source, label) => {
  const metaMatch = source.match(/<meta\s+http-equiv="Content-Security-Policy"[\s\S]*?>/i);
  assert.ok(metaMatch, `${label}: CSP meta tag not found`);
  const contentMatch = metaMatch[0].match(/\bcontent="([^"]+)"/i);
  assert.ok(contentMatch, `${label}: CSP content not found`);
  return new Map(
    contentMatch[1]
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [name, ...values] = part.split(/\s+/);
        return [name, values.join(" ")];
      }),
  );
};
const assertSourceOrder = (source, startMarker, firstMarker, secondMarker, label) => {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `${label}: start marker not found`);
  const first = source.indexOf(firstMarker, start);
  const second = source.indexOf(secondMarker, start);
  assert.notEqual(first, -1, `${label}: first marker not found`);
  assert.notEqual(second, -1, `${label}: second marker not found`);
  assert.ok(first < second, `${label}: ${firstMarker} should appear before ${secondMarker}`);
  assert.ok(first - start < 220, `${label}: IME guard should be at the top of the handler`);
};
const assertOrderWithin = (source, firstMarker, secondMarker, label) => {
  const first = source.indexOf(firstMarker);
  const second = source.indexOf(secondMarker);
  assert.notEqual(first, -1, `${label}: first marker not found`);
  assert.notEqual(second, -1, `${label}: second marker not found`);
  assert.ok(first < second, `${label}: ${firstMarker} should appear before ${secondMarker}`);
};
const csv = loadCsvCore();

{
  // IndexedDBの書き込み中断では、errorなしでabortだけが発生する場合がある。
  const localStorage = createLocalStorageMock();
  const indexedDB = {
    open() {
      const request = {};
      queueMicrotask(() => {
        request.result = {
          transaction() {
            const transaction = { objectStore: () => ({ put() {} }), error: null };
            queueMicrotask(() => transaction.onabort?.());
            return transaction;
          },
        };
        request.onsuccess();
      });
      return request;
    },
  };
  const storage = loadStorageMigrationCore({ localStorage, indexedDB });
  await storage.IDBStore.open();
  let timeout;
  try {
    await Promise.race([
      storage.IDBStore.set("aborted-save", { rows: [["latest value"]] }),
      new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error("aborted IDB write left autosave pending")), 100); }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
  assert.equal(storage.IDBStore.getFallbackKind(), "localStorage", "aborted writes should use the existing fallback");
  assert.deepEqual(cloneJson(await storage.IDBStore.get("aborted-save")), { rows: [["latest value"]] });
}

{
  // 小さな代替保存が成功しても、未保存の行チャンクを隠してはならない。
  const CHUNK_KEY = "csvEditor_state_pro::chunk::quota::0";
  const SECOND_CHUNK_KEY = "csvEditor_state_pro::chunk::quota::1";
  const MANIFEST_KEY = "csvEditor_state_pro";
  const localStorage = createLocalStorageMock();
  const writeLocal = localStorage.setItem.bind(localStorage);
  const removeLocal = localStorage.removeItem.bind(localStorage);
  const failedWrites = new Set();
  const failedRemovals = new Set();
  localStorage.setItem = (key, value) => {
    if (failedWrites.has(key)) throw new Error(`quota exceeded for ${key}`);
    writeLocal(key, value);
  };
  localStorage.removeItem = (key) => {
    if (failedRemovals.has(key)) throw new Error(`delete blocked for ${key}`);
    removeLocal(key);
  };
  const store = loadStorageMigrationCore({
    localStorage,
    indexedDB: { open: () => { throw new Error("IndexedDB unavailable"); } },
  }).IDBStore;
  await store.open();
  await store.set(CHUNK_KEY, { rows: [["previous persisted value"]] });
  failedWrites.add(CHUNK_KEY);
  await store.set(CHUNK_KEY, { rows: [["latest memory value"]] });
  assert.deepEqual(cloneJson(await store.get(CHUNK_KEY)), { rows: [["latest memory value"]] },
    "failed fallback updates must read the new memory value ahead of stale localStorage");
  assert.equal(store.getFallbackKind(), "memory");
  await store.set(MANIFEST_KEY, { rowChunkRefs: [{ key: CHUNK_KEY }] });
  assert.equal(store.getFallbackKind(), "memory", "a persisted manifest must not mark an unpersisted chunk durable");

  failedWrites.add(SECOND_CHUNK_KEY);
  await store.set(SECOND_CHUNK_KEY, { rows: [["another memory chunk"]] });
  await store.remove(MANIFEST_KEY);
  assert.equal(await store.get(MANIFEST_KEY), undefined, "removing a persisted key must also remove its memory cache");
  assert.equal(store.getFallbackKind(), "memory", "removing a durable key must preserve the other memory-only status");
  failedWrites.delete(CHUNK_KEY);
  await store.set(CHUNK_KEY, { rows: [["retried and persisted"]] });
  assert.equal(store.getFallbackKind(), "memory", "one recovered key must not hide another unsaved key");
  failedWrites.delete(SECOND_CHUNK_KEY);
  await store.set(SECOND_CHUNK_KEY, { rows: [["both now persisted"]] });
  assert.equal(store.getFallbackKind(), "localStorage", "successful retry of every memory-only key restores durable fallback status");
  assert.deepEqual(cloneJson(await store.get(CHUNK_KEY)), { rows: [["retried and persisted"]] });

  failedWrites.add(CHUNK_KEY);
  await store.set(CHUNK_KEY, { rows: [["memory value before failed removal"]] });
  failedRemovals.add(CHUNK_KEY);
  await assert.rejects(() => store.remove(CHUNK_KEY), /localStorage remove failed/);
  assert.deepEqual(cloneJson(await store.get(CHUNK_KEY)), { rows: [["memory value before failed removal"]] },
    "failed deletion must retain the latest memory copy so clear-all can recover");
  assert.equal(store.getFallbackKind(), "memory");
  failedRemovals.delete(CHUNK_KEY);
  await store.remove(CHUNK_KEY);
  assert.equal(await store.get(CHUNK_KEY), undefined, "successful deletion must remove both fallback copies");
  assert.equal(localStorage.getItem(CHUNK_KEY), null);
  assert.equal(store.getFallbackKind(), "localStorage", "removing the final memory-only key clears its durability warning");
}

{
  // 空のレコードを、CSVの保存・再読込と引用付きTSVのコピー・貼り付けの両方で保持する。
  const workerSources = new Map();
  let workerRuns = 0;
  const runtime = {
    setTimeout, clearTimeout,
    Blob: class { constructor(parts) { this.source = parts.join(""); } },
    URL: {
      createObjectURL(blob) { const key = `worker:${workerSources.size}`; workerSources.set(key, blob.source); return key; },
      revokeObjectURL(key) { workerSources.delete(key); },
    },
    Worker: class {
      constructor(url) { this.source = workerSources.get(url); }
      postMessage(data) {
        workerRuns++;
        const self = { postMessage: (result) => queueMicrotask(() => this.onmessage({ data: result })) };
        vm.runInNewContext(this.source, { self });
        self.onmessage({ data });
      }
      terminate() {}
    },
  };
  const declarations = [
    "normalizeCellValue", "CSV_PARSE_ERROR_UNCLOSED_QUOTE", "parseCSV", "parseCSVAsync",
    "DATA_WORKER_TIMEOUT_MS", "runDataWorker",
    "_quoteTsvCell", "_buildTsvRows", "buildCsvLine", "SPREADSHEET_FORMULA_PREFIX_RE",
    "sanitizeSpreadsheetFormulaCell", "generateExportOutput",
  ].map((name) => name === "_quoteTsvCell"
    ? html.slice(html.indexOf("const _quoteTsvCell ="), html.indexOf("const _buildTsvRows ="))
    : extractConstDeclaration(html, name)).join("\n");
  const roundTripCore = new vm.Script(`
    const $expFormat = { value: ',' };
    const $expNewline = { value: 'lf' };
    const $expQuote = { value: 'auto' };
    const $expSpreadsheetSafe = { checked: false };
    const getExportFormatConfig = (delimiter) => ({ id: 'csv', isDsv: true, delimiter });
    const isUnclosedQuoteParseError = (error) => error?.code === 'csv_unclosed_quote';
    ${declarations}
    ({ parseCSVAsync, _buildTsvRows, buildCsvLine, generateExportOutput,
      setExportOptions: (delimiter, quoteStyle, newline) => {
        $expFormat.value = delimiter; $expQuote.value = quoteStyle; $expNewline.value = newline;
      }
    });
  `).runInNewContext(runtime);

  for (const delimiter of [",", "\t", ";", " "]) {
    assert.deepEqual(cloneJson(csv.parseCSV('""', delimiter)), [[""]], "a quoted empty record must not disappear at EOF");
    for (const newline of ["\n", "\r", "\r\n"]) {
      assert.deepEqual(cloneJson(csv.parseCSV(`value${newline}""`, delimiter)), [["value"], [""]]);
      assert.deepEqual(cloneJson(csv.parseCSV(`""${newline}""${newline}`, delimiter)), [[""], [""]]);
      assert.deepEqual(cloneJson(csv.parseCSV(`value${newline}`, delimiter)), [["value"]], "a record terminator must not add a blank row");
    }
    assert.deepEqual(cloneJson(csv.parseCSV("", delimiter)), [], "an empty file should remain empty");
    assert.deepEqual(cloneJson(csv.parseCSV(`""${delimiter}value${delimiter}""`, delimiter)), [["", "value", ""]]);

    const workerInput = `${"x".repeat(200000)}\n""`;
    assert.deepEqual(cloneJson(await roundTripCore.parseCSVAsync(workerInput, delimiter)), [["x".repeat(200000)], [""]]);
    const workerEmptyCells = `""${delimiter}${"x".repeat(200000)}${delimiter}""`;
    assert.deepEqual(cloneJson(await roundTripCore.parseCSVAsync(workerEmptyCells, delimiter)), [["", "x".repeat(200000), ""]]);

    for (const rows of [[[""]], [["value"], [""], [""]], [["", "value", ""], ["", "", ""]]]) {
      for (const quoteStyle of ["auto", "all"]) {
        for (const newline of ["lf", "crlf"]) {
          csv._setStateForTest({ data: rows, quoteStyle, newline });
          const output = await csv.generateOutputAsync(delimiter);
          assert.deepEqual(cloneJson(csv.parseCSV(output, delimiter)), rows, `${JSON.stringify(rows)} must survive ${JSON.stringify(delimiter)} save/reopen`);
          const separator = newline === "crlf" ? "\r\n" : "\n";
          assert.equal(rows.map((row) => roundTripCore.buildCsvLine(row, delimiter, quoteStyle)).join(separator), output, "byte-count serialization should match saved output");
          roundTripCore.setExportOptions(delimiter, quoteStyle, newline);
          const exported = roundTripCore.generateExportOutput({ headers: [], rows });
          assert.deepEqual(cloneJson(csv.parseCSV(exported, delimiter)), rows, "export wizard must retain empty records");
        }
      }
    }
  }
  assert.equal(workerRuns, 8, "large-input assertions should exercise the worker parser");
  assert.equal(csv.findNoQuoteRisks({ rows: [["value"], [""], [""]], delimiter: "," }).count, 2,
    "no-quote output must warn before blank one-column records can disappear");
  assert.equal(csv.findNoQuoteRisks({ rows: [["", "value", ""], ["", "", ""]], delimiter: " " }).count, 5,
    "no-quote SSV output must warn before empty cells collapse");
  let warningMessage = "";
  const confirmRisk = new vm.Script(`
    const NO_QUOTE_RISK_SAMPLE_LIMIT = 3;
    const isEnglish = () => false;
    ${extractConstDeclaration(html, "findNoQuoteRisks")}
    ${extractConstDeclaration(html, "confirmNoQuoteRisk")}
    confirmNoQuoteRisk;
  `).runInNewContext({ window: { confirm: (message) => { warningMessage = message; return false; } } });
  assert.equal(confirmRisk({ quoteStyle: "none", rows: [[""]], delimiter: ",", actionLabel: "保存" }), false,
    "users should be able to cancel ambiguous no-quote output");
  assert.match(warningMessage, /空行・空セルの欠落/, "no-quote warning should explain empty-record loss");
  csv._setStateForTest({ data: [["value"], [""]], quoteStyle: "none", newline: "lf" });
  assert.equal(await csv.generateOutputAsync(","), "value\n", "explicit no-quote output must remain unquoted after confirmation");
  for (const rows of [[[""]], [["value"], [""], [""]], [["", "value", ""]], [["a\tb"], ["line\nbreak"], ['"quote"'], [""]]]) {
    assert.deepEqual(cloneJson(csv._parseClipboardTsv(roundTripCore._buildTsvRows(rows))), rows, "copy/paste must retain a selected blank cell and final blank rows");
  }
}

{
  // オブジェクト形式の出力では、任意の列名を独自のデータプロパティとして保持する。
  const $expFormat = { value: "json" };
  const $expNewline = { value: "lf" };
  const generateExportOutput = new vm.Script(`
    ${extractConstDeclaration(html, "generateExportOutput")}
    generateExportOutput;
  `).runInNewContext({
    $expFormat,
    $expNewline,
    $expQuote: { value: "auto" },
    $expSpreadsheetSafe: { checked: false },
    getExportFormatConfig: (id) => ({ id, isDsv: false }),
  });
  const headers = ["__proto__", "constructor", "prototype", "toString", "hasOwnProperty", "", "__proto__", "__proto___2"];
  const keys = ["__proto__", "constructor", "prototype", "toString", "hasOwnProperty", "col6", "__proto___2", "__proto___2_2"];
  const rows = [
    ["must keep", "Alice", "value", "text", "own", "unnamed", "duplicate", "suffix collision"],
    ["", "Bob", "line\nbreak", "\"quoted\"", "", "", "second", "last"],
  ];
  for (const format of ["json", "ndjson"]) {
    $expFormat.value = format;
    for (const newline of ["lf", "crlf"]) {
      $expNewline.value = newline;
      const decode = (text) => format === "json"
        ? JSON.parse(text)
        : text.split(newline === "crlf" ? "\r\n" : "\n").map((line) => JSON.parse(line));
      const result = decode(generateExportOutput({ headers, rows }));
      assert.equal(result.length, rows.length, `${format}: row count must be preserved`);
      result.forEach((row, index) => {
        assert.deepEqual(Object.keys(row), keys, `${format}: special and duplicate keys must survive serialization`);
        assert.deepEqual(keys.map((key) => row[key]), rows[index], `${format}: every column value must survive serialization`);
        assert.ok(Object.hasOwn(row, "__proto__"), `${format}: __proto__ must be an own data property`);
      });
      assert.deepEqual(decode(generateExportOutput({ headers: [], rows })), rows,
        `${format}: headerless exports must remain arrays`);
    }
  }
}

{
  const tail = "tail;must-not-be-read";
  const cases = [
    ["LF", "\n"],
    ["CRLF", "\r\n"],
    ["CR", "\r"],
    ["mixed", ["\r", "\n", "\r\n"]],
  ];

  for (const [label, separator] of cases) {
    const source = Array.isArray(separator)
      ? Array.from({ length: 20 }, (_, index) => `r${index + 1};value${index + 1}`).map((line, index) => (
        index === 19 ? line : `${line}${separator[index % separator.length]}`
      )).join("")
      : `${buildRows(separator)}${separator}${tail}`;
    const sample = csv._getDelimiterSampleText(source);
    assert.equal(lineCountFor(sample), 8, `${label} sample should keep only first 8 lines`);
    assert.equal(sample.includes(tail), false, `${label} sample should not include tail rows`);
  }
}

{
  const crOnlySemicolonCsv = `${buildRows("\r")}\rignored,comma,tail`;
  assert.equal(csv.detectDelimiter(crOnlySemicolonCsv), ";", "CR-only CSV should detect delimiter from the bounded sample");
}

{
  const rows = csv.parseCSV('name,note\n"Alice","a,b\nc ""quoted"""\nBob,plain', ",");
  assert.deepEqual(cloneJson(rows), [
    ["name", "note"],
    ["Alice", 'a,b\nc "quoted"'],
    ["Bob", "plain"],
  ]);
}

{
  const spaceSeparated = "name   age   city\nAlice  30  Tokyo\nBob    9   Osaka";
  assert.equal(csv.detectDelimiter(spaceSeparated), " ", "multi-space SSV-like text should auto-detect a space delimiter");
  assert.deepEqual(cloneJson(csv.parseCSV(spaceSeparated, " ")), [
    ["name", "age", "city"],
    ["Alice", "30", "Tokyo"],
    ["Bob", "9", "Osaka"],
  ]);
  assert.deepEqual(cloneJson(csv.parseCSV('  name   "full name"   age  \n  Alice   "Alice Sato"   30  ', " ")), [
    ["name", "full name", "age"],
    ["Alice", "Alice Sato", "30"],
  ]);
}

{
  const fixtures = [
    ['a "x,y"\nb "z,w"', ' ', [['a', 'x,y'], ['b', 'z,w']]],
    ['a "x;y"\nb "z;w"', ' ', [['a', 'x;y'], ['b', 'z;w']]],
    ['a "x\ty"\nb "z\tw"', ' ', [['a', 'x\ty'], ['b', 'z\tw']]],
    ['a "x\ny"\nb "z\nw"', ' ', [['a', 'x\ny'], ['b', 'z\nw']]],
    ['  a  "x,""y"""  \r\n  b  "z w"  ', ' ', [['a', 'x,"y"'], ['b', 'z w']]],
    ['"a b"\n"c d"', ',', [['a b'], ['c d']]],
    ['"a b",1\n"c d",2', ',', [['a b', '1'], ['c d', '2']]],
    ['"a b"\t1\n"c d"\t2', '\t', [['a b', '1'], ['c d', '2']]],
    ['"a b";1\n"c d";2', ';', [['a b', '1'], ['c d', '2']]],
  ];
  for (const [text, delimiter, rows] of fixtures) {
    assert.equal(csv.detectDelimiter(text), delimiter, `quoted delimiter detection: ${JSON.stringify(text)}`);
    assert.deepEqual(cloneJson(csv.parseCSV(text, csv.detectDelimiter(text))), rows);
  }
}

{
  assert.throws(
    () => csv.parseCSV('name,note\nAlice,"unterminated', ","),
    (error) => error?.code === "csv_unclosed_quote",
    "unterminated quotes should fail closed instead of silently importing corrupted rows",
  );
}

{
  const dangerousRows = [
    ["日本語", "emoji😀", "<script>alert(1)</script>"],
    ["comma,value", 'quote"value', "line\nbreak"],
    ["zero\u200bwidth", "", "pipe|backslash\\"],
  ];
  const parsed = csv.parseCSV(serializeQuotedCsv(dangerousRows), ",");
  assert.deepEqual(cloneJson(parsed), dangerousRows, "quoted CSV round trip should preserve risky visible text");
}

{
  assert.deepEqual(cloneJson(csv._parseClipboardTsv('"a\tb"\t"line\nbreak"\nplain\t"""quote"""')), [
    ["a\tb", "line\nbreak"],
    ["plain", '"quote"'],
  ]);
}

{
  const risk = csv.findNoQuoteRisks({
    rows: [["safe", "a,b"], ['has "quote"', "line\nbreak"], ["carriage\rreturn"]],
    delimiter: ",",
  });
  assert.equal(risk.count, 4);
  assert.deepEqual(cloneJson(risk.sample.map((item) => [item.row, item.col])), [[1, 2], [2, 1], [2, 2]]);
}

{
  assert.equal(csv.isImeCompositionKeyEvent({ isComposing: true }), true);
  assert.equal(csv.isImeCompositionKeyEvent({ keyCode: 229 }), true);
  assert.equal(csv.isImeCompositionKeyEvent({ which: 229 }), true);
  assert.equal(csv.isImeCompositionKeyEvent({ key: "Enter" }), false);
}

{
  assert.equal(csv.sanitizeSpreadsheetFormulaCell("=SUM(A1:A2)", true), "'=SUM(A1:A2)");
  assert.equal(csv.sanitizeSpreadsheetFormulaCell("\n=SUM(A1:A2)", true), "'\n=SUM(A1:A2)");
  assert.equal(csv.sanitizeSpreadsheetFormulaCell("\u00a0@cmd", true), "'\u00a0@cmd");
  assert.equal(csv.sanitizeSpreadsheetFormulaCell("\ufeff+1", true), "'\ufeff+1");
  assert.equal(csv.sanitizeSpreadsheetFormulaCell("'=already-safe", true), "'=already-safe");
  assert.equal(csv.sanitizeSpreadsheetFormulaCell("=SUM(A1:A2)", false), "=SUM(A1:A2)");
  assert.equal(csv.sanitizeSpreadsheetFormulaCell(42, true), "42");
}

{
  csv._setStateForTest({
    data: [["name", "formula"], ["Alice", "\n=2+2"], ["Bob", "\u00a0@cmd"]],
    quoteStyle: "auto",
    newline: "lf",
  });
  assert.equal(
    await csv.generateOutputAsync(",", { spreadsheetSafeMode: true }),
    'name,formula\nAlice,"\'\n=2+2"\nBob,\'\u00a0@cmd',
    "spreadsheet-safe CSV export should neutralize LF/NBSP-leading formula payloads",
  );
}

{
  const key = "csvEditor_state_pro";
  const localStorage = createLocalStorageMock([[key, "fallback copy"]]);
  const indexedDB = createIndexedDBMock({ failDeletes: true });
  const storage = loadStorageMigrationCore({ localStorage, indexedDB });

  await storage.IDBStore.open();
  indexedDB._store().set(key, { data: [["must remain after failed delete"]] });

  await assert.rejects(
    () => storage.IDBStore.remove(key),
    /forced delete failure/,
    "IndexedDB deletion failures must reach the caller",
  );
  assert.equal(indexedDB._store().has(key), true, "failed IndexedDB deletion must not be reported as success");
  assert.equal(localStorage.getItem(key), null, "fallback copies should still be removed after an IndexedDB failure");
}

{
  const key = "csvEditor_state_pro";
  const localStorage = createLocalStorageMock([[key, "fallback copy"]]);
  localStorage.removeItem = () => {
    throw new Error("forced localStorage delete failure");
  };
  const indexedDB = { open: () => { throw new Error("IndexedDB unavailable"); } };
  const storage = loadStorageMigrationCore({ localStorage, indexedDB });

  await storage.IDBStore.open();
  await assert.rejects(
    () => storage.IDBStore.remove(key),
    /localStorage remove failed/,
    "fallback deletion failures must reach the caller",
  );
}

{
  const storageEntry = (value) => JSON.stringify({
    __csvEditorStoreEntryV1: true,
    storedAt: Date.now(),
    value,
  });
  const proStateKey = "csvEditor_state_pro";
  const legacyStateKey = "csvEditor_state";
  const chunk0Key = `${proStateKey}::chunk::0`;
  const chunk1Key = `${proStateKey}::chunk::1`;
  const envelope = {
    version: 3,
    storage: "chunked_rows",
    rowChunkSize: 2,
    rowChunkCount: 2,
    totalRows: 3,
    hasHeader: true,
    delimiter: ",",
    columnWidths: { 0: 120 },
    encoding: "utf-8",
    bom: false,
    newline: "lf",
    quoteStyle: "auto",
    savedAt: new Date().toISOString(),
  };
  const chunk0 = [["name", "note"], ["Alice", "one"]];
  const chunk1 = [["Bob", "two"]];
  const localStorage = createLocalStorageMock([
    [proStateKey, storageEntry(envelope)],
    [legacyStateKey, JSON.stringify({ data: [["legacy"]], savedAt: new Date().toISOString() })],
    [chunk0Key, storageEntry(chunk0)],
    [chunk1Key, storageEntry(chunk1)],
    ["csvEditor_theme", storageEntry("dark")],
    ["csvEditor_searchHistory", storageEntry(["alice", "bob"])],
    ["csvEditor_statusBarVisible", storageEntry(true)],
  ]);
  const indexedDB = createIndexedDBMock();
  const storage = loadStorageMigrationCore({ localStorage, indexedDB });

  await storage.IDBStore.open();
  await storage.migrateFromLocalStorage();

  assert.deepEqual(cloneJson(await storage.IDBStore.get(proStateKey)), envelope, "wrapped fallback envelope should migrate without double wrapping");
  assert.deepEqual(cloneJson(await storage.IDBStore.get(chunk0Key)), chunk0, "first persisted row chunk should migrate to IndexedDB");
  assert.deepEqual(cloneJson(await storage.IDBStore.get(chunk1Key)), chunk1, "second persisted row chunk should migrate to IndexedDB");
  assert.equal(await storage.IDBStore.get("csvEditor_theme"), "dark", "wrapped scalar settings should migrate as scalar values");
  assert.deepEqual(cloneJson(await storage.IDBStore.get("csvEditor_searchHistory")), ["alice", "bob"]);
  assert.equal(await storage.IDBStore.get("csvEditor_statusBarVisible"), true);
  assert.equal(localStorage.getItem(proStateKey), null, "migrated pro state should be removed from localStorage");
  assert.equal(localStorage.getItem(chunk0Key), null, "migrated first chunk should be removed from localStorage");
  assert.equal(localStorage.getItem(chunk1Key), null, "migrated second chunk should be removed from localStorage");
  assert.equal(localStorage.getItem(legacyStateKey), null, "legacy state should be removed when pro state already migrated");
}

{
  const storageEntry = (value, storedAt = Date.now()) => JSON.stringify({
    __csvEditorStoreEntryV1: true,
    storedAt,
    value,
  });
  const proStateKey = "csvEditor_state_pro";
  const now = Date.now();
  const olderStoredAt = now - 600_000;
  const newerStoredAt = now;
  const oldState = { data: [["old"]], savedAt: new Date(olderStoredAt).toISOString(), delimiter: "," };
  const newState = { data: [["new"]], savedAt: new Date(newerStoredAt).toISOString(), delimiter: "," };
  const localStorage = createLocalStorageMock([
    [proStateKey, storageEntry(newState, newerStoredAt)],
  ]);
  const indexedDB = createIndexedDBMock();
  const storage = loadStorageMigrationCore({ localStorage, indexedDB });

  await storage.IDBStore.open();
  indexedDB._store().set(proStateKey, oldState);
  await storage.migrateFromLocalStorage();

  assert.deepEqual(cloneJson(await storage.IDBStore.get(proStateKey)), newState, "newer fallback pro state should replace stale IndexedDB state");
  assert.equal(localStorage.getItem(proStateKey), null, "newer fallback pro state should be removed only after migration succeeds");
}

{
  const storageEntry = (value, storedAt = Date.now()) => JSON.stringify({
    __csvEditorStoreEntryV1: true,
    storedAt,
    value,
  });
  const proStateKey = "csvEditor_state_pro";
  const now = Date.now();
  const olderStoredAt = now - 600_000;
  const newerStoredAt = now;
  const oldState = { data: [["old"]], savedAt: new Date(olderStoredAt).toISOString(), delimiter: "," };
  const newState = { data: [["new"]], savedAt: new Date(newerStoredAt).toISOString(), delimiter: "," };
  const localStorage = createLocalStorageMock([
    [proStateKey, storageEntry(oldState, olderStoredAt)],
  ]);
  const indexedDB = createIndexedDBMock();
  const storage = loadStorageMigrationCore({ localStorage, indexedDB });

  await storage.IDBStore.open();
  indexedDB._store().set(proStateKey, {
    __csvEditorStoreEntryV1: true,
    storedAt: newerStoredAt,
    value: newState,
  });
  await storage.migrateFromLocalStorage();

  assert.deepEqual(cloneJson(await storage.IDBStore.get(proStateKey)), newState, "older fallback pro state should not replace newer IndexedDB state");
  assert.equal(localStorage.getItem(proStateKey), null, "older fallback pro state should be discarded after IndexedDB wins");
}

{
  const storageEntry = (value) => JSON.stringify({
    __csvEditorStoreEntryV1: true,
    storedAt: Date.now(),
    value,
  });
  const proStateKey = "csvEditor_state_pro";
  const chunk0Key = `${proStateKey}::chunk::0`;
  const incompleteEnvelope = {
    version: 3,
    storage: "chunked_rows",
    rowChunkSize: 2,
    rowChunkCount: 2,
    totalRows: 3,
    hasHeader: true,
    delimiter: ",",
    columnWidths: {},
    encoding: "utf-8",
    bom: true,
    newline: "lf",
    quoteStyle: "auto",
    savedAt: new Date().toISOString(),
  };
  const localStorage = createLocalStorageMock([
    [proStateKey, storageEntry(incompleteEnvelope)],
    [chunk0Key, storageEntry([["name"], ["Alice"]])],
  ]);
  const indexedDB = createIndexedDBMock();
  const storage = loadStorageMigrationCore({ localStorage, indexedDB });

  await storage.IDBStore.open();
  await storage.migrateFromLocalStorage();

  assert.equal(await storage.IDBStore.get(proStateKey), undefined, "chunked envelope should not migrate until every chunk is in IndexedDB");
  assert.notEqual(localStorage.getItem(proStateKey), null, "incomplete chunked envelope should stay in localStorage for a later retry");
}

{
  const helpers = loadPersistedRowsCore([]);
  const generationId = "generation-a";
  const chunk0Rows = [["name", "note"], ["Alice", "one"]];
  const chunk1Rows = [["Bob", "two"]];
  const chunk0Key = helpers.getPersistDraftChunkKey(generationId, 0);
  const chunk1Key = helpers.getPersistDraftChunkKey(generationId, 1);
  const chunk0Hash = helpers.hashPersistRows(chunk0Rows);
  const chunk1Hash = helpers.hashPersistRows(chunk1Rows);
  const envelope = {
    version: 3,
    storage: "chunked_rows",
    rowChunkSize: 2,
    rowChunkCount: 2,
    totalRows: 3,
    rowChunkRefs: [
      { key: chunk0Key, generationId, hash: chunk0Hash, length: 2 },
      { key: chunk1Key, generationId, hash: chunk1Hash, length: 1 },
    ],
  };
  const chunkRecord = (chunkIndex, rows, hash) => ({
    version: 3,
    storage: "chunked_rows",
    kind: "rows_chunk",
    rowChunkGenerationId: generationId,
    rowChunkIndex: chunkIndex,
    rowChunkSize: 2,
    length: rows.length,
    hash,
    rows,
  });
  const storage = loadPersistedRowsCore([
    [chunk0Key, chunkRecord(0, chunk0Rows, chunk0Hash)],
    [chunk1Key, chunkRecord(1, chunk1Rows, chunk1Hash)],
  ]);

  assert.deepEqual(
    cloneJson(await storage.loadPersistedChunkRows(envelope)),
    [...chunk0Rows, ...chunk1Rows],
    "manifest-based persisted chunks should restore when generation IDs and hashes match",
  );
}

{
  const helpers = loadPersistedRowsCore([]);
  const generationId = "generation-a";
  const staleGenerationId = "generation-b";
  const chunkRows = [["name"], ["Alice"]];
  const chunkKey = helpers.getPersistDraftChunkKey(generationId, 0);
  const chunkHash = helpers.hashPersistRows(chunkRows);
  const envelope = {
    version: 3,
    storage: "chunked_rows",
    rowChunkSize: 2,
    rowChunkCount: 1,
    totalRows: 2,
    rowChunkRefs: [{ key: chunkKey, generationId, hash: chunkHash, length: 2 }],
  };
  const storage = loadPersistedRowsCore([
    [chunkKey, {
      version: 3,
      storage: "chunked_rows",
      kind: "rows_chunk",
      rowChunkGenerationId: staleGenerationId,
      rowChunkIndex: 0,
      rowChunkSize: 2,
      length: 2,
      hash: chunkHash,
      rows: chunkRows,
    }],
  ]);

  await assert.rejects(
    () => storage.loadPersistedChunkRows(envelope),
    (error) => storage.isPersistChunkIntegrityError(error),
    "persisted chunks from another generation should not restore under an old envelope",
  );
}

{
  const helpers = loadPersistedRowsCore([]);
  const generationId = "generation-a";
  const originalRows = [["name"], ["Alice"]];
  const overwrittenRows = [["name"], ["Mallory"]];
  const chunkKey = helpers.getPersistDraftChunkKey(generationId, 0);
  const originalHash = helpers.hashPersistRows(originalRows);
  const overwrittenHash = helpers.hashPersistRows(overwrittenRows);
  const envelope = {
    version: 3,
    storage: "chunked_rows",
    rowChunkSize: 2,
    rowChunkCount: 1,
    totalRows: 2,
    rowChunkRefs: [{ key: chunkKey, generationId, hash: originalHash, length: 2 }],
  };
  const storage = loadPersistedRowsCore([
    [chunkKey, {
      version: 3,
      storage: "chunked_rows",
      kind: "rows_chunk",
      rowChunkGenerationId: generationId,
      rowChunkIndex: 0,
      rowChunkSize: 2,
      length: 2,
      hash: overwrittenHash,
      rows: overwrittenRows,
    }],
  ]);

  await assert.rejects(
    () => storage.loadPersistedChunkRows(envelope),
    (error) => storage.isPersistChunkIntegrityError(error),
    "persisted chunks with a hash mismatch should not restore",
  );
}

{
  const storageEntry = (value) => JSON.stringify({
    __csvEditorStoreEntryV1: true,
    storedAt: Date.now(),
    value,
  });
  const helpers = loadPersistedRowsCore([]);
  const proStateKey = "csvEditor_state_pro";
  const generationId = "migrated-generation";
  const chunkRows = [["name", "note"], ["Alice", "one"]];
  const chunkKey = helpers.getPersistDraftChunkKey(generationId, 0);
  const chunkHash = helpers.hashPersistRows(chunkRows);
  const chunkRecord = {
    version: 3,
    storage: "chunked_rows",
    kind: "rows_chunk",
    rowChunkGenerationId: generationId,
    rowChunkIndex: 0,
    rowChunkSize: 2,
    length: 2,
    hash: chunkHash,
    rows: chunkRows,
  };
  const envelope = {
    version: 3,
    storage: "chunked_rows",
    rowChunkSize: 2,
    rowChunkCount: 1,
    totalRows: 2,
    rowChunkRefs: [{ key: chunkKey, generationId, hash: chunkHash, length: 2 }],
    hasHeader: true,
    delimiter: ",",
    columnWidths: {},
    encoding: "utf-8",
    bom: false,
    newline: "lf",
    quoteStyle: "auto",
    savedAt: new Date().toISOString(),
  };
  const localStorage = createLocalStorageMock([
    [proStateKey, storageEntry(envelope)],
    [chunkKey, storageEntry(chunkRecord)],
  ]);
  const indexedDB = createIndexedDBMock();
  const storage = loadStorageMigrationCore({ localStorage, indexedDB });

  await storage.IDBStore.open();
  await storage.migrateFromLocalStorage();

  assert.deepEqual(cloneJson(await storage.IDBStore.get(proStateKey)), envelope, "manifest envelope should migrate after referenced draft chunks migrate");
  assert.deepEqual(cloneJson(await storage.IDBStore.get(chunkKey)), chunkRecord, "draft chunk keys should migrate from localStorage to IndexedDB");
  assert.equal(localStorage.getItem(proStateKey), null, "manifest envelope should be removed from localStorage after migration");
  assert.equal(localStorage.getItem(chunkKey), null, "draft chunk should be removed from localStorage after migration");
}

{
  assertSourceOrder(
    html,
    "$paletteInput.addEventListener('keydown'",
    "if (isImeCompositionKeyEvent(e)) return;",
    "if (e.key === 'ArrowDown')",
    "command palette keydown",
  );
  assertSourceOrder(
    html,
    "$searchInput.addEventListener('keydown'",
    "if (isImeCompositionKeyEvent(e)) return;",
    "if (e.key === 'Enter')",
    "search keydown",
  );
}

{
  const restoreAfterFailedClearSource = extractConstDeclaration(html, "restoreStorageAfterFailedClear");
  assert.ok(
    restoreAfterFailedClearSource.includes("_persistRequiresFullSave = true;"),
    "failed storage clears should force a full restore save",
  );
  assert.ok(
    restoreAfterFailedClearSource.includes("await persistStateAsync();"),
    "failed storage clears should rewrite the current data state",
  );
  assert.ok(
    restoreAfterFailedClearSource.includes("await IDBStore.set(SEARCH_HISTORY_KEY, historySnapshot);"),
    "failed storage clears should restore the in-memory search history snapshot",
  );

  const clearStorageSource = extractConstDeclaration(html, "clearStorage");
  assertOrderWithin(
    clearStorageSource,
    "const results = await Promise.all(removals);",
    "await restoreStorageAfterFailedClear",
    "storage clear failure compensation",
  );
  assertOrderWithin(
    clearStorageSource,
    "await restoreStorageAfterFailedClear",
    "throw new Error('Storage clear failed');",
    "storage clear failure reporting",
  );
  assertOrderWithin(
    clearStorageSource,
    "if (results.some((ok) => !ok))",
    "clearColumnWidthsFromLocal();",
    "column widths should be cleared only after storage deletion succeeds",
  );
  assertOrderWithin(
    clearStorageSource,
    "const results = await Promise.all(removals);",
    "_savedRevision = _clearRevision;",
    "storage clear revision",
  );
  assert.ok(
    !clearStorageSource.includes("clearSearchHistory()"),
    "search history state should be cleared only after storage deletion succeeds",
  );

  const clearAllSource = extractConstDeclaration(html, "_clearAllDataSafely");
  assertOrderWithin(clearAllSource, "await clearStorage", "saveToHistory();", "clear-all persistence ordering");
  assertOrderWithin(clearAllSource, "await clearStorage", "state.data = [];", "clear-all state ordering");
  assert.ok(clearAllSource.includes("resetViewStateForNewDataset();"), "clear-all should reset search and filter state");

  const deleteColumnSource = extractConstDeclaration(html, "deleteColumn");
  const deleteRowSource = extractConstDeclaration(html, "deleteRow");
  assertOrderWithin(deleteColumnSource, "await _clearAllDataSafely", "saveToHistory();", "last-column clear ordering");
  assertOrderWithin(deleteRowSource, "await _clearAllDataSafely", "saveToHistory();", "last-row clear ordering");

  for (const functionName of ["deleteSelectedCells", "_applyClipboardDataAt", "handleCellBlur"]) {
    assert.ok(
      extractConstDeclaration(html, functionName).includes("_refreshViewAfterCellBatchEdit"),
      `${functionName} should refresh search and column filters after an edit`,
    );
  }

  assert.ok(html.includes("csvEditor_virtualHeaderPresets"), "in-app storage details should name virtual-header preset storage");
  assert.ok(
    indexHtml.match(/<template id="legalTemplatePrivacy">[\s\S]*?csvEditor_virtualHeaderPresets[\s\S]*?<\/template>/),
    "LP privacy policy should name virtual-header preset storage",
  );
}

{
  // 実際の永続化処理をIndexedDBの書き込み境界で待機させ、その間に表を編集する。
  // 完了した保存の内部整合性を保ち、その後の編集も保持する。
  const makePersistenceRaceCore = () => {
    const chunkMap = new Map();
    const control = { pauseWrite: false, failWrite: false };
    const declarations = [
      "PRO_STATE_STORAGE_KEY", "PERSIST_CHUNK_VERSION", "PERSIST_STORAGE_KIND",
      "PERSIST_CHUNK_RECORD_KIND", "PERSIST_CHUNK_INTEGRITY_ERROR",
      "PRO_STATE_CHUNK_KEY_PREFIX", "PERSIST_CHUNK_KEY_SEGMENT_RE",
      "beginSnapshotEpoch", "ensureRowOwned", "setCellValue", "cloneColumnWidths",
      "normalizeCellValue", "normalizeVirtualHeaders", "getDataShapeMeta",
      "getPersistChunkKey", "getPersistDraftChunkKey", "createPersistChunkGenerationId",
      "parsePersistChunkKey", "hashPersistString", "hashPersistRows",
      "getExpectedPersistChunkLength", "createPersistChunkIntegrityError",
      "normalizePersistChunkRefs", "normalizePersistMeta", "normalizePersistedChunkRecord",
      "loadPersistedChunkRows", "getPersistChunkCount", "buildPersistChunkRows",
      "buildPersistEnvelope", "updatePersistChunkMeta", "buildPersistChunkRecord",
      "getPersistChunkKeysForMeta", "removePersistChunkKeys", "removeUnreferencedPersistChunks",
      "persistChunkRows", "persistMetaOnly", "persistAllStateChunks",
      "persistDirtyStateChunks", "persistStateAsync",
    ].map((name) => extractConstDeclaration(html, name)).join("\n");
    const core = new vm.Script(`
      const PERSIST_ROW_CHUNK_SIZE = 2;
      let state = {
        data: [['A'], ['B'], ['C'], ['D']], hasHeader: false,
        virtualHeaders: ['Label'], delimiter: ',', columnWidths: { 0: 120 },
        encoding: 'utf-8', bom: false, newline: 'lf', quoteStyle: 'auto'
      };
      let _ownedRowsSinceSnapshot = null;
      let _persistChunkMeta = null;
      let _persistDirtyRows = new Set();
      let _persistRequiresFullSave = true;
      let _saveRevision = 0;
      const normalizeExportEncoding = (value) => value;
      const supportsBom = () => true;
      const normalizeLineEndingSetting = (value) => value;
      const IDBStore = {
        get: async (key) => chunkMap.get(key),
        remove: async (key) => { chunkMap.delete(key); },
        set: async (key, value) => {
          const storedValue = cloneJson(value);
          if (control.pauseWrite && key.includes('::chunk::')) {
            control.pauseWrite = false;
            control.notifyPaused();
            await control.resumeWrite;
          }
          if (control.failWrite) {
            control.failWrite = false;
            throw new Error('forced concurrent save failure');
          }
          chunkMap.set(key, storedValue);
        }
      };
      ${declarations}
      ({
        persistStateAsync,
        read: async () => {
          const envelope = chunkMap.get(PRO_STATE_STORAGE_KEY);
          return { envelope, rows: await loadPersistedChunkRows(envelope) };
        },
        edit: (row, value) => {
          setCellValue(row, 0, value);
          _saveRevision++;
          if (!_persistRequiresFullSave) _persistDirtyRows.add(row);
        },
        removeLastRowAndChangeSettings: () => {
          state.data.pop();
          state.delimiter = ';';
          state.virtualHeaders[0] = 'Changed label';
          state.columnWidths[0] = 240;
          _saveRevision++;
          _persistRequiresFullSave = true;
          _persistDirtyRows.clear();
        },
        hasPendingChanges: () => _persistRequiresFullSave || _persistDirtyRows.size > 0,
        liveRows: () => state.data
      });
    `).runInNewContext({ chunkMap, control, cloneJson, setTimeout, console, crypto: crypto.webcrypto });
    return {
      ...core,
      pauseNextWrite: () => {
        control.pauseWrite = true;
        const paused = new Promise((resolve) => { control.notifyPaused = resolve; });
        let release;
        control.resumeWrite = new Promise((resolve) => { release = resolve; });
        return { paused, release };
      },
      failNextWrite: () => { control.failWrite = true; },
    };
  };

  {
    const core = makePersistenceRaceCore();
    await core.persistStateAsync();
    core.edit(0, "A edited");
    const gate = core.pauseNextWrite();
    const pending = core.persistStateAsync();
    await gate.paused;
    core.edit(2, "C edited while saving");
    gate.release();
    await pending;
    assert.equal(core.hasPendingChanges(), true, "an edit during a patch save must remain pending");
    assert.deepEqual(cloneJson((await core.read()).rows), [["A edited"], ["B"], ["C"], ["D"]]);
    await core.persistStateAsync();
    assert.deepEqual(cloneJson((await core.read()).rows), cloneJson(core.liveRows()), "the next save must persist a concurrent edit in another chunk");
    assert.equal(core.hasPendingChanges(), false);
  }

  {
    const core = makePersistenceRaceCore();
    const gate = core.pauseNextWrite();
    const pending = core.persistStateAsync();
    await gate.paused;
    core.edit(2, "Changed during full save");
    core.removeLastRowAndChangeSettings();
    gate.release();
    await pending;
    const first = await core.read();
    assert.deepEqual(cloneJson(first.rows), [["A"], ["B"], ["C"], ["D"]], "all chunks must preserve the same pre-edit snapshot");
    assert.equal(first.envelope.totalRows, 4, "the manifest must describe saved rows, even if a row was deleted during saving");
    assert.equal(first.envelope.delimiter, ",");
    assert.equal(first.envelope.virtualHeaders[0], "Label");
    assert.equal(first.envelope.columnWidths[0], 120);
    await core.persistStateAsync();
    const next = await core.read();
    assert.deepEqual(cloneJson(next.rows), cloneJson(core.liveRows()));
    assert.equal(next.envelope.totalRows, 3);
    assert.equal(next.envelope.delimiter, ";");
    assert.equal(next.envelope.virtualHeaders[0], "Changed label");
    assert.equal(next.envelope.columnWidths[0], 240);
  }

  {
    const core = makePersistenceRaceCore();
    await core.persistStateAsync();
    core.edit(0, "First edit");
    const gate = core.pauseNextWrite();
    const pending = core.persistStateAsync();
    await gate.paused;
    core.edit(2, "Concurrent edit");
    core.failNextWrite();
    gate.release();
    await assert.rejects(pending, /forced concurrent save failure/);
    assert.deepEqual(cloneJson((await core.read()).rows), [["A"], ["B"], ["C"], ["D"]], "a failed patch must leave the previous manifest restorable");
    await core.persistStateAsync();
    assert.deepEqual(cloneJson((await core.read()).rows), cloneJson(core.liveRows()), "retry must include edits made before and during the failed save");
  }
}

{
  const rows = Array.from({ length: 501 }, (_, index) => [`row-${index}`, "original"]);
  const expected = rows.map((row) => row.join(",")).join("\n");
  csv._setStateForTest({ data: rows, quoteStyle: "auto", newline: "lf" });
  const output = csv.generateOutputAsync(",");
  csv.setCellValue(500, 1, "edited during export");
  rows.splice(0, 1);
  assert.equal(await output, expected, "yielding output generation must preserve the original rows and cell values");
}

for (const action of ["saveFile", "downloadData", "copyData"]) {
  const output = loadFileOutputCore();
  const rows = Array.from({ length: 501 }, (_, index) => [`row-${index}`, "original"]);
  const expected = rows.map((row) => row.join(",")).join("\n");
  Object.assign(output.state, { data: rows });
  const pending = output[action]();
  output.setCellValue(500, 1, "edited during export");
  Object.assign(output.state, {
    delimiter: "\t", encoding: "utf-16le", bom: true, quoteStyle: "all", newline: "crlf",
  });
  await pending;
  assert.equal(output.toasts.some((toast) => toast.type === "error"), false, `${action} should finish successfully`);
  if (action === "copyData") {
    assert.deepEqual(cloneJson(output.clipboard), [expected], "copy should contain the complete starting revision");
    assert.ok(output.toasts.at(-1).message.includes("CSV"), "copy feedback should name the format actually copied");
  } else {
    assert.equal(output.downloads.length, 1, `${action} should emit one download`);
    assert.equal(output.downloads[0].blob.text, expected, `${action} should contain the complete starting revision`);
    assert.equal(output.downloads[0].blob.encoding, "utf-8", `${action} should retain the starting encoding`);
    assert.equal(output.downloads[0].blob.bom, false, `${action} should retain the starting BOM setting`);
    assert.equal(output.downloads[0].filename, "data_20260911.csv", `${action} should name the actual output format`);
    assert.equal(output.encodingChecks[0].encoding, "utf-8", `${action} should validate the actual output encoding`);
  }
}

for (const action of ["saveFile", "downloadData"]) {
  const output = loadFileOutputCore();
  output.state.data = Array.from({ length: 501 }, () => ["original"]);
  output.setOpenFileContext({ fileName: "売上.2026.CSV", outputMeta: output.getCurrentOutputMeta() });
  assert.equal(output._getSuggestedOutputName("csv"), "売上.2026.CSV", "an unchanged extension should preserve the original file name");
  assert.equal(output._getSuggestedOutputName("json"), "売上.2026.json", "export formats should replace the final extension only");
  output.state.delimiter = "\t";
  const pending = output[action]();
  output.setOpenFileContext({ fileName: "second.csv" });
  await pending;
  assert.equal(output.downloads[0].filename, "売上.2026.tsv", `${action} must capture the initial file name and update its format extension`);
  if (action === "saveFile") {
    assert.ok(output.buttonStates.includes(true), "saving should expose the busy state before yielding");
    assert.equal(output.buttonStates.at(-1), false, "saving should clear busy feedback on completion");
  }
}

{
  let suggestedName;
  const output = loadFileOutputCore({ picker: async (options) => {
    suggestedName = options.suggestedName;
    throw { name: "AbortError" };
  } });
  output.state.data = [["value"]];
  output.setOpenFileContext({ fileName: "顧客一覧.csv" });
  await output.saveFile();
  assert.equal(suggestedName, "顧客一覧.csv", "Save As should suggest the imported file name");
  assert.equal(output.buttonStates.at(-1), false, "cancelling the picker should clear the busy feedback");
}

{
  const output = loadFileOutputCore();
  const writes = [];
  const originalHandle = {
    name: "original.csv",
    async createWritable() {
      return { async write(blob) { writes.push(blob); }, async close() {} };
    },
  };
  const nextHandle = {
    name: "next.tsv",
    async createWritable() { assert.fail("an earlier save must never write to a newly opened file"); },
  };
  output.state.data = Array.from({ length: 501 }, (_, index) => [`original-${index}`]);
  const expected = output.state.data.flat().join("\n");
  output.setOpenFileContext({ fileHandle: originalHandle, outputMeta: output.getCurrentOutputMeta() });
  const pending = output.saveFile();
  Object.assign(output.state, { data: [["next dataset"]], delimiter: "\t" });
  output.setOpenFileContext({ fileHandle: nextHandle, outputMeta: output.getCurrentOutputMeta() });
  await pending;
  assert.equal(writes.length, 1, "save should write exactly once to the original file");
  assert.equal(writes[0].text, expected, "opening another file during output must preserve the original file content");
  assert.equal(output.getFileContext().fileHandle, nextHandle, "finishing an earlier save must preserve the newly opened file");
  assert.equal(output.getFileContext().outputMeta.delimiter, "\t");
  assert.ok(output.toasts.at(-1).message.includes("original.csv"), "save feedback should identify the file actually written");
}

{
  const output = loadFileOutputCore();
  const writes = [];
  const handle = {
    name: "original.csv",
    async createWritable() {
      return {
        async write(blob) { writes.push(blob); },
        async close() { Object.assign(output.state, { delimiter: "\t", encoding: "utf-16le", bom: true }); },
      };
    },
  };
  output.state.data = [["one", "two"]];
  const originalMeta = cloneJson(output.getCurrentOutputMeta());
  output.setOpenFileContext({ fileHandle: handle, outputMeta: originalMeta });
  await output.saveFile();
  assert.equal(writes[0].text, "one,two");
  assert.deepEqual(cloneJson(output.getFileContext().outputMeta), originalMeta, "saved metadata must describe the bytes actually written");
  assert.equal(output.hasOverwriteFormatMismatch(), true, "settings changed during a write must still require Save As");
}

{
  const output = loadFileOutputCore();
  const nextHandle = { name: "next.csv" };
  const originalHandle = {
    name: "original.csv",
    async createWritable() {
      return {
        async write() {
          output.state.data = [["next dataset"]];
          output.setOpenFileContext({ fileHandle: nextHandle, outputMeta: output.getCurrentOutputMeta() });
        },
        async close() {},
      };
    },
  };
  output.state.data = [["original"]];
  output.setOpenFileContext({ fileHandle: originalHandle, outputMeta: output.getCurrentOutputMeta() });
  await output.saveFile();
  assert.equal(output.getFileContext().fileHandle, nextHandle, "a dataset opened while writing must retain its own file handle");
  assert.ok(output.toasts.at(-1).message.includes("original.csv"), "write completion feedback must identify the captured handle");
}

{
  let resolvePicker;
  let reportPickerReached;
  const pickerReached = new Promise((resolve) => { reportPickerReached = resolve; });
  const writes = [];
  let pickerCalls = 0;
  const handle = {
    name: "saved.csv",
    async createWritable() { return { async write(blob) { writes.push(blob); }, async close() {} }; },
  };
  const output = loadFileOutputCore({
    picker: () => {
      pickerCalls++;
      reportPickerReached();
      return new Promise((resolve) => { resolvePicker = resolve; });
    },
  });
  output.state.data = [["original"]];
  const pending = output.saveFile();
  await pickerReached;
  await output.saveFile();
  assert.equal(pickerCalls, 1, "a repeated save must not start another write while the first save is pending");
  output.state.data = [["new unsaved dataset"]];
  output.setOpenFileContext();
  resolvePicker(handle);
  await pending;
  assert.equal(writes.length, 1);
  assert.equal(writes[0].text, "original");
  assert.equal(output.getFileContext().fileHandle, null, "Save As completion must not attach an old file to a new dataset");
}

{
  let calls = 0;
  const output = loadFileOutputCore({ picker: async () => { calls++; throw { name: "AbortError" }; } });
  output.state.data = [["original"]];
  await output.saveFile();
  await output.saveFile();
  assert.equal(calls, 2, "cancelling a save must release the in-progress guard for the next save");
  assert.equal(output.downloads.length, 0, "cancelling a save must not trigger a fallback download");
}

{
  const appCsp = extractCspDirectives(html, "LocalCSV.html");
  const lpCsp = extractCspDirectives(indexHtml, "index.html");
  for (const [directive, expected] of [
    ["connect-src", "'none'"],
    ["object-src", "'none'"],
    ["base-uri", "'none'"],
    ["form-action", "'none'"],
  ]) {
    assert.equal(appCsp.get(directive), expected, `LocalCSV.html CSP ${directive} should be ${expected}`);
    assert.equal(lpCsp.get(directive), expected, `index.html CSP ${directive} should be ${expected}`);
  }
}

{
  const match = indexHtml.match(/<script id="editor-html-base64"[^>]*>([\s\S]*?)<\/script>/);
  assert.ok(match, "embedded editor HTML block not found in index.html");
  const embeddedHtml = Buffer.from(match[1].replace(/\s+/g, ""), "base64").toString("utf8");
  const embeddedHash = crypto.createHash("sha256").update(embeddedHtml).digest("hex");
  const localHash = crypto.createHash("sha256").update(html).digest("hex");
  assert.ok(embeddedHtml === html, `index.html embedded LocalCSV mismatch: embedded=${embeddedHash} local=${localHash}`);
}

// 表示状態変更・pagehide・beforeunload・遅延実行は、いずれも復元用保存を待機させ得る。
{
  const declarations = ["persistRevisionNow", "flushStorage"]
    .map((name) => extractConstDeclaration(html, name)).join("\n");
  const queue = new vm.Script(`
    let _storageSavePromise = null, _storageClearPromise = null, _saveTimer = null;
    let _persistStorageVersion = '';
    const PRO_STATE_STORAGE_KEY = 'state';
    const _getPersistenceVersion = (value) => JSON.stringify(value);
    const _assertPersistenceVersion = async () => {};
    let _savedRevision = 0, _saveRevision = 1;
    let value = 'revision 1', persistedValue = null;
    let active = 0, maxActive = 0;
    const started = [], waiters = [], statuses = [];
    const IDBStore = { isFallback: () => false, withStateLock: (task) => task(), get: async () => persistedValue };
    const updateSaveStatusBadge = (status) => { statuses.push(status); };
    const showToast = () => {};
    const commitActiveCellEdit = () => {};
    const saveColumnWidthsToLocal = () => {};
    const cancelIdlePersist = () => {};
    const persistStateAsync = async () => {
      const savedValue = value;
      active++;
      maxActive = Math.max(maxActive, active);
      let release;
      const gate = new Promise((resolve) => { release = resolve; });
      started.push({ revision: _saveRevision, release });
      waiters.forEach((waiter) => {
        if (started.length >= waiter.count) waiter.resolve();
      });
      await gate;
      persistedValue = savedValue;
      active--;
    };
    ${declarations}
    ({
      flushStorage,
      edit: (revision) => { _saveRevision = revision; value = 'revision ' + revision; },
      release: (index) => { started[index].release(); },
      waitForStarted: (count) => started.length >= count ? Promise.resolve()
        : new Promise((resolve) => { waiters.push({ count, resolve }); }),
      stats: () => ({ active, maxActive, savedRevision: _savedRevision, persistedValue,
        revisions: started.map((entry) => entry.revision), statuses })
    });
  `).runInNewContext({ clearTimeout, console });

  const first = queue.flushStorage();
  await queue.waitForStarted(1);
  queue.edit(2);
  const second = queue.flushStorage();
  queue.edit(3);
  const third = queue.flushStorage();
  queue.release(0);
  await first;
  await queue.waitForStarted(2);
  assert.equal(queue.stats().maxActive, 1, "multiple flush waiters must reacquire the save lock instead of writing concurrently");
  assert.deepEqual(cloneJson(queue.stats().revisions), [1, 3], "a queued save must capture the current revision when it starts");

  queue.edit(4);
  const fourth = queue.flushStorage();
  queue.release(1);
  await second;
  await queue.waitForStarted(3);
  assert.equal(queue.stats().maxActive, 1, "later page lifecycle flushes must also stay serialized");
  queue.release(2);
  assert.deepEqual(await Promise.all([third, fourth]), [true, true]);
  assert.equal(queue.stats().persistedValue, "revision 4", "the last committed save must contain the latest queued edit");
  assert.equal(queue.stats().savedRevision, 4, "saved revision must match the snapshot that was actually written");
  assert.deepEqual(cloneJson(queue.stats().revisions), [1, 3, 4], "waiters should reuse an already completed current save");
}

// タブを閉じる際はフォーカス中のセルを確定し、復元用保存が完了するまで警告する。
{
  const declarations = [
    "SAVE_STATUS_LABELS", "SAVE_STORAGE_DETAILS", "SAVE_STATUS_TITLE_PREFIXES",
    "getSaveStatusLabel", "getSaveStatusTitle", "updateSaveStatusBadge",
    "qs", "_readCellEditValue", "_hasActiveCellEdit", "_refreshRecoveryStatusAfterInput", "commitActiveCellEdit",
    "flushStorage", "_hasUnpersistedChanges", "handleBeforeUnload",
  ].map((name) => extractConstDeclaration(html, name)).join("\n");
  const recovery = new vm.Script(`
    class Element {
      constructor(text) { this.textContent = text; this.dataset = { row: '0', col: '0' }; }
      matches(selector) { return selector === 'td[contenteditable]'; }
      querySelector() { return null; }
    }
    const document = { activeElement: null };
    const $dataTable = { contains: ($cell) => $cell instanceof Element };
    const $saveStatus = { dataset: {}, textContent: '', title: '' };
    const state = { data: [['original']] };
    let _saveRevision = 0, _savedRevision = 0, _saveTimer = null, _saveFileInProgress = false;
    let _currentSaveState = 'idle', _fallback = 'none', _english = false;
    let _writes = [], _failWrite = false;
    const IDBStore = { getFallbackKind: () => _fallback, isFallback: () => _fallback !== 'none' };
    const isEnglish = () => _english;
    const saveColumnWidthsToLocal = () => {};
    const cancelIdlePersist = () => {};
    const handleCellBlur = ($cell) => {
      if (state.data[0][0] === $cell.textContent) return false;
      state.data[0][0] = $cell.textContent;
      _saveRevision++;
      return true;
    };
    const persistRevisionNow = async (revision, options) => {
      _writes.push({ revision, value: state.data[0]?.[0], options });
      if (_failWrite) return false;
      _savedRevision = revision;
      return true;
    };
    ${declarations}
    ({
      setup: ({ data = [['original']], revision = 0, savedRevision = 0, focusedText = null,
          fallback = 'none', failWrite = false, english = false, fileSaveInProgress = false } = {}) => {
        state.data = data;
        _saveRevision = revision; _savedRevision = savedRevision;
        _fallback = fallback; _failWrite = failWrite; _english = english;
        _saveFileInProgress = fileSaveInProgress;
        _writes = []; _currentSaveState = 'idle';
        document.activeElement = focusedText === null ? null : new Element(focusedText);
      },
      leave: () => {
        const event = { prevented: false, returnValue: undefined,
          preventDefault() { this.prevented = true; } };
        handleBeforeUnload(event);
        return event;
      },
      flushStorage, _hasUnpersistedChanges, _refreshRecoveryStatusAfterInput,
      badge: (status) => { updateSaveStatusBadge(status); return { ...$saveStatus }; },
      status: () => ({ ...$saveStatus }),
      writes: () => _writes,
    });
  `).runInNewContext({ clearTimeout });

  recovery.setup({ data: [] });
  assert.equal(recovery.leave().prevented, false, "empty editor should close without a warning");
  recovery.setup();
  assert.equal(recovery.leave().prevented, false, "durable recovery copy should not warn");
  assert.match(recovery.badge("saved").textContent, /ブラウザ内/, "saved badge must name the browser");
  assert.match(recovery.status().title, /元のCSVファイルは更新されません/, "recovery must not imply file overwrite");

  recovery.setup({ focusedText: "latest edit" });
  recovery._refreshRecoveryStatusAfterInput();
  assert.equal(recovery.status().dataset.state, "unsaved", "focused cell input is not yet persisted");
  assert.equal(recovery.badge("saved").dataset.state, "unsaved", "older completed saves must not cover a focused edit");
  const leavingEdit = recovery.leave();
  assert.equal(leavingEdit.prevented, true, "an unblurred cell must trigger the close warning");
  assert.equal(leavingEdit.returnValue, "");
  assert.equal(recovery.writes()[0].value, "latest edit", "page freeze flush must include the focused cell");
  assert.equal(recovery.writes()[0].options.showErrorToast, false);

  recovery.setup({ focusedText: "hidden tab edit" });
  await recovery.flushStorage();
  assert.equal(recovery.writes()[0].value, "hidden tab edit", "visibility/pagehide flush must also commit the cell");
  assert.equal(recovery._hasUnpersistedChanges(), false);

  recovery.setup({ revision: 2, savedRevision: 1, failWrite: true });
  assert.equal(recovery.leave().prevented, true, "pending auto-save must warn before closing");
  assert.equal(await recovery.flushStorage(), false);
  assert.equal(recovery._hasUnpersistedChanges(), true, "failed flush must retain the warning");

  recovery.setup({ fallback: "memory" });
  assert.equal(recovery.leave().prevented, true, "memory-only success is not durable recovery");
  assert.match(recovery.badge("fallback").textContent, /要書き出し/);
  recovery.setup({ fileSaveInProgress: true });
  assert.equal(recovery.leave().prevented, true, "in-flight file writes must warn even with a durable recovery copy");
  recovery.setup({ fallback: "localStorage" });
  assert.equal(recovery.leave().prevented, false, "successful localStorage recovery is durable");
  recovery.setup({ data: [], fallback: "memory" });
  assert.equal(recovery.leave().prevented, false, "memory fallback with no data needs no warning");

  recovery.setup({ english: true });
  assert.equal(recovery.badge("saved").textContent, "Saved in browser");
  assert.match(recovery.status().title, /original CSV file is not updated/);
}

// 検索操作に古い結果を使わず、0行の絞り込みからも安全に解除できるようにする。
{
  const marks = ['<CSV value>', '検索語'].map((textContent) => ({
    textContent, replacement: null, replaceWith(node) { this.replacement = node; },
  }));
  new vm.Script(`${extractConstDeclaration(html, 'clearRenderedSearchDecorations')} clearRenderedSearchDecorations();`)
    .runInNewContext({
      $dataTable: {}, clearCurrentMatchCell: () => {},
      qsa: (selector) => selector === 'mark.search-text-hit' ? marks : [],
      document: { createTextNode: (textContent) => ({ nodeType: 3, textContent }) },
    });
  assert.deepEqual(marks.map((mark) => mark.replacement), [
    { nodeType: 3, textContent: '<CSV value>' }, { nodeType: 3, textContent: '検索語' },
  ], 'clearing search must remove inline highlights while keeping cell text literal');

  const declarations = [
    "_canUseSearchResults", "_updateSearchControls", "updateSearchInfo", "scheduleSearch",
    "cancelSearchTasks", "resetSearchState", "clearSearch", "_clearAllSearchFilters",
    "replaceNext", "navigateMatch",
  ].map((name) => extractConstDeclaration(html, name)).join("\n");
  const search = new vm.Script(`
    const _elements = new Map();
    const qs = (selector) => {
      if (!_elements.has(selector)) _elements.set(selector, {
        value: '', checked: false, dataset: {}, attributes: {}, textContent: '', hidden: false,
        setAttribute(name, value) { this.attributes[name] = value; }, focus() {},
      });
      return _elements.get(selector);
    };
    const $searchInput = qs('#searchInput'), $replaceInput = qs('#replaceInput');
    const $searchInfo = qs('#searchInfo'), $searchClearBtn = qs('#searchClearBtn');
    const $clearAllFiltersBtn = qs('#clearAllFiltersBtn');
    const $searchCaseSensitive = qs('#searchCaseSensitive');
    const $searchExactMatch = qs('#searchExactMatch'), $searchRegex = qs('#searchRegex');
    const $searchTargetCol = qs('#searchTargetCol'), $filterMode = qs('#filterMode');
    const state = { data: [['apple'], ['banana']], hasHeader: false };
    const columnFilters = new Map(), _filterValueCache = new Map();
    let filteredRows = null, _columnFilterRows = null, _columnFilterTaskToken = 0;
    let searchMatches = [], searchMatchMap = new Map(), currentMatchIndex = -1;
    let _searchInProgress = false, _searchError = '', _searchDebounceTimer = null;
    let _searchTaskToken = 0, _searchWorker = null, _searchTotalCount = 0, _searchMatchTruncated = false, _dataRevision = 0;
    let _visible = 2, _english = false, _writes = 0, _history = 0;
    const SEARCH_DEBOUNCE_MS = 120;
    const isEnglish = () => _english, getLocaleTag = () => _english ? 'en-US' : 'ja-JP';
    const getSearchTargetCol = () => Number($searchTargetCol.value || '-1');
    const getColumnDisplayName = (col) => 'Column ' + (col + 1);
    const getBodyDataStart = () => 0, getVisibleRowCount = () => _visible;
    const _hasActiveRowFilter = () => columnFilters.size > 0 || ($filterMode.checked && filteredRows !== null);
    const clearCurrentMatchCell = () => {}, closeColFilterPanel = () => {};
    const renderForSearchResult = () => { if (!_hasActiveRowFilter()) _visible = state.data.length; };
    const renderTable = renderForSearchResult, highlightCurrentMatch = () => {}, updateStats = () => {};
    const commitActiveCellEdit = () => {};
    const saveToHistory = () => _history++, saveToStorage = () => _writes++;
    const buildReplaceRegex = (query) => new RegExp(query);
    const setCellValue = (row, col, value) => { state.data[row][col] = value; };
    const showToast = () => {}, performSearchImmediate = () => {}, runSearchTask = () => {};
    ${declarations}
    ({
      element: qs, state, columnFilters, scheduleSearch, clearSearch, _clearAllSearchFilters, replaceNext,
      navigateMatch, updateSearchInfo,
      ready: () => { $searchInput.value = 'apple'; $replaceInput.value = 'pear';
        _searchDebounceTimer = null; _searchError = ''; _searchInProgress = false;
        searchMatches = [{ row: 0, col: 0 }]; _searchTotalCount = 1; currentMatchIndex = 0; updateSearchInfo(); },
      zeroRows: () => { columnFilters.set(0, { values: new Set() }); _visible = 0;
        $searchCaseSensitive.checked = true; $filterMode.checked = true; filteredRows = new Set();
        _searchDebounceTimer = null; _searchTotalCount = 0; searchMatches = []; updateSearchInfo(); },
      error: () => { _searchDebounceTimer = null; _searchError = 'Invalid pattern'; updateSearchInfo(); },
      english: () => { _english = true; updateSearchInfo(); },
      stats: () => ({ writes: _writes, history: _history, index: currentMatchIndex, visible: _visible,
        searchToken: _searchTaskToken, filterToken: _columnFilterTaskToken }),
    });
  `).runInNewContext({ setTimeout: () => 1, clearTimeout: () => {} });

  search.updateSearchInfo();
  assert.equal(search.element('#replaceAllBtn').disabled, true, 'replacement needs a completed matching query');
  search.ready();
  assert.equal(search.element('#replaceNextBtn').disabled, false);
  search.element('#searchInput').value = 'banana';
  search.scheduleSearch();
  assert.equal(search.element('#replaceNextBtn').disabled, true, 'debounce must immediately disable old results');
  assert.equal(search.element('#searchNextBtn').disabled, true);
  await search.replaceNext();
  search.navigateMatch(1);
  assert.equal(search.stats().history, 0, 'a pending query must not replace the previous result');
  assert.equal(search.state.data[0][0], 'apple');
  search.error();
  assert.equal(search.element('#searchInput').attributes['aria-invalid'], 'true');
  assert.equal(search.element('#replaceAllBtn').disabled, true);
  search.clearSearch();
  assert.equal(search.element('#searchInput').attributes['aria-invalid'], 'false');
  assert.equal(search.element('#searchInfo').textContent, '', 'clearing must remove the invalid-pattern error');

  search.ready();
  await search.replaceNext();
  assert.equal(search.state.data[0][0], 'pear', 'completed results remain replaceable');
  const beforeReset = JSON.stringify(search.state.data);
  search.zeroRows();
  assert.equal(search.element('#clearAllFiltersBtn').disabled, false, 'zero-row filters must remain clearable');
  search.english();
  assert.equal(search.element('#clearAllFiltersBtn').disabled, false);
  search._clearAllSearchFilters();
  assert.equal(search.columnFilters.size, 0);
  assert.equal(search.element('#filterMode').checked, false);
  assert.equal(search.element('#searchCaseSensitive').checked, false);
  assert.equal(search.element('#searchInput').value, '');
  assert.equal(search.element('#clearAllFiltersBtn').disabled, true);
  assert.equal(search.stats().visible, 2, 'reset must reveal every data row');
  assert.equal(JSON.stringify(search.state.data), beforeReset, 'clearing view conditions must preserve the data');
  assert.equal(search.stats().filterToken, 1, 'reset must invalidate pending column-filter evaluation');
}

{
  // ブラウザの描画に依存せず、フォーカスの移り変わりとメニューのキー操作を検証する。
  const declarations = [
    'MODAL_FOCUSABLE_SELECTOR', '_overlayFocusTargets', '_openOverlayStack',
    'getFocusableOverlayElements', '_restoreUiFocus', 'getTopOpenOverlay',
    'trapOverlayTabFocus', 'openOverlay', 'closeOverlay', '_actionMenuTriggers',
    '_closeActionMenu', '_openActionMenu', '_handleActionMenuKeydown',
  ].map((name) => extractConstDeclaration(html, name)).join('\n');
  const ui = new vm.Script(`
    const document = {
      activeElement: null,
      contains: ($target) => Boolean($target?.connected),
    };
    class HTMLElement {
      constructor(name, options = {}) {
        this.name = name; this.dataset = {}; this.style = {}; this.attributes = {};
        this.connected = true; this.hidden = false; this.disabled = false;
        this.items = []; this.parent = null; this.tabIndex = 0; this.clicks = 0;
        Object.assign(this, options);
        const classes = new Set();
        this.classList = { add: (v) => classes.add(v), remove: (v) => classes.delete(v), contains: (v) => classes.has(v) };
      }
      setAttribute(name, value) { this.attributes[name] = value; }
      matches(selector) { return selector === ':disabled' && this.disabled; }
      closest() { return null; }
      getClientRects() { return this.hidden ? [] : [{}]; }
      contains($target) { return $target === this || this.items.some(($item) => $item.contains($target)); }
      focus() { document.activeElement = this; }
      click() { this.clicks++; }
      scrollIntoView() {}
    }
    const _frames = [];
    const requestAnimationFrame = (callback) => _frames.push(callback);
    const window = { innerWidth: 320, innerHeight: 240 };
    const qs = (selector, root = document) => selector === '.modal' ? root.modal : root.items?.find(($item) => '#' + $item.name === selector) ?? null;
    const qsa = (selector, root) => root.items ?? [];
    let _$activeActionMenu = null;
    ${declarations}
    const create = (name, options) => new HTMLElement(name, options);
    const key = (value, shiftKey = false) => ({ key: value, shiftKey, prevented: false, stopped: false,
      preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } });
    ({ create, document, key, openOverlay, closeOverlay, trapOverlayTabFocus,
       openMenu: _openActionMenu, closeMenu: _closeActionMenu, menuKey: _handleActionMenuKeydown,
       flushFrames: () => { while (_frames.length) _frames.shift()(); },
    });
  `).runInNewContext();

  const trigger = ui.create('trigger');
  const hidden = ui.create('hidden', { hidden: true });
  const disabled = ui.create('disabled', { disabled: true });
  const cancel = ui.create('cancel');
  const confirm = ui.create('confirm');
  const dialog = ui.create('dialog');
  const overlay = ui.create('overlay', { items: [hidden, disabled, cancel, confirm], modal: dialog });
  const painted = [];
  overlay.parentNode = {appendChild: element => painted.push(element)};
  ui.document.activeElement = trigger;
  ui.openOverlay(overlay, { focusSelector: '#confirm' });
  ui.flushFrames();
  assert.equal(painted.at(-1), overlay, 'opening a dialog must bring it above its existing siblings');
  assert.equal(ui.document.activeElement, confirm, 'dialog must honor a usable preferred initial control');
  ui.document.activeElement = cancel;
  const reverseTab = ui.key('Tab', true);
  ui.trapOverlayTabFocus(reverseTab);
  assert.equal(ui.document.activeElement, confirm, 'reverse Tab must wrap over visible, enabled controls');
  assert.equal(reverseTab.prevented, true);
  ui.document.activeElement = dialog;
  const dialogTab = ui.key('Tab', true);
  ui.trapOverlayTabFocus(dialogTab);
  assert.equal(ui.document.activeElement, confirm, 'focus on dialog itself must not escape on Shift+Tab');
  ui.closeOverlay(overlay);
  assert.equal(ui.document.activeElement, trigger, 'closing dialog must restore its trigger');

  ui.openOverlay(overlay, { focusSelector: '#hidden' });
  ui.flushFrames();
  assert.equal(ui.document.activeElement, cancel, 'hidden preferred controls must fall back to the first usable control');
  ui.closeOverlay(overlay);
  ui.openOverlay(overlay, { focusSelector: '#cancel' });
  ui.document.activeElement = confirm;
  ui.flushFrames();
  assert.equal(ui.document.activeElement, confirm, 'late initial focus must preserve a control already chosen by the user');
  ui.closeOverlay(overlay);
  ui.openOverlay(overlay);
  ui.closeOverlay(overlay);
  ui.flushFrames();
  assert.equal(ui.document.activeElement, trigger, 'closing before animation must cancel pending initial focus');

  ui.openOverlay(overlay);
  ui.flushFrames();
  const nestedButton = ui.create('nestedButton');
  const nested = ui.create('nested', { items: [nestedButton] });
  ui.openOverlay(nested);
  ui.flushFrames();
  ui.closeOverlay(nested);
  assert.equal(ui.document.activeElement, cancel, 'nested dialog must return focus to its parent dialog');
  ui.closeOverlay(overlay);
  assert.equal(ui.document.activeElement, trigger);

  const first = ui.create('first');
  const middle = ui.create('middle');
  const last = ui.create('last');
  const menu = ui.create('menu', { items: [first, middle, last], offsetWidth: 200, offsetHeight: 180 });
  const rect = { left: 290, top: 210, bottom: 234 };
  ui.openMenu(menu, trigger, rect);
  assert.equal(ui.document.activeElement, first, 'opening a menu must focus an action');
  assert.equal(trigger.attributes['aria-expanded'], 'true');
  assert.equal(menu.style.left, '112px', 'menu must stay inside the right viewport edge');
  assert.equal(menu.style.top, '26px', 'menu must open upward near the bottom viewport edge');
  ui.menuKey(ui.key('ArrowUp'));
  assert.equal(ui.document.activeElement, last, 'up from first menu action must wrap');
  ui.menuKey(ui.key('Home'));
  assert.equal(ui.document.activeElement, first);
  ui.menuKey(ui.key('ArrowDown'));
  assert.equal(ui.document.activeElement, middle);
  ui.menuKey(ui.key('End'));
  assert.equal(ui.document.activeElement, last);
  ui.menuKey(ui.key('Enter'));
  assert.equal(last.clicks, 1, 'Enter must activate the focused menu action');
  const escape = ui.key('Escape');
  ui.menuKey(escape);
  assert.equal(ui.document.activeElement, trigger, 'Escape must restore the menu trigger');
  assert.equal(trigger.attributes['aria-expanded'], 'false');
  assert.equal(escape.prevented && escape.stopped, true, 'Escape must not clear the table selection behind a menu');
  ui.openMenu(menu, trigger, rect, { focusLast: true });
  assert.equal(ui.document.activeElement, last, 'ArrowUp opening must start at the final action');
  const tab = ui.key('Tab');
  ui.menuKey(tab);
  assert.equal(ui.document.activeElement, trigger);
  assert.equal(menu.classList.contains('show'), false, 'Tab must dismiss the menu');
  assert.equal(tab.prevented, false, 'Tab must continue naturally from the trigger');
  assert.match(extractConstDeclaration(html, 'openModal'), /confirmVariant === 'gm-btn-danger' \? '#modalCancelBtn'/,
    'destructive dialogs must initially focus cancel');
}

// 貼り付けダイアログのキャンセル、下書き、操作可能状態を維持する。
{
  const declarations = ["processData", "_updatePasteImportControls", "_closePasteImport",
    "triggerPaste", "_submitPasteImport", "_updateActionAvailability"]
    .map((name) => extractConstDeclaration(html, name)).join("\n");
  const csvCore = loadCsvCore();
  const startCore = new vm.Script(`
    const state = { data: [] };
    const _controls = new Map();
    const qs = (selector) => {
      if (!_controls.has(selector)) _controls.set(selector, { value: '', checked: false, disabled: false, textContent: '' });
      return _controls.get(selector);
    };
    const $pasteImportInput = qs('#pasteImportInput');
    const $pasteImportConfirm = qs('#pasteImportConfirmBtn');
    const $pasteImportStatus = qs('#pasteImportStatus');
    const $pasteImportOverlay = { visible: false, setAttribute() {} };
    let _pasteImportBusy = false, _pasteImportRequestId = 0, _saveFileInProgress = false;
    let _processDataRequestId = 0, _dataRevision = 0;
    let _commits = [], _focusCount = 0, _confirm = true, _english = false;
    let _parse = async (text, delimiter) => parseCSV(text, delimiter);
    const parseCSVAsync = (text, delimiter) => _parse(text, delimiter);
    const isEnglish = () => _english;
    const showToast = () => {};
    const showParseErrorToast = () => {};
    const detectNewlineSettingFromText = () => 'lf';
    const _confirmDataReplacement = async () => _confirm;
    const _commitImportedData = (snapshot) => { state.data = snapshot.data; _commits.push(snapshot); _dataRevision++; };
    const _focusFirstDataCell = () => _focusCount++;
    const openOverlay = ($overlay) => { $overlay.visible = true; };
    const closeOverlay = ($overlay) => { $overlay.visible = false; };
    ${declarations}
    ({
      reset: () => { state.data = []; _commits = []; _focusCount = 0; _confirm = true; _english = false; },
      text: (text) => { $pasteImportInput.value = text; _updatePasteImportControls(); },
      header: (checked) => { qs('#pasteImportHeader').checked = checked; },
      confirm: (confirmed) => { _confirm = confirmed; },
      parser: (parser) => { _parse = parser; },
      language: (english) => { _english = english; },
      open: triggerPaste, close: _closePasteImport, submit: _submitPasteImport, processData,
      externalEdit: data => {state.data = data; _dataRevision++;},
      busy: (busy) => { _saveFileInProgress = busy; },
      availability: _updateActionAvailability, control: qs,
      snapshot: () => ({ data: state.data, commits: _commits, focusCount: _focusCount,
        visible: $pasteImportOverlay.visible, text: $pasteImportInput.value,
        disabled: $pasteImportConfirm.disabled, status: $pasteImportStatus.textContent }),
    });
  `).runInNewContext({ parseCSV: csvCore.parseCSV, detectDelimiter: csvCore.detectDelimiter });
  const normalize = (value) => JSON.parse(JSON.stringify(value));

  startCore.availability();
  for (const id of ['saveBtn', 'copyBtn', 'dlBtn', 'clearBtn', 'exportWizardBtn']) {
    assert.equal(startCore.control('#' + id).disabled, true, `empty editor should disable ${id}`);
  }
  for (const id of ['addRowBtn', 'addColBtn']) {
    assert.equal(startCore.control('#' + id).disabled, false, `empty editor should allow creating a table with ${id}`);
  }
  startCore.text('code,name\n00101,ノート'); startCore.open();
  await startCore.submit();
  startCore.availability();
  assert.equal(startCore.control('#saveBtn').disabled, false);
  startCore.busy(true); startCore.availability();
  assert.equal(startCore.control('#saveBtn').disabled, true);
  assert.equal(startCore.control('#dlBtn').disabled, false);
  startCore.busy(false);

  startCore.reset(); startCore.text(''); startCore.open();
  assert.equal(startCore.snapshot().disabled, true, 'empty clipboard dialog should explain where to paste without permission calls');
  await startCore.submit();
  assert.equal(startCore.snapshot().commits.length, 0);
  startCore.text('code,name\n00101,ノート'); startCore.header(true);
  await startCore.submit();
  assert.equal(startCore.snapshot().commits[0].hasHeader, true);
  assert.equal(startCore.snapshot().commits[0].data[1][0], '00101');
  assert.equal(startCore.snapshot().visible, false);
  assert.equal(startCore.snapshot().text, '', 'only successful imports should consume the draft');

  startCore.reset(); startCore.text('retry,me'); startCore.open();
  startCore.parser(async () => { throw new Error('parse failure'); });
  await startCore.submit();
  assert.equal(startCore.snapshot().text, 'retry,me');
  assert.equal(startCore.snapshot().visible, true);
  assert.equal(startCore.snapshot().disabled, false, 'failed import should allow retry');
  assert.equal(startCore.snapshot().commits.length, 0);

  const pendingParses = [];
  startCore.parser(() => new Promise((resolve) => pendingParses.push(resolve)));
  const oldImport = startCore.submit();
  await Promise.resolve();
  await startCore.submit();
  assert.equal(pendingParses.length, 1, 'double click should start one import');
  startCore.close();
  startCore.text('new,table'); startCore.open();
  const newImport = startCore.submit();
  await Promise.resolve();
  pendingParses[0]([['stale', 'result']]);
  await oldImport;
  assert.equal(startCore.snapshot().commits.length, 0, 'cancelled import must not commit after reopening');
  assert.equal(startCore.snapshot().disabled, true, 'old completion must not enable a newer in-flight import');
  pendingParses[1]([['new', 'table']]);
  await newImport;
  assert.deepEqual(normalize(startCore.snapshot().data), [['new', 'table']]);

  startCore.reset();
  const earlierPaste = startCore.processData('earlier,paste');
  await Promise.resolve();
  const laterPaste = startCore.processData('later,paste');
  await Promise.resolve();
  pendingParses[3]([['later', 'paste']]);
  assert.equal(await laterPaste, true);
  pendingParses[2]([['earlier', 'paste']]);
  assert.equal(await earlierPaste, false);
  assert.deepEqual(normalize(startCore.snapshot().data), [['later', 'paste']], 'direct paste must ignore out-of-order completion');

  startCore.reset();
  const interruptedPaste = startCore.processData('pending,paste');
  await Promise.resolve();
  startCore.externalEdit([['newer', 'edit']]);
  pendingParses[4]([['pending', 'paste']]);
  assert.equal(await interruptedPaste, false);
  assert.deepEqual(normalize(startCore.snapshot().data), [['newer', 'edit']], 'direct paste must preserve edits made during parsing');
}

{
  const declarations = ['_restoreUiFocus', 'openColFilterPanel', 'closeColFilterPanel',
    '_handleColFilterPanelKeydown', 'isImeCompositionKeyEvent']
    .map((name) => extractConstDeclaration(html, name)).join('\n');
  const filterUi = new vm.Script(`
    const document = { activeElement: null, contains: ($el) => Boolean($el?.connected) };
    const create = (name, dataset = {}) => ({
      name, dataset, connected: true, attributes: {}, style: {}, value: '',
      matches: () => false, getClientRects: () => [{}],
      setAttribute(name, value) { this.attributes[name] = value; },
      focus() { document.activeElement = this; },
    });
    let $trigger = create('filter trigger', { filterCol: '2' });
    const $colFilterPanel = create('panel'), $colFilterSearch = create('search'),
      $colFilterValues = create('values'), $colFilterTitle = create('title'), $dataTable = {};
    let _shown = false, filterPanelColIndex = -1, _filterValuePanelState = null, _$colFilterFocusTarget = null, _colFilterPanelRevision = 0;
    $colFilterPanel.classList = { contains: () => _shown, add: () => { _shown = true; }, remove: () => { _shown = false; } };
    $colFilterPanel.contains = ($el) => $el === $colFilterSearch;
    const qs = (selector) => selector === 'button[data-filter-col="2"]' ? $trigger : null;
    const closeColumnMenu = () => {}, populateFilterValues = () => {}, restoreFilterConditions = () => {};
    const columnFilters = new Map(), FILTER_VALUE_RENDER_BATCH = 200;
    const getColumnDisplayName = () => 'Name', isEnglish = () => false, _clampHorizontal = (x) => x;
    const getTopOpenOverlay = () => null, window = { scrollY: 0 };
    ${declarations}
    ({
      open: () => openColFilterPanel(2, { left: 30, bottom: 40 }, $trigger),
      close: closeColFilterPanel, key: _handleColFilterPanelKeydown, document,
      panel: $colFilterPanel, search: $colFilterSearch, trigger: () => $trigger,
      rebuild: () => { $trigger.connected = false; $trigger = create('rebuilt filter trigger', { filterCol: '2' }); },
    });
  `).runInNewContext();
  const event = (key) => ({ key, prevented: false, stopped: false,
    preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } });
  filterUi.open();
  assert.equal(filterUi.document.activeElement, filterUi.search, 'filter panel must initially focus its value search');
  const escape = event('Escape');
  filterUi.key(escape);
  assert.equal(filterUi.document.activeElement, filterUi.trigger(), 'Escape must return to the filter button');
  assert.equal(filterUi.panel.attributes['aria-hidden'], 'true');
  assert.equal(filterUi.trigger().attributes['aria-expanded'], 'false');
  assert.equal(escape.prevented && escape.stopped, true, 'Escape must not reach table shortcuts');
  const hiddenEscape = event('Escape');
  filterUi.key(hiddenEscape);
  assert.equal(hiddenEscape.prevented || hiddenEscape.stopped, false, 'closed panels must not consume keys');
  filterUi.open();
  const deletion = event('Delete');
  filterUi.key(deletion);
  assert.equal(deletion.stopped, true, 'filter input keys must not delete selected table cells');
  filterUi.rebuild();
  filterUi.close();
  assert.equal(filterUi.document.activeElement, filterUi.trigger(), 'filter apply/clear redraw must restore the replacement header button');
  filterUi.open();
  const outside = { name: 'other input' };
  filterUi.document.activeElement = outside;
  filterUi.close();
  assert.equal(filterUi.document.activeElement, outside, 'outside dismissal must preserve the control the user chose');
}

// 読み込みのキャンセル時は、ファイル情報も含めて非同期の結果を無効化する。
{
  const declarations = [
    "_setWizImportBusy", "wizGetCurrentDecode", "wizGetCurrentDelimiter", "openImportWizard",
    "closeImportWizard", "wizExecuteImport", "_readFileForImport", "_isExternalFileDrag",
    "_clearFileDragState", "_handleFileDragOver", "_handleFileDragEnter", "_handleFileDragLeave", "_handleFileDrop",
  ].map((name) => extractConstDeclaration(html, name)).join("\n");
  const importer = new vm.Script(`
    const _elements = new Map(), commits = [], errors = [], toasts = [];
    const document = { activeElement: null };
    const qs = (selector) => {
      if (!_elements.has(selector)) {
        const classes = new Set(), attributes = new Map();
        const $element = {
          value: '', checked: false, disabled: false, textContent: '', style: {},
          setAttribute: (key, value) => attributes.set(key, value),
          getAttribute: (key) => attributes.get(key),
          classList: { add: (name) => classes.add(name), remove: (name) => classes.delete(name),
            contains: (name) => classes.has(name), toggle: (name, on) => on ? classes.add(name) : classes.delete(name) },
          focus: () => { document.activeElement = $element; }
        };
        _elements.set(selector, $element);
      }
      return _elements.get(selector);
    };
    const qsa = () => ['#wizEncoding', '#wizDelimiter', '#wizHeader', '#wizPreviewRows'].map(qs);
    const $wizOverlay = qs('#importWizardOverlay'), $wizImportBtn = qs('#wizImportBtn');
    const $wizNextBtn = qs('#wizNextBtn'), $wizBackBtn = qs('#wizBackBtn'), $wizCancelBtn = qs('#wizCancelBtn');
    let _wizImportRevision = 0, _fileReadRevision = 0, _fileDragDepth = 0;
    let _wizImportInProgress = false, _wizArrayBuffer = null, _wizFileName = '', _wizFileHandle = null;
    let _wizDecodedCache = {}, _overlayOpen = false;
    const state = { quoteStyle: 'auto', data: [] };
    const parseCSV = (text, delimiter) => text.split('\\n').map((line) => line.split(delimiter));
    let _parser = async (text, delimiter) => parseCSV(text, delimiter);
    let _warningsConfirmed = true, _replacementConfirmed = true;
    const parseCSVAsync = (text, delimiter) => _parser(text, delimiter);
    const confirmDecodeWarnings = async () => _warningsConfirmed;
    const _confirmDataReplacement = async () => _replacementConfirmed;
    const detectEncodingLabel = () => 'utf-8';
    const decodeFileBytesWithMeta = (buffer, encoding) => ({ text: buffer.text, encoding, bom: false, warnings: [] });
    const detectDelimiter = (text) => text.includes('\\t') ? '\\t' : ',';
    const normalizeEncoding = (value) => value, normalizeExportEncoding = (value) => value;
    const supportsBom = () => true, getEncodingDisplayName = (value) => value;
    const delimiterDisplayName = (value) => value, formatFileSize = (value) => String(value);
    const detectNewlineSettingFromText = (text) => text.includes('\\r\\n') ? 'crlf' : 'lf';
    const getLocaleTag = () => 'ja-JP', isEnglish = () => false, escapeHTML = (value) => value;
    const wizSetStep = () => {}, openOverlay = () => { _overlayOpen = true; };
    const closeOverlay = () => { _overlayOpen = false; }, hasOpenOverlay = () => _overlayOpen;
    const showToast = (message, type) => toasts.push({ message, type });
    const showParseErrorToast = (error) => errors.push(error.message);
    const _commitImportedData = (value) => { commits.push(value); state.data = value.data; };
    ${declarations}
    ({
      open: (text, name = 'original.csv') => openImportWizard({ text, byteLength: text.length }, name, { name }),
      run: wizExecuteImport, close: closeImportWizard, read: _readFileForImport,
      drop: _handleFileDrop, dragOver: _handleFileDragOver,
      parser: (next) => { _parser = next; },
      warnings: (confirmed) => { _warningsConfirmed = confirmed; },
      replacement: (confirmed) => { _replacementConfirmed = confirmed; },
      set: (selector, patch) => Object.assign(qs(selector), patch),
      snapshot: () => ({ commits, errors, toasts, visible: _overlayOpen, busy: _wizImportInProgress,
        disabled: $wizImportBtn.disabled, ariaBusy: $wizImportBtn.getAttribute('aria-busy'),
        name: _wizFileName, label: qs('#wizImportBtnLabel').textContent,
        dragging: qs('.container').classList.contains('is-file-dragging') })
    });
  `).runInNewContext();
  const settleImportStart = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
  const pendingParses = [];
  importer.open('original,data');
  importer.parser(() => new Promise((resolve) => pendingParses.push(resolve)));
  const oldImport = importer.run();
  await settleImportStart();
  await importer.run();
  assert.equal(pendingParses.length, 1, 'double import should start one parse');
  assert.equal(importer.snapshot().ariaBusy, 'true');
  importer.close();
  assert.equal(importer.snapshot().busy, false, 'cancel should release busy controls immediately');
  importer.open('new\tdata', 'second.tsv');
  const newImport = importer.run();
  await settleImportStart();
  pendingParses[0]([['original', 'data']]);
  await oldImport;
  assert.equal(importer.snapshot().commits.length, 0, 'cancelled import must never commit into a reopened wizard');
  assert.equal(importer.snapshot().disabled, true, 'old completion must not enable a newer import');
  importer.set('#wizEncoding', { value: 'utf-16le' });
  importer.set('#wizDelimiter', { value: ',' });
  pendingParses[1]([['new', 'data']]);
  await newImport;
  const imported = importer.snapshot().commits[0];
  assert.equal(imported.fileContext.fileName, 'second.tsv');
  assert.equal(imported.fileContext.fileHandle.name, 'second.tsv');
  assert.equal(imported.encoding, 'utf-8', 'import must retain the encoding selected when it started');
  assert.equal(imported.delimiter, '\t', 'import must retain the delimiter selected when it started');
  assert.equal(importer.snapshot().busy, false);
  assert.equal(importer.snapshot().visible, false);
  assert.ok(importer.snapshot().toasts.at(-1).message.includes('second.tsv'), 'success should name the imported file after clearing wizard state');

  importer.open('retry,me');
  importer.parser(async () => { throw new Error('invalid CSV'); });
  await importer.run();
  assert.equal(importer.snapshot().disabled, false, 'failed import must allow retry');
  assert.equal(importer.snapshot().visible, true);
  importer.warnings(false);
  await importer.run();
  assert.equal(importer.snapshot().busy, false, 'declining a warning must release the import guard');
  importer.warnings(true);
  importer.replacement(false);
  await importer.run();
  assert.equal(importer.snapshot().busy, false, 'declining data replacement must release the import guard');
  importer.replacement(true);
  importer.parser(async () => [['retry', 'me']]);
  await importer.run();
  assert.equal(importer.snapshot().commits.length, 2, 'a successful retry should commit once');

  let finishOldRead;
  const oldRead = importer.read({ name: 'old.csv', arrayBuffer: () => new Promise((resolve) => { finishOldRead = resolve; }) });
  await importer.read({ name: 'new.csv', arrayBuffer: async () => ({ text: 'new,data', byteLength: 8 }) });
  finishOldRead({ text: 'old,data', byteLength: 8 });
  await oldRead;
  assert.equal(importer.snapshot().name, 'new.csv', 'a slower previous file read must not replace a newer file');
  importer.close();

  const makeDrop = (files, types = ['Files']) => ({
    dataTransfer: { files, types }, prevented: false,
    preventDefault() { this.prevented = true; },
  });
  const rowDrag = makeDrop([], ['text/plain']);
  importer.dragOver(rowDrag);
  assert.equal(rowDrag.prevented, false, 'file drop handling must leave row/column reordering alone');
  const csvFile = { name: 'dropped.csv', arrayBuffer: async () => ({ text: 'drop,data', byteLength: 9 }) };
  const fileDrop = makeDrop([csvFile]);
  importer.dragOver(fileDrop);
  assert.equal(fileDrop.prevented, true, 'file dragging must prevent browser navigation');
  assert.equal(importer.snapshot().dragging, true);
  await importer.drop(fileDrop);
  assert.equal(importer.snapshot().name, 'dropped.csv', 'file drops must open the existing import wizard');
  assert.equal(importer.snapshot().dragging, false);
  const blockedDrop = makeDrop([csvFile]);
  await importer.drop(blockedDrop);
  assert.equal(blockedDrop.prevented, true);
  assert.ok(importer.snapshot().toasts.at(-1).message.includes('ダイアログを閉じて'), 'dropping over a dialog should explain how to retry');
  importer.close();
  const multiDrop = makeDrop([csvFile, csvFile]);
  await importer.drop(multiDrop);
  assert.equal(multiDrop.prevented, true);
  assert.equal(importer.snapshot().visible, false, 'multiple files must not silently import only the first file');
  assert.ok(importer.snapshot().toasts.at(-1).message.includes('1つずつ'));
}


{
  const declarations = ['STRICT_NUMERIC_RE', '_parseExactNumeric', '_compareExactNumbers',
    '_compareSortableKeys', 'sortRowsByColumn', 'evalCondition']
    .map((name) => extractConstDeclaration(html, name)).join('\n');
  const core = vm.runInNewContext(`${declarations}
    const compareSortableValues = (left, right, dir, locale) => _compareSortableKeys(
      { text: left, number: _parseExactNumeric(left) },
      { text: right, number: _parseExactNumeric(right) }, locale
    ) * (dir === 'asc' ? 1 : -1);
    ({ compareSortableValues, sortRowsByColumn, evalCondition });`);
  for (const [left, right, expected] of [
    ['9007199254740993', '9007199254740992', 1],
    ['-9007199254740993', '-9007199254740992', -1],
    ['0.123456789012345678901', '0.123456789012345678900', 1],
    ['1e99999999999999999999', '9e99999999999999999998', 1],
    ['1e-99999999999999999999', '0', 1],
    ['-1e-99999999999999999999', '0', -1],
    ['+001.2300e2', '123', 0], ['-0', '0.000e9999', 0],
    ['.1', '1e-1', 0], ['10.', '9.999999999999999999', 1],
  ]) {
    assert.equal(Math.sign(core.compareSortableValues(left, right, 'asc', 'ja-JP')), expected);
    assert.equal(core.evalCondition(left, 'gte', right), expected >= 0);
    assert.equal(core.evalCondition(left, 'lte', right), expected <= 0);
  }
  assert.equal(core.evalCondition('001', 'equals', '1'), false, 'text equality must preserve leading zeros');
  const values = ['2', '10', '11a', '', 'あ', '-3', '0', '1e9999', '9007199254740993'];
  for (const a of values) for (const b of values) for (const c of values) {
    if (core.compareSortableValues(a,b,'asc','ja-JP') <= 0 && core.compareSortableValues(b,c,'asc','ja-JP') <= 0) {
      assert.ok(core.compareSortableValues(a,c,'asc','ja-JP') <= 0, `transitivity: ${a}, ${b}, ${c}`);
    }
  }
  const rows = [['9007199254740993','A'], ['2','B'], ['9007199254740992','C'], ['02','D']];
  assert.deepEqual(cloneJson(core.sortRowsByColumn(rows,0,'asc','ja-JP')), [rows[1],rows[3],rows[2],rows[0]]);
  assert.deepEqual(cloneJson(core.sortRowsByColumn(rows,0,'desc','ja-JP')), [rows[0],rows[2],rows[1],rows[3]]);
  assert.equal(rows[0][1], 'A', 'sorting must not mutate the source matrix');
}

{
  let visible = [1,3,5], focused = null, committed = 0, selected = null;
  const callbacks = [];
  const core = vm.runInNewContext(`
    let _selectionAnchor = null;
    ${extractConstDeclaration(html,'parseDatasetIndex')}
    ${extractConstDeclaration(html,'handleCellNavigation')}
    handleCellNavigation;
  `, {
    isImeCompositionKeyEvent: (e) => !!e.isComposing,
    getColumnCount: () => 2,
    getVisibleOffsetByRowIndex: (row) => { const n=visible.indexOf(row); return n<0 ? undefined : n; },
    getVisibleRowCount: () => visible.length,
    getVisibleRowIndexAt: (i) => visible[i],
    _isRowVisible: (row) => visible.includes(row),
    handleCellBlur: () => { committed++; },
    _dataRevision: 0,
    clearSelection: () => { selected = null; },
    selectCell: (cell) => { selected = cell.selector; },
    scheduleStatusBarUpdate() {},
    ensureRowRendered: () => { assert.ok(committed > 0, 'commit must happen before virtual DOM replacement'); },
    $dataTable: {}, qs: (selector) => ({ selector, focus: () => { focused = selector; } }),
    setTimeout: (fn) => callbacks.push(fn),
  });
  for (const [key, row, col, options, target] of [
    ['Enter',1,0,{},[3,0]], ['Tab',1,1,{},[3,0]], ['Tab',3,0,{shiftKey:true},[1,1]],
    ['ArrowDown',1,1,{altKey:true},[3,1]], ['ArrowUp',5,0,{altKey:true},[3,0]],
    ['Enter',5,0,{},null], ['Tab',1,0,{shiftKey:true},null], ['Tab',5,1,{},null], ['Enter',1,0,{isComposing:true},null],
  ]) {
    focused=null; committed=0; selected=null;
    let prevented = false;
    core({key,...options,preventDefault(){ prevented = true; }},{dataset:{row:String(row),col:String(col)}});
    while(callbacks.length) callbacks.shift()();
    assert.equal(focused, target ? `td[data-row="${target[0]}"][data-col="${target[1]}"]` : null, `${key} at ${row}:${col}`);
    assert.equal(selected, focused, 'navigation must move the clipboard selection together with focus');
    assert.equal(prevented, !options.isComposing && !(key === 'Tab' && !target), 'native Tab order must remain available at visible table boundaries');
  }
  focused=null;
  core({key:'Enter',preventDefault(){}},{dataset:{row:'1',col:'0'}});
  visible=[1,5];
  while(callbacks.length) callbacks.shift()();
  assert.equal(focused,null,'a target removed by a concurrent filter update must not receive focus');
}


{
  const source = extractConstDeclaration(html, 'runDataWorker');
  for (const mode of ['success', 'timeout', 'error', 'messageerror', 'post-failure', 'constructor-failure']) {
    let terminated = 0, revoked = 0, created = 0;
    class WorkerMock {
      constructor() { if (mode === 'constructor-failure') throw new Error(mode); }
      postMessage() {
        if (mode === 'post-failure') throw new Error(mode);
        if (mode === 'timeout') return;
        queueMicrotask(() => mode === 'success' ? this.onmessage({data: 'result'}) : this[`on${mode}`](new Error(mode)));
      }
      terminate() { terminated++; }
    }
    const run = vm.runInNewContext(`${source}; runDataWorker`, {
      DATA_WORKER_TIMEOUT_MS: 10, Worker: WorkerMock, Blob, setTimeout, clearTimeout,
      URL: {createObjectURL() { created++; return 'blob:qa'; }, revokeObjectURL() {revoked++;}},
    });
    if (mode === 'success') assert.equal(await run('worker source', {}), 'result');
    else await assert.rejects(run('worker source', {}));
    assert.equal(created, 1);
    assert.equal(revoked, 1, `${mode}: release the blob URL`);
    assert.equal(terminated, mode === 'constructor-failure' ? 0 : 1, `${mode}: terminate the worker`);
  }
}

{
  let requests = 0;
  const connections = [];
  const indexedDB = {
    open() {
      requests++;
      const request = {};
      queueMicrotask(() => {
        const connection = {closed: false, close() {this.closed = true;}};
        connections.push(connection);
        request.result = connection;
        request.onsuccess();
      });
      return request;
    },
  };
  const {IDBStore: store} = loadStorageMigrationCore({localStorage: createLocalStorageMock(), indexedDB});
  const [first, same] = await Promise.all([store.open(), store.open()]);
  assert.equal(first, same);
  assert.equal(requests, 1, 'concurrent initialization must share a database connection');
  first.onversionchange();
  assert.equal(first.closed, true);
  const second = await store.open();
  first.onclose();
  assert.equal(await store.open(), second, 'a late close from an old connection must not invalidate the new one');
  assert.equal(requests, 2);
}

{
  const localStorage = createLocalStorageMock([['read-abort', JSON.stringify({value: 'fallback'})]]);
  const indexedDB = {open() {
    const request = {};
    queueMicrotask(() => {
      request.result = {transaction() {
        const tx = {objectStore: () => ({get: () => ({})})};
        queueMicrotask(() => tx.onabort?.());
        return tx;
      }};
      request.onsuccess();
    });
    return request;
  }};
  const {IDBStore: store} = loadStorageMigrationCore({localStorage, indexedDB});
  let timer;
  try {
    const value = await Promise.race([store.get('read-abort'), new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('aborted read did not settle')), 100);
    })]);
    assert.deepEqual(cloneJson(value), {value:'fallback'});
  } finally { clearTimeout(timer); }
}

{
  const ranges = new Map([['<script>\rabc', [[9,12]]]]);
  const ctx = {hasQuery:true, exactMatch:false, regex:{exec() {throw new Error('regex ran on UI thread');}}};
  const source = extractConstDeclaration(html,'renderCellTextWithSearchHit');
  const render = vm.runInNewContext(`${source}; renderCellTextWithSearchHit`, {
    _regexHighlightRanges: ranges, getSearchHighlightContext: () => ctx, $searchRegex:{checked:true},
    escapeHTML: text => text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'),
  });
  assert.equal(render('<script>\rabc', {isMatchedCell:true}), '&lt;script&gt;&#13;<mark class="search-text-hit">abc</mark>');
  ctx.exactMatch = true;
  assert.equal(render('a\rb', {isMatchedCell:true}), '<mark class="search-text-hit">a&#13;b</mark>');
  assert.equal(render('<img onerror=attack()>'), '&lt;img onerror=attack()&gt;');
}

// 改行や選択パターンを含むセル全体の一致判定を、検索と置換で揃える。
{
  const declarations = ['escapeRegExp', '_exactSearchPattern', '_createLiteralSearchRegex', 'buildMatcher', 'buildReplaceRegex']
    .map(name => extractConstDeclaration(name === 'buildMatcher' ? html.slice(html.lastIndexOf('const buildMatcher =')) : html, name)).join('\n');
  const core = vm.runInNewContext(`
    const $searchCaseSensitive = {checked: false}, $searchExactMatch = {checked: true}, $searchRegex = {checked: false};
    ${declarations}
    ({buildMatcher, buildReplaceRegex, regex: value => {$searchRegex.checked = value;},
      options: (caseSensitive, exactMatch) => { $searchCaseSensitive.checked = caseSensitive; $searchExactMatch.checked = exactMatch; }});
  `);
  for (const regexMode of [false, true]) {
    core.regex(regexMode);
    const match = core.buildMatcher('foo');
    const replace = core.buildReplaceRegex('foo', true);
    for (const text of ['foo', 'FOO', 'foo\n', 'foo\r', 'foo\r\n', 'foo\u2028', 'foo\u2029', ' foo', 'foobar']) {
      const expected = text === 'foo' || text === 'FOO';
      assert.equal(Boolean(match(text)), expected, `search: ${JSON.stringify(text)}`);
      assert.equal(text.replace(replace, 'done'), expected ? 'done' : text, `replace: ${JSON.stringify(text)}`);
    }
  }
  core.regex(true);
  for (const query of ['a|ab', 'a.*?', '(a|ab)']) {
    assert.equal(core.buildMatcher(query)('ab'), true, `${query} must allow a complete alternative`);
    assert.equal('ab'.replace(core.buildReplaceRegex(query, true), 'done'), 'done');
  }
  assert.equal(core.buildMatcher('['), null);
  core.regex(false);
  assert.equal(core.buildMatcher('a.b')('a.b'), true);
  assert.equal('a.b\n'.replace(core.buildReplaceRegex('a.b', true), 'done'), 'a.b\n');
  for (const [query, cell, insensitive] of [
    ['σ', 'ς', true], ['σ', 'Σ', true], ['k', 'K', true], ['s', 'ſ', true],
    ['𐐨', '𐐀', true], ['i', 'İ', false], ['i', 'ı', false],
    ['ß', 'SS', false], ['日本', '日本', true], ['a.b', 'axb', false],
    ['[x]', '[x]', true], ['\\', '\\', true], ['😀', '😀', true],
  ]) {
    for (const caseSensitive of [false, true]) {
      for (const exactMatch of [false, true]) {
        core.options(caseSensitive, exactMatch);
        const expected = caseSensitive ? query === cell : insensitive;
        assert.equal(core.buildMatcher(query)(cell), expected, `literal search ${query}/${cell}`);
        assert.equal(cell.replace(core.buildReplaceRegex(query, true), 'done'), expected ? 'done' : cell,
          `literal replacement must target exactly the search matches: ${query}/${cell}`);
      }
    }
  }
}

// ブラウザに依存せず、実際の検索・フィルターWorkerと失敗時の後始末を検証する。
{
  const declarations = ['escapeRegExp', '_exactSearchPattern', '_createLiteralSearchRegex', 'STRICT_NUMERIC_RE', '_parseExactNumeric', '_compareExactNumbers', 'evalCondition',
    'terminateSearchWorker', 'ensureSearchWorker', 'callSearchWorker',
    'terminateFilterWorker', 'ensureFilterWorker', 'callFilterWorker']
    .map(name => extractConstDeclaration(html, name)).join('\n');
  const sources = new Map(), workers = [];
  let constructorFailure = false;
  const runtime = {
    setTimeout, clearTimeout, console: {warn() {}},
    Blob: class {constructor(parts) {this.source = parts.join('');}},
    URL: {createObjectURL(blob) {const id = `blob:${sources.size}`; sources.set(id, blob.source); return id;}, revokeObjectURL(id) {sources.delete(id);}},
    Worker: class {
      constructor(url) {
        if (constructorFailure) throw new Error('worker unavailable');
        workers.push(this);
        this.scope = {postMessage: data => queueMicrotask(() => {if (!this.stopped) this.onmessage({data});})};
        vm.runInNewContext(sources.get(url), {self: this.scope, performance, setTimeout});
      }
      postMessage(data) {if (!this.hold) this.scope.onmessage({data});}
      terminate() {this.stopped = true;}
    },
  };
  const core = vm.runInNewContext(`
    const DATA_WORKER_TIMEOUT_MS = 1000, REGEX_WORKER_TIMEOUT_MS = 1000;
    let _searchWorker = null, _searchWorkerUrl = '', _searchWorkerRequestSeq = 0, _searchWorkerDataRevision = -1, _searchWorkerDirtyRows = null;
    let _filterWorker = null, _filterWorkerUrl = '', _filterWorkerRequestSeq = 0, _filterWorkerDataRevision = -1, _filterWorkerDirtyRows = null;
    const _searchWorkerPending = new Map(), _filterWorkerPending = new Map();
    ${declarations}
    ({callSearchWorker, callFilterWorker, terminateSearchWorker, terminateFilterWorker});
  `, runtime);
  await core.callSearchWorker('syncData', {data: [['a'], ['ab'], ['ab\n']]});
  const result = await core.callSearchWorker('search', {
    query: 'a|ab', caseSensitive: true, exactMatch: true, useRegex: true,
    taskToken: 1, start: 0, targetCol: -1, filterBySearch: true,
    highlightAllMatches: true, storeLimit: 100, minBatchRows: 700, timeBudgetMs: 12,
  });
  assert.deepEqual(cloneJson(result.matchedRows), [0, 1]);
  await core.callSearchWorker('syncData', {data: [['ς'], ['K'], ['𐐀'], ['İ'], ['other']]});
  let token = 2;
  for (const [query, expectedRows] of [['σ', [0]], ['k', [1]], ['𐐨', [2]], ['i', []]]) {
    for (const exactMatch of [false, true]) {
      const packet = await core.callSearchWorker('search', {
        query, caseSensitive: false, exactMatch, useRegex: false,
        taskToken: token++, start: 0, targetCol: -1, filterBySearch: true,
        highlightAllMatches: true, storeLimit: 100, minBatchRows: 700, timeBudgetMs: 12,
        canUseRowPrefilter: !exactMatch,
      });
      assert.deepEqual(cloneJson(packet.matchedRows), expectedRows, 'worker and row prefilter must share literal Unicode matching');
    }
  }
  core.terminateSearchWorker();
  const rows = Array.from({length: 10000}, (_, i) => [String(i)]);
  const selected = rows.filter((_, i) => i % 2 === 0).map(row => row[0]);
  await core.callFilterWorker('syncData', {data: rows});
  const filtered = await core.callFilterWorker('evaluateFilters', {start: 0, filters: [{colIdx: 0, values: selected, conditions: []}]});
  assert.deepEqual(cloneJson(filtered.passingRows), rows.map((_, i) => i).filter(i => i % 2 === 0));
  const empty = await core.callFilterWorker('evaluateFilters', {start: 0, filters: [{colIdx: 0, values: [], conditions: []}]});
  assert.deepEqual(cloneJson(empty.passingRows), []);
  const counts = await core.callFilterWorker('valueCounts', {colIdx: 0, start: 0, filters: [{colIdx: 0, values: ['2', '4'], conditions: []}]});
  assert.deepEqual(cloneJson(counts.sorted), [['2', 1], ['4', 1]]);
  core.terminateFilterWorker();
  for (const kind of ['Search', 'Filter']) {
    await core[`call${kind}Worker`]('syncData', {data: [['retained']]});
    const worker = workers.at(-1);
    worker.hold = true;
    const pending = core[`call${kind}Worker`]('syncData', {data: []});
    assert.equal(typeof worker.onmessageerror, 'function');
    worker.onmessageerror(new Error('invalid worker message'));
    await assert.rejects(pending, /terminated/);
    assert.equal(worker.stopped, true);
    assert.equal(sources.size, 0, 'worker errors must release object URLs immediately');
    constructorFailure = true;
    await assert.rejects(core[`call${kind}Worker`]('syncData', {data: []}), /unavailable/);
    assert.equal(sources.size, 0, 'constructor failure must release its object URL');
    constructorFailure = false;
  }
}

// 結果の行数が減った後、以前の大きなスクロール位置のせいで余白行だけを描画してはならない。
{
  const scroll = {clientHeight: 420, scrollTop: 4000000};
  const body = {innerHTML: ''};
  const virtualState = {enabled: true, start: -1, end: -1};
  const render = vm.runInNewContext(`let _isReplacingTableBody = false;
    ${extractConstDeclaration(html, '_replaceTableBody')}
    ${extractConstDeclaration(html, 'renderVirtualBody')}; renderVirtualBody;`, {
    virtualState, state: {data: [['cell']]}, $tableScroll: scroll, $tableBody: body,
    VIRTUAL_ROW_HEIGHT: 42, VIRTUAL_OVERSCAN: 12,
    getVisibleRowCount: () => 1500, getVisibleRowIndexAt: index => index,
    buildBodyRowHTML: index => `<tr data-row="${index}"></tr>`, refreshRenderedSelectionVisuals() {},
  });
  render();
  assert.ok(virtualState.start <= virtualState.end);
  assert.ok(body.innerHTML.includes('data-row="1499"'));
  assert.ok(scroll.scrollTop <= 1500 * 42);
}

// プリセットの保存失敗を、後の無関係な書き込みで暗黙に成功扱いしてはならない。
{
  const declarations = ['saveVirtualHeaderPresetFromDraft', 'deleteSelectedVirtualHeaderPreset']
    .map(name => extractConstDeclaration(html, name)).join('\n');
  const core = vm.runInNewContext(`
    let virtualHeaderPresets = [{name: 'existing', labels: ['original']}], _fail = true, _saved = [], _status;
    const MAX_VIRTUAL_HEADER_PRESETS = 20;
    const $virtualHeaderPresetName = {value: 'new'}, $virtualHeaderPresetSelect = {value: 'existing'};
    const getVirtualHeaderDraft = () => ['draft'], getColumnCount = () => 1;
    const normalizeVirtualHeaderPreset = value => value;
    const getSelectedVirtualHeaderPreset = () => virtualHeaderPresets.find(p => p.name === $virtualHeaderPresetSelect.value);
    const setVirtualHeaderStatus = message => {_status = message;};
    const sortVirtualHeaderPresets = () => virtualHeaderPresets.sort((a,b) => a.name.localeCompare(b.name));
    const renderVirtualHeaderPresetSelect = () => {};
    const saveVirtualHeaderPresets = () => {if (_fail) return false; _saved = structuredClone(virtualHeaderPresets); return true;};
    ${declarations}
    ({save: saveVirtualHeaderPresetFromDraft, remove: deleteSelectedVirtualHeaderPreset,
      enable: () => {_fail = false;}, snapshot: () => ({presets: virtualHeaderPresets, saved: _saved, status: _status})});
  `, {structuredClone});
  core.remove();
  assert.deepEqual(cloneJson(core.snapshot().presets), [{name:'existing',labels:['original']}]);
  core.save();
  assert.equal(core.snapshot().presets.length, 1);
  core.enable();
  core.save();
  assert.deepEqual(cloneJson(core.snapshot().saved.map(p => p.name)), ['existing', 'new']);
}

// 標準の選択コントロールは、選択肢を再構築するまで一覧にない値を保持できない。
{
  let options = ['-1', '0', '1'], value = '1';
  const select = {
    dataset: {},
    get value() { return value; },
    set value(next) { value = options.includes(next) ? next : ''; },
    set innerHTML(markup) { options = [...markup.matchAll(/value="([^"]+)"/g)].map(match => match[1]); },
  };
  const state = { data: [['left', 'target', 'inserted']] };
  const core = vm.runInNewContext(`
    ${extractConstDeclaration(html, 'remapSearchTargetColumn')}
    ${extractConstDeclaration(html, 'updateSearchTargetCols')}
    ({remapSearchTargetColumn, updateSearchTargetCols});
  `, {state, $searchTargetCol: select, isEnglish: () => true, getColumnDisplayName: String, escapeHTML: String});
  core.remapSearchTargetColumn(index => index + 1);
  core.updateSearchTargetCols();
  assert.equal(select.value, '2', 'inserting before the last search column must not broaden the search scope');
  core.remapSearchTargetColumn(index => index === 2 ? -1 : index);
  state.data = [['left', 'inserted']];
  core.updateSearchTargetCols();
  assert.equal(select.value, '-1', 'deleting the actual search column must reset the target');
}

// 無効な列や古い操作座標を編集可能なセルとして扱ってはならない。
{
  const core = vm.runInNewContext(`
    let _selectionModel = new Map([[0, new Set([0, 2, -1])], [1, new Set([1])], [2, new Set([0])]]);
    let _selectionAnchor = {row: 0, col: 2}, _dragStart = {row: 2, col: 0}, _isDragging = true;
    const clearSelectionModel = () => { _selectionModel = new Map(); };
    const $dataTable = {classList: {remove() {}}};
    ${extractConstDeclaration(html, '_pruneSelectionToVisibleRows')}
    ${extractConstDeclaration(html, '_resetCellSelection')}
    ({ prune: _pruneSelectionToVisibleRows, reset: _resetCellSelection,
      snapshot: () => ({selection: [..._selectionModel].map(([row, cols]) => [row, [...cols]]),
        anchor: _selectionAnchor, drag: _dragStart, dragging: _isDragging}) });
  `, {getColumnCount: () => 2, _isRowVisible: row => row === 0 || row === 1});
  assert.equal(core.prune(), true);
  assert.deepEqual(cloneJson(core.snapshot().selection), [[0, [0]], [1, [1]]]);
  assert.equal(core.snapshot().anchor, null);
  assert.equal(core.snapshot().drag, null);
  core.reset();
  assert.deepEqual(cloneJson(core.snapshot()), {selection: [], anchor: null, drag: null, dragging: false});
}

// 第1回：引用セル内の実際の改行で判定処理を打ち切らない。
{
  for (const separator of ['\n', '\r', '\r\n']) {
    const note = Array.from({ length: 12 }, (_, i) => `line ${i}`).join(separator);
    for (const delimiter of ['\t', ';', ' ']) {
      const text = `"${note}"${delimiter}one${separator}"${note}"${delimiter}two`;
      assert.equal(csv.detectDelimiter(text), delimiter, 'detect the delimiter after a multiline first cell');
      assert.deepEqual(cloneJson(csv.parseCSV(text, csv.detectDelimiter(text))), [[note, 'one'], [note, 'two']]);
    }
  }
}

// 第3回：Markdown表のセル内でも出力データを文字どおりに保持する。
{
  const generate = vm.runInNewContext(`${extractConstDeclaration(html, 'generateExportOutput')}; generateExportOutput`, {
    $expFormat: { value: 'markdown' }, $expNewline: { value: 'lf' },
    $expQuote: { value: 'auto' }, $expSpreadsheetSafe: { checked: false },
    getExportFormatConfig: () => ({ id: 'markdown', isDsv: false }),
    escapeHTML: text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
  });
  const output = generate({ headers: ['**title**'], rows: [['[link](url)'], ['`code` _text_ ~~strike~~'], ['a|b\\c\r\nd']] });
  assert.ok(output.includes('\\*\\*title\\*\\*'));
  assert.ok(output.includes('\\[link\\](url)'));
  assert.ok(output.includes('\\`code\\` \\_text\\_ \\~\\~strike\\~\\~'));
  assert.ok(output.includes('a\\|b\\\\c<br>d'));
}

// 第4回：ファイル先頭のBOMだけを除き、デコーダーはセル内のU+FEFFを保持する。
{
  const declarations = ['prependBytes', 'encodeUtf16Bytes', 'decodeUtf16Bytes', 'detectBomEncoding',
    'decodeWithTextDecoder', 'strictTextDecoderResult', 'collectDecodeWarnings', 'decodeByEncoding',
    'encodeToBytes', 'decodeBytesWithMeta', 'decodeFileBytesWithMeta'].map(name => extractConstDeclaration(html, name)).join('\n');
  const encoding = vm.runInNewContext(`${declarations}; ({encodeToBytes, decodeFileBytesWithMeta})`, {
    TextDecoder, TextEncoder, Uint8Array, normalizeEncoding: value => value,
    supportsBom: () => true, HAS_LEGACY_ENCODING_LIB: false,
    ENCODING_TO_LIBRARY: {}, ENCODING_TO_DECODER_LABEL: {},
    getEncodingDisplayName: value => value,
  });
  const value = '\uFEFF名前,😀\r\n𠮷野,値';
  for (const label of ['utf-8', 'utf-16le', 'utf-16be']) {
    const bytes = encoding.encodeToBytes(value, label, true);
    const decoded = encoding.decodeFileBytesWithMeta(bytes.buffer, label);
    assert.equal(decoded.text, value, `${label}: preserve U+FEFF after the transport BOM`);
    assert.equal(decoded.bom, true);
    assert.deepEqual(Array.from(encoding.encodeToBytes(decoded.text, label, decoded.bom)), Array.from(bytes));
  }
}

// 第5回：ファイル書き込み失敗時は、代替保存・再試行の前にストリームを解放する。
for (const overwrite of [false, true]) {
  for (const phase of ['write', 'close']) {
    const events = [];
    const handle = { name: 'failed.csv', async createWritable() {
      return {
        async write() { events.push('write'); if (phase === 'write') throw new Error('write failed'); },
        async close() { events.push('close'); if (phase === 'close') throw new Error('close failed'); },
        async abort() { events.push('abort'); throw new Error('cleanup also failed'); },
      };
    } };
    const output = loadFileOutputCore({ picker: overwrite ? undefined : async () => handle });
    output.state.data = [['intact']];
    if (overwrite) output.setOpenFileContext({ fileHandle: handle, outputMeta: output.getCurrentOutputMeta() });
    await output.saveFile();
    assert.deepEqual(events, phase === 'write' ? ['write', 'abort'] : ['write', 'close', 'abort']);
    assert.equal(output.downloads.length, 1, 'cleanup failure must not prevent fallback');
    assert.equal(output.downloads[0].blob.text, 'intact');
    assert.equal(output.buttonStates.at(-1), false);
  }
}

// 第9回：プレビューの読み取り・複製は指定サンプルに限定し、出力は全体を保持する。
{
  let reads = 0;
  const rows = Array.from({ length: 10000 }, (_, row) => Array.from({ length: 30 }, (_, col) => `${row}:${col}`));
  const data = rows.map(row => new Proxy(row, { get(target, key) {
    if (typeof key === 'string' && /^\d+$/.test(key)) reads++;
    return target[key];
  } }));
  const selection = new Map(rows.map((cells, row) => [row, new Set(cells.map((_, col) => col))]));
  const getExportData = vm.runInNewContext(`${extractConstDeclaration(html, 'getExportData')}; getExportData`, {
    state: { data, hasHeader: false }, $expTarget: { value: 'selected' },
    $expHeader: { checked: false }, $expSkipEmptyRows: { checked: false }, $expSkipEmptyCols: { checked: false },
    hasAnyVirtualHeader: () => false, _selectionModel: selection, _isRowVisible: () => true,
    getSelectedCoords: () => assert.fail('export must not allocate an intermediate object per selected cell'),
    _compareRowsByVisibleOrder: (a, b) => a - b, applyEmptyFilters: value => value,
  });
  assert.deepEqual(cloneJson(getExportData({ rowLimit: 200 }).rows), rows.slice(0, 200));
  assert.equal(reads, 6000, 'preview must not read cells after its first 200 rows');
  reads = 0;
  assert.deepEqual(cloneJson(getExportData().rows), rows);
  assert.equal(reads, 300000, 'actual export still includes every selected cell');
}

// 第10回：一時的なファイル入力要素を、選択・キャンセルまでDOMに保持する。
{
  let input, failRead = false;
  const open = vm.runInNewContext(`${extractConstDeclaration(html, 'openFileWithInputFallback')}; openFileWithInputFallback`, {
    document: { body: { appendChild(element) { element.connected = true; } }, createElement() {
      input = { connected: false, handlers: {}, files: [],
        addEventListener(type, handler) { this.handlers[type] = handler; },
        remove() { this.connected = false; },
        click() { assert.equal(this.connected, true, 'file control must be connected before opening the native picker'); },
      };
      return input;
    } },
    _readFileForImport: async () => { if (failRead) throw new Error('forced read failure'); },
  });
  open(1);
  assert.equal(input.hidden, true, 'transient control must not add visible UI');
  input.handlers.cancel();
  assert.equal(input.connected, false);
  open(2);
  input.files = [{}];
  await input.handlers.change();
  assert.equal(input.connected, false);
  open(3);
  input.files = [{}]; failRead = true;
  await assert.rejects(input.handlers.change, /forced read failure/);
  assert.equal(input.connected, false, 'read failure must also remove the transient control');
}

// 小数の集計では、最後の表示用丸めまで桁を保持する。
{
  const names = ['NUMBER_LIKE_RE', '_parseStatusDecimal', '_addStatusDecimal', '_formatStatusDecimal'];
  let locale = 'ja-JP';
  const core = vm.runInNewContext(`${names.map(name => extractConstDeclaration(html, name)).join('\n')};
    ({ parse: _parseStatusDecimal, add: _addStatusDecimal, format: _formatStatusDecimal })`, { getLocaleTag: () => locale });
  const aggregate = (values) => {
    const result = { sum: 0n, min: null, max: null, scale: 0, count: 0 };
    for (const value of values) {
      const number = core.parse(value);
      if (number) core.add(result, number);
    }
    return result;
  };
  const fixtures = [
    [['9007199254740993.1', '-9007199254740992.2', '0.1'], '1', '0.333333', '-9,007,199,254,740,992.2', '9,007,199,254,740,993.1'],
    [['0.1', '0.2', '-0.3'], '0', '0', '-0.3', '0.2'],
    [['-0.0000005', '-0.0000004'], '-0.000001', '0', '-0.000001', '0'],
    [['999.9999995', '0.0000005'], '1,000', '500', '0.000001', '1,000'],
    [[' 1,234.5000 ', '-001.250', '0.000'], '1,233.25', '411.083333', '-1.25', '1,234.5'],
  ];
  for (locale of ['ja-JP', 'en-US']) {
    for (const [values, sum, avg, min, max] of fixtures) {
      for (const sequence of [values, [...values].reverse()]) {
        const result = aggregate(sequence);
        assert.equal(core.format(result.sum, result.scale), sum);
        assert.equal(core.format(result.sum, result.scale, BigInt(result.count)), avg);
        assert.equal(core.format(result.min, result.scale), min);
        assert.equal(core.format(result.max, result.scale), max);
      }
    }
  }
  for (const value of ['', ' ', null, '1,23', 'NaN', 'Infinity', '1e3', '+1', '--1']) assert.equal(core.parse(value), null);
  const huge = aggregate(['9'.repeat(400), '-' + '9'.repeat(400), '0.25']);
  assert.equal(huge.count, 3);
  assert.equal(core.format(huge.sum, huge.scale), '0.25');
}

// プレビューも出力と同じ対象全体を絞り込んでから、表示行数を制限する。
{
  const body = Array.from({ length: 205 }, (_, i) => i < 200 ? ['', '', '', ''] : [String(i), '', i === 204 ? 'late' : '', 'outside']);
  const state = { data: body, hasHeader: false };
  const controls = {
    $expTarget: { value: 'all' }, $expHeader: { checked: false },
    $expSkipEmptyRows: { checked: true }, $expSkipEmptyCols: { checked: true },
  };
  let visible = body.map((_, i) => i);
  const getExportData = vm.runInNewContext(`${extractConstDeclaration(html, 'getExportData')}; getExportData`, {
    ...controls, state, getColumnCount: () => state.data[0]?.length ?? 0,
    hasAnyVirtualHeader: () => true, getVirtualHeaderLabel: col => col === 1 ? 'Named empty column' : '',
    _selectionModel: new Map(Array.from({length: 206}, (_, row) => [row, new Set([0, 2])])),
    _isRowVisible: row => visible.includes(row),
    _compareRowsByVisibleOrder: (a, b) => a - b, rebuildVisibleRows() {},
    _getVisibleRowIndexes: limit => limit === null ? visible : visible.slice(0, limit),
  });
  for (const target of ['all', 'filtered', 'selected']) {
    controls.$expTarget.value = target;
    const expected = body.slice(200).map(row => target === 'selected' ? [row[0], row[2]] : [row[0], row[2], row[3]]);
    assert.deepEqual(cloneJson(getExportData({ rowLimit: 200 }).rows), expected);
    assert.deepEqual(cloneJson(getExportData().rows), expected);
    controls.$expSkipEmptyRows.checked = false;
    assert.deepEqual(cloneJson(getExportData({ rowLimit: 200 }).rows), body.slice(0, 200).map(() => expected[0].map(() => '')));
    controls.$expSkipEmptyRows.checked = true;
    assert.equal(getExportData({rowLimit:0}).rows.length, 0);
  }
  controls.$expTarget.value = 'filtered';
  visible = [200];
  assert.deepEqual(cloneJson(getExportData().rows), [['200', 'outside']], 'hidden rows cannot retain empty columns');
  controls.$expTarget.value = 'selected';
  assert.deepEqual(cloneJson(getExportData().rows), [['200']], 'only selected columns determine whether a row is empty');
  controls.$expHeader.checked = true;
  assert.deepEqual(cloneJson(getExportData()), {headers:['', 'Named empty column'], rows:[['200', '']]});
  state.hasHeader = true;
  state.data = [['ID', 'Named empty column', '', ''], ...body];
  visible = [201];
  assert.deepEqual(cloneJson(getExportData()), {headers:['ID', 'Named empty column'], rows:[['200', '']]});
  visible = [];
  assert.deepEqual(cloneJson(getExportData()), {headers:[], rows:[]});
}

// 選択した値の数だけでは、表示中のすべての値が選択済みかは判定できない。
{
  const core = vm.runInNewContext(`
    const filterPanelColIndex = 0, $colFilterValues = {}, $colFilterConditions = {};
    let _filterValuePanelState;
    const qsa = () => [], qs = () => ({value: 'and'});
    ${extractConstDeclaration(html, 'collectFilterConfig')}
    (items, selected) => {
      _filterValuePanelState = {colIdx: 0, values: items === null ? null : items.map(value => ({value})), selectedValues: selected === null ? null : new Set(selected)};
      const result = collectFilterConfig();
      return result.values === null ? null : [...result.values];
    };
  `);
  assert.deepEqual(cloneJson(core(['B', 'C'], ['A', 'C'])), ['A', 'C']);
  assert.deepEqual(cloneJson(core(null, ['A'])), ['A']);
  assert.deepEqual(cloneJson(core([], [])), [], 'an explicit empty selection must not become all values');
  assert.equal(core(['A', 'B'], ['A', 'B']), null);
  assert.equal(core(null, null), null);
}

// 再度開いたフィルターパネルの下書きは、古いWorkerの結果が後から届いても維持する。
{
  const pending = [];
  const core = vm.runInNewContext(`
    const state = {data: new Array(8000), hasHeader: false};
    const FILTER_WORKER_ROW_THRESHOLD = 8000, FILTER_VALUE_RENDER_BATCH = 200;
    const _filterValueCache = new Map(), $colFilterSearch = {value: ''};
    let _dataRevision = 1, filterPanelColIndex = 0, _filterValuePanelState = null, renders = 0;
    const serializeOtherColumnFilters = () => [], buildFilterValueCacheKey = () => 'same-column';
    const syncFilterWorkerDataIfNeeded = async () => true, getLocaleTag = () => 'ja-JP';
    const normalizeCellValue = value => String(value), renderFilterValueList = () => renders++;
    ${extractConstDeclaration(html, 'populateFilterValues')}
    ({
      open: () => {_filterValuePanelState = {colIdx: 0, values: null, selectedValues: new Set(['A'])}; return populateFilterValues(0);},
      select: values => {_filterValuePanelState.selectedValues = new Set(values);},
      snapshot: () => ({selected: [..._filterValuePanelState.selectedValues], renders}),
    });
  `, {callFilterWorker: () => new Promise(resolve => pending.push(resolve))});
  const first = core.open(); await Promise.resolve();
  const second = core.open(); await Promise.resolve();
  core.select([]);
  pending[1]({sorted: [['A', 2], ['B', 7998]]}); await second;
  assert.deepEqual(cloneJson(core.snapshot()), {selected: [], renders: 1}, 'early deselection must survive completion');
  core.select(['B']);
  pending[0]({sorted: [['A', 2], ['B', 7998]]}); await first;
  assert.deepEqual(cloneJson(core.snapshot()), {selected: ['B'], renders: 1}, 'stale panel completion must not reset the new selection');
}

// フォーカスを移さず実行したコマンドも、未確定のセル値を使う。
{
  const state = {data: [['before', 'tail']], hasHeader: false};
  const copied = [], history = [];
  let pending = '';
  const declarations = ['applyTextTransform', 'copyColumn', 'copyRow'].map(name => extractConstDeclaration(html, name)).join('\n');
  const core = vm.runInNewContext(`${declarations}; ({applyTextTransform, copyColumn, copyRow});`, {
    state, activeColumnIndex: 0, activeRowIndex: 0,
    commitActiveCellEdit() { if (pending) { state.data[0][0] = pending; pending = ''; } },
    TEXT_TRANSFORMS: {upper: {fn: value => value.toUpperCase(), labelJa: '', labelEn: ''}},
    getSelectedCoords: () => [{row: 0, col: 0}],
    setCellValue: (row, col, value) => {state.data[row][col] = value;},
    saveCellBatchToHistory: changes => history.push(changes), renderTable() {}, updateStats() {}, saveToStorage() {},
    _refreshViewAfterCellBatchEdit() {}, isEnglish: () => false, showToast() {},
    hasValidActiveColumn: () => true, _hasActiveRowFilter: () => false, _isRowVisible: () => true,
    getColName: () => '', escapeHTML: value => value,
    _buildTsvRows: rows => rows.map(row => row.join('\t')).join('\n'),
    copyTextToClipboard: async value => {copied.push(value); return true;},
  });
  pending = 'new input'; core.applyTextTransform('upper');
  assert.equal(state.data[0][0], 'NEW INPUT');
  assert.equal(history[0][0].before, 'new input', 'transform Undo must retain the pending edit');
  pending = 'column input'; await core.copyColumn();
  assert.equal(copied.at(-1), 'column input');
  pending = 'row input'; await core.copyRow();
  assert.equal(copied.at(-1), 'row input\ttail');
}

// 再現可能な往復テストで、手書きの例から漏れる組み合わせも検証する。
{
  let seed = 0x4c435356;
  const next = max => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % max; };
  const tokens = ['', ' ', '  ', ',', ';', '\t', '\n', '\r', '\r\n', '"', '""', '日本語', '😀', '\ufeff', '<>&', '0', '=1'];
  for (let sample = 0; sample < 32; sample++) {
    const width = 1 + next(5);
    const rows = Array.from({length: 1 + next(8)}, () => Array.from({length: width}, () =>
      Array.from({length: next(6)}, () => tokens[next(tokens.length)]).join('')));
    for (const delimiter of [',', '\t', ';', ' ']) {
      for (const quoteStyle of ['auto', 'all']) {
        for (const newline of ['lf', 'crlf']) {
          csv._setStateForTest({data: rows, quoteStyle, newline});
          const output = await csv.generateOutputAsync(delimiter);
          assert.deepEqual(cloneJson(csv.parseCSV(output, delimiter)), rows,
            `round trip sample ${sample}: ${JSON.stringify({delimiter, quoteStyle, newline})}`);
        }
      }
    }
  }
}

// 選択の有無やコピーでは表示状態を考慮し、選択の確認・計数だけのために
//選択セルごとの座標オブジェクトを展開しない。
{
  const state = { data: [['before', 'a', 'b'], ['hidden', 'c', 'd'], ['last', 'e', 'f']] };
  const selection = new Map([[2, new Set([2, 0])], [1, new Set([0])], [0, new Set([0])]]);
  const visible = new Set([0, 2]);
  const copied = [];
  const declarations = ['_hasVisibleSelection', '_getSelectedRowsInVisibleOrder', 'getExportTargetAvailability', 'copySelectedCells']
    .map(name => extractConstDeclaration(html, name)).join('\n');
  const core = vm.runInNewContext(`${declarations}; ({copySelectedCells, getExportTargetAvailability})`, {
    state, _selectionModel: selection, _isRowVisible: row => visible.has(row),
    _compareRowsByVisibleOrder: (a, b) => a - b,
    columnFilters: new Map(), $filterMode: {checked: false}, filteredRows: null,
    commitActiveCellEdit: () => { state.data[0][0] = 'draft'; },
    getSelectedCoords: () => assert.fail('checking or counting selection must not expand cell coordinates'),
    _buildTsvRows: rows => rows.map(row => row.join('\t')).join('\n'),
    copyTextToClipboard: async text => { copied.push(text); return true; }, showToast() {},
  });
  assert.equal(core.getExportTargetAvailability().selected, true);
  assert.equal(await core.copySelectedCells(), true);
  assert.deepEqual(copied, ['draft\nlast\tf'], 'copy retains visible row/column order and pending edits');
  visible.clear();
  assert.equal(core.getExportTargetAvailability().selected, false);
  assert.equal(await core.copySelectedCells(), false);
  assert.equal(copied.length, 1, 'hidden selections must not replace the clipboard');
  selection.clear(); selection.set(0, new Set()); visible.add(0);
  assert.equal(core.getExportTargetAvailability().selected, false);
}

console.log("localcsv regression tests passed");
