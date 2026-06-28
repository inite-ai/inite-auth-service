/**
 * Serialize audit rows to CSV. Stable column order; values are RFC 4180
 * quoted (doubling embedded quotes) so commas, quotes and newlines in fields
 * (e.g. user agents, error messages) can't corrupt the layout. Arrays
 * (scopes) join on ';' and objects (metadata) are JSON-stringified.
 */
const COLUMNS = [
  'id',
  'ts',
  'event',
  'success',
  'clientId',
  'companyId',
  'sub',
  'audience',
  'scopes',
  'ip',
  'userAgent',
  'errorMessage',
] as const;

function cell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s: string;
  if (Array.isArray(value)) s = value.join(';');
  else if (value instanceof Date) s = value.toISOString();
  else if (typeof value === 'object') s = JSON.stringify(value);
  else s = String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

export function auditRowsToCsv(rows: Array<Record<string, unknown>>): string {
  const header = COLUMNS.join(',');
  const lines = rows.map((row) => COLUMNS.map((c) => cell(row[c])).join(','));
  return [header, ...lines].join('\r\n') + '\r\n';
}
