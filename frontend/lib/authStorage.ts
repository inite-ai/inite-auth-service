/**
 * Centralized auth storage utilities
 * Single source of truth for token management
 */

const TOKEN_KEY = 'inite_access_token'
const USER_ID_KEY = 'inite_user_id'
const LEGACY_TOKEN_KEY = 'access_token' // backward compatibility

export interface AuthData {
  accessToken: string
  userId?: string
}

/**
 * Parse JWT payload without verification
 */
function parseJwtPayload(token: string): { exp?: number; [key: string]: unknown } | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const payload = JSON.parse(atob(parts[1]))
    return payload
  } catch {
    return null
  }
}

/**
 * Check if JWT token is expired (with 60 second buffer)
 */
function isTokenExpired(token: string): boolean {
  const payload = parseJwtPayload(token)
  if (!payload?.exp) return true
  
  // Add 60 second buffer before expiration
  const expiresAt = payload.exp * 1000
  const now = Date.now()
  const buffer = 60 * 1000 // 1 minute
  
  return now >= (expiresAt - buffer)
}

export const authStorage = {
  /**
   * Save authentication data to localStorage
   */
  save(data: AuthData): void {
    localStorage.setItem(TOKEN_KEY, data.accessToken)
    if (data.userId) {
      localStorage.setItem(USER_ID_KEY, data.userId)
    }
  },

  /**
   * Get access token (checks both new and legacy keys)
   */
  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY) || localStorage.getItem(LEGACY_TOKEN_KEY)
  },

  /**
   * Get valid (non-expired) access token
   * Returns null if token is expired or doesn't exist
   */
  getValidToken(): string | null {
    const token = this.getToken()
    if (!token) return null
    
    if (isTokenExpired(token)) {
      // Token is expired, clear it
      this.clear()
      return null
    }
    
    return token
  },

  /**
   * Get user ID
   */
  getUserId(): string | null {
    return localStorage.getItem(USER_ID_KEY)
  },

  /**
   * Check if user is authenticated (has valid non-expired token)
   */
  isAuthenticated(): boolean {
    return !!this.getValidToken()
  },

  /**
   * Check if token exists but is expired
   */
  hasExpiredToken(): boolean {
    const token = this.getToken()
    if (!token) return false
    return isTokenExpired(token)
  },

  /**
   * Clear all auth data
   */
  clear(): void {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_ID_KEY)
    localStorage.removeItem(LEGACY_TOKEN_KEY)
  },
}

