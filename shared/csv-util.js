(function () {
  function stripBom(text) {
    return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  }

  function parseCsv(text) {
    const src = stripBom(String(text || ''));
    const rows = [];
    let row = [];
    let cell = '';
    let inQuotes = false;

    for (let i = 0; i < src.length; i += 1) {
      const ch = src[i];
      const next = src[i + 1];

      if (inQuotes) {
        if (ch === '"' && next === '"') {
          cell += '"';
          i += 1;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          cell += ch;
        }
        continue;
      }

      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(cell);
        cell = '';
      } else if (ch === '\n') {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
      } else if (ch !== '\r') {
        cell += ch;
      }
    }

    if (inQuotes) {
      throw new Error('CSV loi: thieu dau quote dong.');
    }

    row.push(cell);
    if (row.length > 1 || row[0] !== '' || rows.length === 0) {
      rows.push(row);
    }

    const headers = rows.shift() || [];
    if (!headers.length || headers.every((h) => !String(h || '').trim())) {
      throw new Error('CSV phai co dong header.');
    }

    const seen = new Set();
    headers.forEach((header) => {
      const key = String(header || '').trim();
      if (!key) throw new Error('CSV co ten cot rong.');
      if (seen.has(key)) throw new Error(`CSV bi trung cot: ${key}.`);
      seen.add(key);
    });

    const records = rows
      .filter((cells) => cells.some((value) => String(value || '').trim() !== ''))
      .map((cells) => {
        const item = {};
        headers.forEach((header, index) => {
          item[header] = cells[index] ?? '';
        });
        return item;
      });

    return { headers, rows: records };
  }

  function escapeCsvValue(value) {
    const text = String(value ?? '');
    if (/[",\r\n]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  }

  function stringifyCsv(headers, rows) {
    const lines = [headers.map(escapeCsvValue).join(',')];
    rows.forEach((row) => {
      lines.push(headers.map((header) => escapeCsvValue(row[header])).join(','));
    });
    return `\ufeff${lines.join('\r\n')}`;
  }

  function ensureColumns(headers, names) {
    const next = headers.slice();
    names.forEach((name) => {
      if (!next.includes(name)) next.push(name);
    });
    return next;
  }

  globalThis.ZZCsv = {
    parseCsv,
    stringifyCsv,
    ensureColumns
  };
}());
