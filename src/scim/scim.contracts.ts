/**
 * SCIM 2.0 (RFC 7643 / 7644) wire contracts — schema URNs, the resource shapes
 * we emit, the permissive request-body shapes we accept, and the ListResponse /
 * Error envelope builders. Kept dependency-free so the service, controller, and
 * exception filter share one source of truth for the wire format.
 */

export const SCIM_SCHEMAS = {
  user: 'urn:ietf:params:scim:schemas:core:2.0:User',
  group: 'urn:ietf:params:scim:schemas:core:2.0:Group',
  serviceProviderConfig: 'urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig',
  resourceType: 'urn:ietf:params:scim:schemas:core:2.0:ResourceType',
  listResponse: 'urn:ietf:params:scim:api:messages:2.0:ListResponse',
  patchOp: 'urn:ietf:params:scim:api:messages:2.0:PatchOp',
  error: 'urn:ietf:params:scim:api:messages:2.0:Error',
} as const;

/** SCIM content type (RFC 7644 §3.1). */
export const SCIM_CONTENT_TYPE = 'application/scim+json';

/** A SCIM User resource as emitted on the wire. */
export interface ScimUser {
  schemas: string[];
  id: string;
  externalId?: string;
  userName: string;
  name?: { formatted?: string; givenName?: string; familyName?: string };
  displayName?: string;
  emails?: Array<{ value: string; primary?: boolean }>;
  active: boolean;
  meta: {
    resourceType: 'User';
    created?: string;
    lastModified?: string;
    location?: string;
  };
}

/**
 * Inbound SCIM User body. Permissive (an index signature + optional fields) so
 * the global forbidNonWhitelisted ValidationPipe doesn't 400 on the many
 * attributes Okta/Entra send; the service validates what it needs.
 */
export interface ScimUserBody {
  schemas?: string[];
  externalId?: string;
  userName?: string;
  name?: { formatted?: string; givenName?: string; familyName?: string };
  displayName?: string;
  emails?: Array<{ value?: string; primary?: boolean; type?: string }>;
  active?: boolean;
  [key: string]: unknown;
}

/** A single RFC 7644 §3.5.2 PATCH operation. */
export interface ScimPatchOperation {
  op: string;
  path?: string;
  value?: unknown;
}

/** Inbound PATCH body. */
export interface ScimPatchBody {
  schemas?: string[];
  Operations?: ScimPatchOperation[];
  [key: string]: unknown;
}

/** RFC 7644 §3.4.2 ListResponse envelope. */
export function scimListResponse<T>(page: {
  resources: T[];
  totalResults: number;
  startIndex: number;
  itemsPerPage: number;
}): Record<string, unknown> {
  return {
    schemas: [SCIM_SCHEMAS.listResponse],
    totalResults: page.totalResults,
    startIndex: page.startIndex,
    itemsPerPage: page.itemsPerPage,
    Resources: page.resources,
  };
}

/** RFC 7644 §3.12 Error envelope. `scimType` is the detail keyword (e.g. uniqueness). */
export function scimError(
  status: number,
  detail: string,
  scimType?: string,
): Record<string, unknown> {
  return {
    schemas: [SCIM_SCHEMAS.error],
    status: String(status),
    detail,
    ...(scimType ? { scimType } : {}),
  };
}
