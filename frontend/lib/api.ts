import axios from 'axios'

// Use local API proxy for SSO (cookies will be first-party)
// In browser, use relative path to go through Next.js API routes
// On server, use direct API URL
const API_URL = typeof window !== 'undefined' 
  ? '/api'  // Browser: use Next.js API proxy
  : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002')

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // CRITICAL: Send and receive cookies for SSO
})

export default api



