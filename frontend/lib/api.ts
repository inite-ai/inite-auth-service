import axios from 'axios'

// Use relative paths - Traefik routes /auth/* and /oauth/* to backend
// This ensures cookies are first-party (same domain)
const API_URL = ''

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // CRITICAL: Send and receive cookies for SSO
})

export default api



