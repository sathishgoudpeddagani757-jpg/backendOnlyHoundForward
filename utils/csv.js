const escapeValue = (value) => {
  const stringValue = value === null || value === undefined ? '' : String(value);
  const escaped = stringValue.replace(/"/g, '""');
  return `"${escaped}"`;
};

const rowsToCSV = (rows = []) => {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const lines = [headers.map(escapeValue).join(',')];

  rows.forEach((row) => {
    lines.push(headers.map((header) => escapeValue(row[header])).join(','));
  });

  return lines.join('\n');
};

module.exports = {
  rowsToCSV
};
