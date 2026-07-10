/** Columns the audit list may be sorted by (whitelist — see buildOrderBy). */
export type AuditSortColumn = 'ts' | 'event' | 'clientId' | 'sub' | 'success';

/** Filter shape shared by OAuthAuditService.list() and exportRows(). */
export interface AuditQueryFilters {
  companyId?: string;
  clientId?: string;
  event?: string;
  success?: boolean;
  since?: Date;
  until?: Date;
  page?: number;
  limit?: number;
  sortBy?: AuditSortColumn;
  sortDir?: 'asc' | 'desc';
}
