/**
 * Standard API response wrappers
 * Ensures consistent response structure across all endpoints
 */

export interface SuccessResponse<T = any> {
  success: true;
  data: T;
  message?: string;
}

export interface ErrorResponse {
  success: false;
  error: string;
  message: string;
  statusCode: number;
}

// Helper functions to create consistent responses
export function success<T>(data: T, message?: string): SuccessResponse<T> {
  return {
    success: true,
    data,
    ...(message ? { message } : {}),
  };
}

export function successMessage(message: string): SuccessResponse<null> {
  return {
    success: true,
    data: null,
    message,
  };
}

// Auth-specific response types
export interface AuthResponse {
  access_token: string;
  user: {
    id: string;
    did: string;
    email: string;
    name?: string;
  };
}

export interface TokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token?: string;
  id_token?: string;
  scope?: string;
}



