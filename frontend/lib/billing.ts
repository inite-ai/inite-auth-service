import axios from 'axios'

/**
 * INITE billing, for what the account page shows from it (the INITE wallet).
 * Called with the person's own access token; billing reads who they are from
 * it, as every INITE service does.
 */
const BILLING_API_URL = process.env.NEXT_PUBLIC_BILLING_API_URL || 'https://billing.inite.ai'

export function billing(accessToken: string) {
  return axios.create({
    baseURL: `${BILLING_API_URL}/v1`,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
  })
}
