import { auditRowsToCsv } from '../audit-csv';

describe('auditRowsToCsv', () => {
  it('emits a stable header and one quoted row per record', () => {
    const csv = auditRowsToCsv([
      {
        id: '1',
        ts: new Date('2026-01-01T00:00:00.000Z'),
        event: 'token.issued',
        success: true,
        clientId: 'app',
        scopes: ['openid', 'email'],
      },
    ]);
    const lines = csv.trim().split('\r\n');
    expect(lines[0]).toBe(
      'id,ts,event,success,clientId,companyId,sub,audience,scopes,ip,userAgent,errorMessage',
    );
    expect(lines[1]).toContain('"token.issued"');
    expect(lines[1]).toContain('"2026-01-01T00:00:00.000Z"');
    // arrays join on ';'
    expect(lines[1]).toContain('"openid;email"');
  });

  it('escapes embedded quotes, commas and newlines (RFC 4180)', () => {
    const csv = auditRowsToCsv([
      { event: 'x', errorMessage: 'he said "hi", then\nleft' },
    ]);
    // embedded quote doubled, whole field quoted so the comma/newline are safe
    expect(csv).toContain('"he said ""hi"", then\nleft"');
  });

  it('renders null/undefined as empty (unquoted) cells', () => {
    const csv = auditRowsToCsv([{ event: 'x', sub: null }]);
    const row = csv.trim().split('\r\n')[1] ?? '';
    // id + ts empty, then the quoted event; null/missing fields stay empty.
    expect(row.startsWith(',,"x",')).toBe(true);
  });
});
