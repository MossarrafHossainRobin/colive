export function cellKey(memberId, date) {
  return `${memberId}::${date}`;
}

export function entryKey(memberId, date) {
  return cellKey(memberId, date);
}

export function clampCell(cell, rowCount, columnCount) {
  return {
    row: Math.max(0, Math.min(Math.max(0, rowCount - 1), Number(cell?.row || 0))),
    column: Math.max(0, Math.min(Math.max(0, columnCount - 1), Number(cell?.column || 0))),
  };
}

export function selectionBounds(selection, rowCount, columnCount) {
  const anchor = clampCell(selection?.anchor, rowCount, columnCount);
  const focus = clampCell(selection?.focus || selection?.anchor, rowCount, columnCount);
  return {
    top: Math.min(anchor.row, focus.row),
    bottom: Math.max(anchor.row, focus.row),
    left: Math.min(anchor.column, focus.column),
    right: Math.max(anchor.column, focus.column),
  };
}

export function selectionSize(selection, rowCount, columnCount) {
  const bounds = selectionBounds(selection, rowCount, columnCount);
  return {
    rows: bounds.bottom - bounds.top + 1,
    columns: bounds.right - bounds.left + 1,
    cells: (bounds.bottom - bounds.top + 1) * (bounds.right - bounds.left + 1),
  };
}

export function cellInSelection(row, column, selection, rowCount, columnCount) {
  const bounds = selectionBounds(selection, rowCount, columnCount);
  return row >= bounds.top && row <= bounds.bottom && column >= bounds.left && column <= bounds.right;
}

export function parseClipboardMatrix(value) {
  const text = String(value || '').replace(/\r/g, '');
  if (!text) return [];
  const rows = text.split('\n');
  if (rows.at(-1) === '') rows.pop();
  return rows.map((row) => row.split('\t'));
}

export function spreadsheetColumnLabel(index) {
  let value = Math.max(1, Number(index || 0) + 1);
  let label = '';
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return label;
}

export function cellAddress(row, column) {
  // Column A is reserved for the sticky member field.
  return `${spreadsheetColumnLabel(Number(column || 0) + 1)}${Number(row || 0) + 2}`;
}

export function rangeAddress(selection, rowCount, columnCount) {
  const bounds = selectionBounds(selection, rowCount, columnCount);
  const first = cellAddress(bounds.top, bounds.left);
  const last = cellAddress(bounds.bottom, bounds.right);
  return first === last ? first : `${first}:${last}`;
}
