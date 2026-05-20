import axios from 'axios'

// Backend mounted everything app-level under /v1 (URI versioning).
// Spec-pinned endpoints (.well-known/*, /health, /ready, /metrics)
// stay neutral — call those without baseURL when needed.
// Relative paths keep cookies first-party via the Traefik proxy.
const API_URL = '/v1'

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // CRITICAL: Send and receive cookies for SSO
})

export default api



