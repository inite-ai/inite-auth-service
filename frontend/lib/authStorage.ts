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
   * Get user ID
   */
  getUserId(): string | null {
    return localStorage.getItem(USER_ID_KEY)
  },

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return !!this.getToken()
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

