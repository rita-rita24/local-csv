// 前回改善版 SHA-256: 22b38713af0ee90e9abdddd6560d2a3bbb00d06dec9c8b688a3b1bdbf5d3c591
const prependBytes = (head, body) => {
        const out = new Uint8Array(head.length + body.length);
        out.set(head, 0);
        out.set(body, head.length);
        return out;
      };
const encodeUtf16Bytes = (text, littleEndian) => {
        const out = new Uint8Array(text.length * 2);
        for (let i = 0; i < text.length; i++) {
          const code = text.charCodeAt(i);
          const p = i * 2;
          if (littleEndian) {
            out[p] = code & 0xFF;
            out[p + 1] = code >>> 8;
          } else {
            out[p] = code >>> 8;
            out[p + 1] = code & 0xFF;
          }
        }
        return out;
      };
const decodeUtf16Bytes = (bytes, littleEndian) => {
        const evenLength = bytes.length - (bytes.length % 2);
        let out = '';
        for (let i = 0; i < evenLength; i += 2) {
          const code = littleEndian
            ? (bytes[i] | (bytes[i + 1] << 8))
            : ((bytes[i] << 8) | bytes[i + 1]);
          out += String.fromCharCode(code);
        }
        return out;
      };
const detectBomEncoding = (bytes) => {
        if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
          return { encoding: 'utf-8', offset: 3 };
        }
        if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
          return { encoding: 'utf-16le', offset: 2 };
        }
        if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
          return { encoding: 'utf-16be', offset: 2 };
        }
        return null;
      };
const decodeWithTextDecoder = (bytes, enc, options = {}) => {
        const label = ENCODING_TO_DECODER_LABEL[normalizeEncoding(enc)] ?? 'utf-8';
        try {
          // ファイル先頭のBOMはすでに除去済みなので、残っている
          // 先頭のU+FEFFは最初のセルの内容として扱う。
          return new TextDecoder(label, { ...options, ignoreBOM: true }).decode(bytes);
        } catch {
          if (options.fatal) throw new Error('fatal_decode_failed');
          return new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);
        }
      };
const strictTextDecoderResult = (bytes, enc) => {
        const label = ENCODING_TO_DECODER_LABEL[normalizeEncoding(enc)] ?? 'utf-8';
        let decoder;
        try {
          decoder = new TextDecoder(label, { fatal: true });
        } catch {
          return null;
        }
        try {
          decoder.decode(bytes);
          return true;
        } catch {
          return false;
        }
      };
const collectDecodeWarnings = ({ bytes, encoding, text }) => {
        const normalized = normalizeEncoding(encoding);
        const warnings = [];
        if ((normalized === 'utf-16le' || normalized === 'utf-16be') && bytes.length % 2 !== 0) {
          warnings.push('UTF-16の末尾に半端な1バイトがあり、読み込み時に切り捨てられます。');
        }
        const strictOk = strictTextDecoderResult(bytes, normalized);
        if (strictOk === false) {
          warnings.push(`${getEncodingDisplayName(normalized)}として厳密に読み込めないバイトが含まれています。`);
        }
        if (text.includes('\uFFFD')) {
          warnings.push('読み込み結果に置換文字（�）が含まれています。文字化けや不正バイトが置き換えられた可能性があります。');
        }
        return [...new Set(warnings)];
      };
const decodeByEncoding = (bytes, enc) => {
        const normalized = normalizeEncoding(enc);
        if (normalized === 'utf-16le') return decodeUtf16Bytes(bytes, true);
        if (normalized === 'utf-16be') return decodeUtf16Bytes(bytes, false);
        const libCode = ENCODING_TO_LIBRARY[normalized];
        if (libCode && HAS_LEGACY_ENCODING_LIB) {
          try {
            return Encoding.convert(bytes, { to: 'UNICODE', from: libCode, type: 'string' });
          } catch {
            return decodeWithTextDecoder(bytes, normalized);
          }
        }
        return decodeWithTextDecoder(bytes, normalized);
      };
const encodeToBytes = (text, enc, withBom = false) => {
        const normalized = normalizeEncoding(enc);

        if (normalized === 'utf-16le') {
          const body = encodeUtf16Bytes(text, true);
          return withBom ? prependBytes(new Uint8Array([0xFF, 0xFE]), body) : body;
        }
        if (normalized === 'utf-16be') {
          const body = encodeUtf16Bytes(text, false);
          return withBom ? prependBytes(new Uint8Array([0xFE, 0xFF]), body) : body;
        }

        const libCode = ENCODING_TO_LIBRARY[normalized];
        if (libCode && HAS_LEGACY_ENCODING_LIB) {
          const unicodeArray = Encoding.stringToCode(text);
          const encoded = Encoding.convert(unicodeArray, { to: libCode, from: 'UNICODE' });
          return new Uint8Array(encoded);
        }
        if (libCode) {
          throw new Error('legacy_encoding_unavailable');
        }

        const utf8 = new TextEncoder().encode(text);
        return withBom ? prependBytes(new Uint8Array([0xEF, 0xBB, 0xBF]), utf8) : utf8;
      };
const decodeBytesWithMeta = (bytes, encoding, { offset = 0, bom = false } = {}) => {
        const normalized = normalizeEncoding(encoding);
        const body = offset > 0 ? bytes.slice(offset) : bytes;
        const text = decodeByEncoding(body, normalized);
        return {
          text,
          encoding: normalized,
          bom: supportsBom(normalized) ? !!bom : false,
          warnings: collectDecodeWarnings({ bytes: body, encoding: normalized, text })
        };
      };
const decodeFileBytesWithMeta = (arrayBuffer, encodingHint = 'utf-8') => {
        const bytes = new Uint8Array(arrayBuffer);

        const bomInfo = detectBomEncoding(bytes);
        if (bomInfo) {
          return decodeBytesWithMeta(bytes, bomInfo.encoding, { offset: bomInfo.offset, bom: true });
        }

        const hint = normalizeEncoding(encodingHint);
        if (hint && encodingHint !== 'auto') {
          return decodeBytesWithMeta(bytes, hint);
        }

        if (HAS_LEGACY_ENCODING_LIB) {
          const detected = Encoding.detect(bytes);
          if (detected === 'SJIS') return decodeBytesWithMeta(bytes, 'shift-jis');
          if (detected === 'EUCJP') return decodeBytesWithMeta(bytes, 'euc-jp');
          if (detected === 'JIS') return decodeBytesWithMeta(bytes, 'iso-2022-jp');
          if (detected === 'UTF16') {
            const likelyBE = bytes.length >= 2 && bytes[0] === 0x00 && bytes[1] !== 0x00;
            return decodeBytesWithMeta(bytes, likelyBE ? 'utf-16be' : 'utf-16le');
          }
        }

        if (bytes.length >= 4) {
          const likelyBE = bytes[0] === 0x00 && bytes[1] !== 0x00;
          const likelyLE = bytes[1] === 0x00 && bytes[0] !== 0x00;
          if (likelyBE) return decodeBytesWithMeta(bytes, 'utf-16be');
          if (likelyLE) return decodeBytesWithMeta(bytes, 'utf-16le');
        }

        return decodeBytesWithMeta(bytes, 'utf-8');
      };
const buildCsvLine = (row, delimiter, quoteStyle) => (
        row.map((cell) => {
          const c = cell ?? '';
          const escaped = String(c).replace(/"/g, '""');
          if (quoteStyle === 'all') return `"${escaped}"`;
          if (quoteStyle === 'none') return String(c);
          return ((c === '' && (row.length === 1 || delimiter === ' ')) || String(c).includes(delimiter) || String(c).includes('"') || String(c).includes('\n') || String(c).includes('\r'))
            ? `"${escaped}"` : String(c);
        }).join(delimiter)
      );
const calcRowBytes = (row, delimiter, encoding, quoteStyle, suffix) => {
        const line = buildCsvLine(row, delimiter, quoteStyle) + suffix;
        try {
          return encodeToBytes(line, encoding, false).length;
        } catch {
          return line.length;
        }
      };