const CSV_PARSE_ERROR_UNCLOSED_QUOTE='csv_unclosed_quote';
const parseCSV = (text, delimiter, maxRows = Infinity) => {
        const rows = [];
        let currentRow = [], currentCell = '', inQuotes = false;
        let _cellWasQuoted = false;
        const isSpaceDelimiter = delimiter === ' ';

        for (let i = 0; i < text.length; i++) {
          const char = text[i], nextChar = text[i + 1];
          if (inQuotes) {
            if (char === '"') { nextChar === '"' ? (currentCell += '"', i++) : (inQuotes = false); }
            else currentCell += char;
          } else if (char === '"' && currentCell.length === 0) {
            inQuotes = true;
            _cellWasQuoted = true;
          } else if (char === '"') {
            currentCell += char;
          } else if (char === delimiter) {
            if (isSpaceDelimiter) {
              let runEnd = i + 1;
              while (text[runEnd] === ' ') runEnd++;
              const nextAfterRun = text[runEnd];
              const isLeadingRun = currentRow.length === 0 && currentCell.length === 0 && !_cellWasQuoted;
              const isTrailingRun = nextAfterRun === undefined || nextAfterRun === '\n' || nextAfterRun === '\r';
              if (!isLeadingRun && !isTrailingRun) {
                currentRow.push(currentCell);
                currentCell = '';
                _cellWasQuoted = false;
              }
              i = runEnd - 1;
            } else {
              currentRow.push(currentCell); currentCell = '';
              _cellWasQuoted = false;
            }
          } else if (char === '\n' || (char === '\r' && nextChar === '\n') || char === '\r') {
            currentRow.push(currentCell);
            rows.push(currentRow);
            if (rows.length >= maxRows) {
              currentRow = []; currentCell = '';
              break;
            }
            currentRow = []; currentCell = '';
            _cellWasQuoted = false;
            if (char === '\r' && nextChar === '\n') i++;
          } else {
            currentCell += char;
          }
        }
        if (inQuotes) {
          const parseError = new Error(CSV_PARSE_ERROR_UNCLOSED_QUOTE);
          parseError.code = CSV_PARSE_ERROR_UNCLOSED_QUOTE;
          throw parseError;
        }
        if (rows.length < maxRows) {
          currentRow.push(currentCell);
          if (_cellWasQuoted || currentRow.length > 1 || currentRow.some(c => c !== '')) rows.push(currentRow);
        }

        if (rows.length === 0) return [];
        let maxCols = 0;
        for (let i = 0; i < rows.length; i++) {
          if (rows[i].length > maxCols) maxCols = rows[i].length;
        }
        return rows.map(row => { while (row.length < maxCols) row.push(''); return row; });
      };

      module.exports = parseCSV;