#!/usr/bin/env bash
# Issue an RFC 8705 client certificate from the INITE Client CA.
#
#   sign:  issue-client-cert.sh sign <client.csr> <out.crt> [--subject "/O=Partner/CN=partner-app"]
#          Signs a CSR the client sent. The client keeps its private key; only
#          the CSR comes to us and only the certificate goes back.
#   new:   issue-client-cert.sh new "/O=INITE/CN=test-client" <out-dir>
#          For our own test clients: generates key + CSR in <out-dir>, then signs.
#
# The certificate: 1 year (DAYS overrides), EKU clientAuth only, not a CA.
# The subject DN on the certificate is what goes into the OAuth client's
# tlsClientAuthSubjectDn (printed at the end in RFC 4514 order).
#
# CA location: CA_DIR (default ~/.config/inite/mtls-ca with ca.key + ca.crt).
# The CA key never leaves the machine that runs this script.
set -euo pipefail

CA_DIR="${CA_DIR:-$HOME/.config/inite/mtls-ca}"
DAYS="${DAYS:-365}"
CA_KEY="$CA_DIR/ca.key"
CA_CRT="$CA_DIR/ca.crt"

die() { echo "error: $*" >&2; exit 1; }
[ -r "$CA_KEY" ] && [ -r "$CA_CRT" ] || die "CA not found in $CA_DIR (ca.key, ca.crt)"

sign() { # <csr> <out.crt> [subject override]
  local csr="$1" out="$2" subject="${3:-}"
  openssl req -in "$csr" -noout -verify 2>/dev/null || die "CSR signature does not verify: $csr"
  local ext; ext="$(mktemp)"
  trap 'rm -f "$ext"' RETURN
  cat >"$ext" <<'EXT'
basicConstraints = critical, CA:FALSE
keyUsage = critical, digitalSignature, keyEncipherment
extendedKeyUsage = clientAuth
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid, issuer
EXT
  local subj_args=()
  # x509 -req keeps the CSR's subject; -subj (OpenSSL 3) replaces it when the
  # operator decides the DN rather than the client.
  [ -n "$subject" ] && subj_args=(-subj "$subject")
  openssl x509 -req -in "$csr" -CA "$CA_CRT" -CAkey "$CA_KEY" \
    -set_serial "0x$(openssl rand -hex 16)" -days "$DAYS" -sha384 \
    -extfile "$ext" ${subj_args[@]+"${subj_args[@]}"} -out "$out" 2>/dev/null \
    || die "signing failed"
  openssl verify -CAfile "$CA_CRT" -purpose sslclient "$out" >/dev/null || die "issued cert does not verify"
  echo "issued: $out"
  openssl x509 -in "$out" -noout -serial -enddate
  echo "tlsClientAuthSubjectDn: $(openssl x509 -in "$out" -noout -subject -nameopt RFC2253 | sed 's/^subject=//')"
  echo "x5t#S256: $(openssl x509 -in "$out" -outform DER | openssl dgst -sha256 -binary | openssl base64 -A | tr '+/' '-_' | tr -d '=')"
}

case "${1:-}" in
  sign)
    [ $# -ge 3 ] || die "usage: $0 sign <client.csr> <out.crt> [--subject DN]"
    subject=""; [ "${4:-}" = "--subject" ] && subject="${5:?--subject needs a DN}"
    sign "$2" "$3" "$subject" ;;
  new)
    [ $# -eq 3 ] || die "usage: $0 new \"/O=INITE/CN=name\" <out-dir>"
    dir="$3"; mkdir -p "$dir"; chmod 700 "$dir"
    (umask 077; openssl ecparam -name prime256v1 -genkey -noout -out "$dir/client.key")
    openssl req -new -key "$dir/client.key" -subj "$2" -out "$dir/client.csr"
    sign "$dir/client.csr" "$dir/client.crt"
    echo "key: $dir/client.key (keep it with the client; never send it)" ;;
  *) die "usage: $0 sign <client.csr> <out.crt> [--subject DN] | new <subject> <out-dir>" ;;
esac
