import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FAMILY_DOMAINS } from '../oauth/resource-registry';
import { type ClientManifest, manifestProblems } from './manifest';

/** Every manifest in `dir` (default: the repo's clients/), validated. Throws with every problem at once. */
export function loadManifests(dir = join(__dirname, '..', '..', 'clients')): ClientManifest[] {
  const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  const problems: string[] = [];
  const out: ClientManifest[] = [];
  for (const f of files) {
    let m: ClientManifest;
    try {
      m = JSON.parse(readFileSync(join(dir, f), 'utf8')) as ClientManifest;
    } catch (e) {
      problems.push(`${f}: not JSON (${(e as Error).message})`);
      continue;
    }
    problems.push(...manifestProblems(m, f, FAMILY_DOMAINS));
    out.push(m);
  }
  // Prefixes keep products' storefront orgs apart (Organization.slug is family-wide unique).
  const prefixes = new Map<string, string>();
  for (const m of out) {
    if (!m.customerLanePrefix) continue;
    const other = prefixes.get(m.customerLanePrefix);
    if (other) problems.push(`${m.clientId}.json: customerLanePrefix "${m.customerLanePrefix}" is already ${other}'s`);
    else prefixes.set(m.customerLanePrefix, m.clientId);
  }
  if (problems.length) throw new Error(`clients/ has problems:\n  ${problems.join('\n  ')}`);
  return out;
}
