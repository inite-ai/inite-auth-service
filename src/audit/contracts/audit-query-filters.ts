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
}
