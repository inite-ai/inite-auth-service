# Licensing

INITE Auth Service is **open-core**, dual-licensed.

## Open source — AGPL-3.0-or-later

The code in this repository is licensed under the **GNU Affero General Public
License v3.0 or later** (see [`LICENSE`](LICENSE)). You are free to use, study,
modify, and self-host it. Because this is a network service, the AGPL's §13
network clause applies:

> If you run a modified version of this software and let users interact with it
> over a network, you must make your modified source available to those users
> under AGPL-3.0.

For most teams self-hosting the identity provider inside their own perimeter,
AGPL is no obstacle — you're not redistributing or offering it as a service to
third parties.

## Commercial license

If AGPL-3.0 does not fit your situation, a commercial license is available. You
likely need it if you want to:

- Embed the service (or a derivative) in a **proprietary product** you
  distribute or offer as a SaaS, without disclosing your modifications.
- Avoid the AGPL §13 source-disclosure obligation for a hosted offering.
- Obtain a warranty, indemnification, or a support SLA.

The commercial license grants the same code under proprietary terms.

**Contact:** mike@inite.ai (subject: `auth-service commercial license`).

## Why open-core

We host the identity provider as a SaaS at `auth.inite.ai`. Open-sourcing the
core under AGPL keeps the implementation auditable — which matters more for an
auth service than almost anything else — while the commercial track funds
continued development and lets enterprises integrate without the network-clause
friction. This is the same model used by Ory and Zitadel.

## Contributions and the CLA

Because we offer a commercial license in addition to AGPL, we can only relicense
contributions if contributors grant us that right. We therefore require a
**Contributor License Agreement (CLA)** — a one-time sign-off that lets us ship
your contribution under both the AGPL and the commercial license while you
retain copyright to your work. See [`CONTRIBUTING.md`](CONTRIBUTING.md) §
License & CLA for details.

## The SDK is permissive

The client SDK under [`packages/sdk/`](packages/sdk/) is **MIT-licensed**, not
AGPL. It's meant to be embedded freely in any application — including
proprietary ones — with no copyleft obligation. Only the server is open-core.
