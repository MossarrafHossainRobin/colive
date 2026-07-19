export function finiteNumber(value, fallback = 0) {
  const number = Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(number) ? number : fallback;
}

export function escapeCsv(value) {
  const text = Array.isArray(value) ? value.join(', ') : String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function rowsToCsv(columns, rows) {
  const header = columns.map((column) => escapeCsv(column.label)).join(',');
  const body = rows.map((row) => (
    columns.map((column) => escapeCsv(
      typeof column.value === 'function' ? column.value(row) : row[column.key]
    )).join(',')
  ));
  return [header, ...body].join('\r\n');
}

function xmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function rowsToSpreadsheetXml(columns, rows, sheetName = 'NestHub') {
  const renderCell = (value) => {
    const number = typeof value === 'number' && Number.isFinite(value);
    return `<Cell><Data ss:Type="${number ? 'Number' : 'String'}">${xmlEscape(value)}</Data></Cell>`;
  };
  const header = columns.map((column) => renderCell(column.label)).join('');
  const body = rows.map((row) => {
    const cells = columns.map((column) => renderCell(
      typeof column.value === 'function' ? column.value(row) : row[column.key]
    )).join('');
    return `<Row>${cells}</Row>`;
  }).join('');

  return `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?>` +
    `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">` +
    `<Worksheet ss:Name="${xmlEscape(sheetName)}"><Table><Row>${header}</Row>${body}</Table></Worksheet></Workbook>`;
}

export function downloadTextFile(content, fileName, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function parseDelimited(text) {
  const source = String(text || '').replace(/^\uFEFF/, '');
  const delimiter = source.includes('\t') ? '\t' : ',';
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(cell.trim());
      cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }

  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  if (!rows.length) return [];

  const headers = rows[0].map((header) => header.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim());
  return rows.slice(1).map((values) => Object.fromEntries(
    headers.map((header, index) => [header, values[index] ?? ''])
  ));
}

export function parseSpreadsheetXml(text) {
  const source = String(text || '').trim();
  if (!source) return [];
  const documentValue = new DOMParser().parseFromString(source, 'application/xml');
  if (documentValue.querySelector('parsererror')) throw new Error('This legacy Excel file is not valid Spreadsheet XML.');
  const rowNodes = [...documentValue.getElementsByTagNameNS('*', 'Row')];
  const matrix = rowNodes.map((row) => (
    [...row.getElementsByTagNameNS('*', 'Cell')].map((cell) => {
      const data = cell.getElementsByTagNameNS('*', 'Data')[0];
      return data?.textContent || '';
    })
  ));
  if (!matrix.length) return [];
  return parseDelimited(matrix.map((row) => row.map((value) => String(value).replace(/\t/g, ' ')).join('\t')).join('\n'));
}

export function gridNavigationTarget(event, rowIndex, columnIndex, rowCount, columnCount) {
  let nextRow = rowIndex;
  let nextColumn = columnIndex;

  if (event.key === 'ArrowUp') nextRow -= 1;
  if (event.key === 'ArrowDown' || event.key === 'Enter') nextRow += 1;
  if (event.key === 'ArrowLeft' && (
    event.currentTarget.selectionStart === 0 ||
    event.currentTarget.selectionStart === null ||
    event.currentTarget.selectionStart === undefined
  )) nextColumn -= 1;
  if (event.key === 'ArrowRight' && (
    event.currentTarget.selectionEnd === String(event.currentTarget.value ?? '').length ||
    event.currentTarget.selectionEnd === null ||
    event.currentTarget.selectionEnd === undefined
  )) nextColumn += 1;
  if (event.key === 'Tab') {
    nextColumn += event.shiftKey ? -1 : 1;
    if (nextColumn >= columnCount) {
      nextColumn = 0;
      nextRow += 1;
    }
    if (nextColumn < 0) {
      nextColumn = columnCount - 1;
      nextRow -= 1;
    }
  }

  nextRow = Math.max(0, Math.min(rowCount - 1, nextRow));
  nextColumn = Math.max(0, Math.min(columnCount - 1, nextColumn));

  if (nextRow === rowIndex && nextColumn === columnIndex) return null;
  return { row: nextRow, column: nextColumn };
}
