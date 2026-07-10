/**
 * A single RFC 9396 §2 `authorization_details` element.
 *
 * `type` is the only required member (a string that determines the semantics of
 * the rest). The commonly-registered fields are typed for convenience; any
 * type-specific members ride along via the index signature. This is the shape
 * persisted on the authorization code / refresh token and echoed as an
 * access-token claim.
 */
export interface AuthorizationDetail {
  type: string;
  locations?: string[];
  actions?: string[];
  datatypes?: string[];
  identifier?: string;
  privileges?: string[];
  [key: string]: unknown;
}
