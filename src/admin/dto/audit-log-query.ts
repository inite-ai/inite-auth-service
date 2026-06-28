/**
 * Query filters for GET /admin/audit-log.
 *
 * An interface (not a class DTO) so the global ValidationPipe's
 * forbidNonWhitelisted doesn't 400 on unknown query params — see
 * src/oauth/dto/oauth-requests.ts for the same reasoning.
 */
export interface AuditLogQuery {
  clientId?: string;
  event?: string;
  success?: string;
  companyId?: string;
  since?: string;
  until?: string;
  page?: string;
  limit?: string;
  /** For the export endpoint: 'csv' | 'json' (default json). */
  format?: string;
}
