import { validateDcrClientKeys } from '../dcr-jwks.util';

describe('validateDcrClientKeys', () => {
  it('accepts client_secret_post with no keys', () => {
    expect(() => validateDcrClientKeys({ method: 'client_secret_post', jwks: undefined, jwksUri: undefined })).not.toThrow();
  });

  it('rejects jwks and jwks_uri together', () => {
    expect(() => validateDcrClientKeys({ method: 'private_key_jwt', jwks: { keys: [] }, jwksUri: 'https://c/jwks' }))
      .toThrow(/mutually exclusive/);
  });

  it('requires a key source for private_key_jwt', () => {
    expect(() => validateDcrClientKeys({ method: 'private_key_jwt', jwks: undefined, jwksUri: undefined }))
      .toThrow(/private_key_jwt requires/);
  });

  it('accepts private_key_jwt with inline jwks', () => {
    expect(() => validateDcrClientKeys({ method: 'private_key_jwt', jwks: { keys: [] }, jwksUri: undefined })).not.toThrow();
  });

  it('rejects a non-https jwks_uri', () => {
    expect(() => validateDcrClientKeys({ method: 'private_key_jwt', jwks: undefined, jwksUri: 'http://c/jwks' }))
      .toThrow(/https/);
  });

  it('rejects a malformed jwks_uri', () => {
    expect(() => validateDcrClientKeys({ method: 'private_key_jwt', jwks: undefined, jwksUri: 'not a url' }))
      .toThrow(/valid URL/);
  });
});
