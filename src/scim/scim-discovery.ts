import { SCIM_SCHEMAS, scimListResponse } from './scim.contracts';

/**
 * RFC 7644 §4 discovery documents. Pure builders parameterised by the request
 * base URL so `meta.location` reflects the host the client actually reached.
 */

/** §4 ServiceProviderConfig — advertises which SCIM features we implement. */
export function serviceProviderConfig(baseUrl: string): Record<string, unknown> {
  return {
    schemas: [SCIM_SCHEMAS.serviceProviderConfig],
    documentationUri: `${baseUrl}/docs`,
    patch: { supported: true },
    bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
    filter: { supported: true, maxResults: 100 },
    changePassword: { supported: false },
    sort: { supported: false },
    etag: { supported: false },
    authenticationSchemes: [
      {
        type: 'oauthbearertoken',
        name: 'OAuth Bearer Token',
        description: 'Tenant-scoped client_credentials token with scim:read / scim:write.',
        primary: true,
      },
    ],
    meta: {
      resourceType: 'ServiceProviderConfig',
      location: `${baseUrl}/scim/v2/ServiceProviderConfig`,
    },
  };
}

/** §4 ResourceTypes — the resources (User, Group) this server exposes. */
export function resourceTypes(baseUrl: string): Record<string, unknown> {
  const types = [
    resourceType(baseUrl, { id: 'User', endpoint: '/Users', schema: SCIM_SCHEMAS.user }),
    resourceType(baseUrl, { id: 'Group', endpoint: '/Groups', schema: SCIM_SCHEMAS.group }),
  ];
  return scimListResponse({
    resources: types,
    totalResults: types.length,
    startIndex: 1,
    itemsPerPage: types.length,
  });
}

function resourceType(
  baseUrl: string,
  def: { id: string; endpoint: string; schema: string },
): Record<string, unknown> {
  return {
    schemas: [SCIM_SCHEMAS.resourceType],
    id: def.id,
    name: def.id,
    endpoint: def.endpoint,
    schema: def.schema,
    meta: {
      resourceType: 'ResourceType',
      location: `${baseUrl}/scim/v2/ResourceTypes/${def.id}`,
    },
  };
}

/** §4 Schemas — the attribute definitions for the User and Group resources. */
export function schemas(): Record<string, unknown> {
  const defs = [userSchema(), groupSchema()];
  return scimListResponse({
    resources: defs,
    totalResults: defs.length,
    startIndex: 1,
    itemsPerPage: defs.length,
  });
}

function attr(
  name: string,
  type: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    name,
    type,
    multiValued: false,
    required: false,
    caseExact: false,
    mutability: 'readWrite',
    returned: 'default',
    uniqueness: 'none',
    ...extra,
  };
}

function userSchema(): Record<string, unknown> {
  return {
    id: SCIM_SCHEMAS.user,
    name: 'User',
    description: 'SCIM core User',
    attributes: [
      attr('userName', 'string', { required: true, uniqueness: 'server' }),
      attr('externalId', 'string'),
      attr('displayName', 'string'),
      attr('active', 'boolean'),
      attr('name', 'complex'),
      attr('emails', 'complex', { multiValued: true }),
    ],
  };
}

function groupSchema(): Record<string, unknown> {
  return {
    id: SCIM_SCHEMAS.group,
    name: 'Group',
    description: 'SCIM core Group',
    attributes: [
      attr('displayName', 'string', { required: true }),
      attr('members', 'complex', { multiValued: true }),
    ],
  };
}
