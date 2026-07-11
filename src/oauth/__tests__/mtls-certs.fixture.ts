/**
 * PUBLIC test X.509 certificates for RFC 8705 mTLS unit tests — NO private keys
 * (gitleaks-clean, and stored as TS to sidestep the repo-wide *.pem gitignore).
 *
 * Regenerate:
 *   openssl ecparam -name prime256v1 -genkey -noout -out ca.key
 *   openssl req -new -x509 -key ca.key -days 3650 \
 *     -subj "/C=US/O=INITE Test CA/CN=INITE Test Root" -out ca-cert.pem
 *   openssl ecparam -name prime256v1 -genkey -noout -out leaf.key
 *   openssl req -new -key leaf.key -subj "/C=US/O=INITE/CN=mtls-client.inite.ai" -out leaf.csr
 *   openssl x509 -req -in leaf.csr -CA ca-cert.pem -CAkey ca.key -CAcreateserial \
 *     -days 1825 -out leaf-cert.pem
 *   openssl ecparam -name prime256v1 -genkey -noout -out ss.key
 *   openssl req -new -x509 -key ss.key -days 1825 \
 *     -subj "/C=US/O=INITE/CN=selfsigned-client.inite.ai" -out selfsigned-cert.pem
 */

/** Trusted test root CA. */
export const CA_CERT_PEM = `-----BEGIN CERTIFICATE-----
MIIB0jCCAXmgAwIBAgIUPBPQVw5NjPtNDWp1ZkdXLQ3eRYIwCgYIKoZIzj0EAwIw
PzELMAkGA1UEBhMCVVMxFjAUBgNVBAoMDUlOSVRFIFRlc3QgQ0ExGDAWBgNVBAMM
D0lOSVRFIFRlc3QgUm9vdDAeFw0yNjA3MTEwMzQ3NTRaFw0zNjA3MDgwMzQ3NTRa
MD8xCzAJBgNVBAYTAlVTMRYwFAYDVQQKDA1JTklURSBUZXN0IENBMRgwFgYDVQQD
DA9JTklURSBUZXN0IFJvb3QwWTATBgcqhkjOPQIBBggqhkjOPQMBBwNCAAQQkSlx
R5WGN+/ECFiL1tJaT0NP4/5B1nO1Yu/V3nug4r4nFif8LbzKjLqFN2cpvAoxIcMU
nVIywFnCcM6u0hWlo1MwUTAdBgNVHQ4EFgQUnBHTt8CQ5fwccMndNg98NQeCg+4w
HwYDVR0jBBgwFoAUnBHTt8CQ5fwccMndNg98NQeCg+4wDwYDVR0TAQH/BAUwAwEB
/zAKBggqhkjOPQQDAgNHADBEAiBnci+UtUoVZkJychWt90ZjchECZS73H4bV0bau
nK5xwgIgOGuLEthvI1E1SIH3d1sMxkE+wUv42FU2dQ8MrIOmqH4=
-----END CERTIFICATE-----`;

/** Leaf certificate signed by CA_CERT_PEM (subject CN=mtls-client.inite.ai). */
export const LEAF_CERT_PEM = `-----BEGIN CERTIFICATE-----
MIIBvzCCAWWgAwIBAgIUDTjSquUbYEqhi2wAy65G+c136kIwCgYIKoZIzj0EAwIw
PzELMAkGA1UEBhMCVVMxFjAUBgNVBAoMDUlOSVRFIFRlc3QgQ0ExGDAWBgNVBAMM
D0lOSVRFIFRlc3QgUm9vdDAeFw0yNjA3MTEwMzQ3NTRaFw0zMTA3MTAwMzQ3NTRa
MDwxCzAJBgNVBAYTAlVTMQ4wDAYDVQQKDAVJTklURTEdMBsGA1UEAwwUbXRscy1j
bGllbnQuaW5pdGUuYWkwWTATBgcqhkjOPQIBBggqhkjOPQMBBwNCAASNTCWPKN7T
kB2/4p+8d5zBw+GPKevtKoFUoJ8tDoa+Coz5p4s5dUNnCfBIWBmzsA1I7gFgx6pO
zsqiWH72S9/so0IwQDAdBgNVHQ4EFgQUBuTQG0/SuAJYY3oCDexZEuBa8G0wHwYD
VR0jBBgwFoAUnBHTt8CQ5fwccMndNg98NQeCg+4wCgYIKoZIzj0EAwIDSAAwRQIg
UAt6aZ3WK2ry1h+vtfQQhW3c0fUP4UZ1XGJ/8754t1cCIQCihwv664g+KNBucxve
oXBg//mY8fbCazTqiRw0Z6wvzw==
-----END CERTIFICATE-----`;

/** Self-signed leaf (subject CN=selfsigned-client.inite.ai). */
export const SELF_SIGNED_CERT_PEM = `-----BEGIN CERTIFICATE-----
MIIB2DCCAX+gAwIBAgIUHLY1rDGGuZck006nWkmj+zlnHAIwCgYIKoZIzj0EAwIw
QjELMAkGA1UEBhMCVVMxDjAMBgNVBAoMBUlOSVRFMSMwIQYDVQQDDBpzZWxmc2ln
bmVkLWNsaWVudC5pbml0ZS5haTAeFw0yNjA3MTEwMzQ3NTRaFw0zMTA3MTAwMzQ3
NTRaMEIxCzAJBgNVBAYTAlVTMQ4wDAYDVQQKDAVJTklURTEjMCEGA1UEAwwac2Vs
ZnNpZ25lZC1jbGllbnQuaW5pdGUuYWkwWTATBgcqhkjOPQIBBggqhkjOPQMBBwNC
AATjRJ6SLRxRW/Mf2r54pOVOBmwgsk3uoI+z0gYnxJMsQbz9iHUgUmjwJ51Ayb6c
WfQY7Stke/W2dKwksEO8OEo1o1MwUTAdBgNVHQ4EFgQUTujfLszCqqZr1xTFmmWd
u0CWRsAwHwYDVR0jBBgwFoAUTujfLszCqqZr1xTFmmWdu0CWRsAwDwYDVR0TAQH/
BAUwAwEB/zAKBggqhkjOPQQDAgNHADBEAiAQTJ4lPQNjnaJrz5dCfFrp/3E/O8et
l6VpM+nZSHqTLwIgAhCZB7fGCoz6T4VqTV50f45A5ymD3S4LVy7RLxwwlng=
-----END CERTIFICATE-----`;
