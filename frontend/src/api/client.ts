/**
 * FINSHIELD AI: Centralized Resilient API Client
 * Provides robust error handling, standard response shape, 401/403 interception,
 * and safe JSON parsing across all frontend network requests.
 */

export interface ApiResponse<T = any> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
  isForbidden?: boolean;
  isUnauthorized?: boolean;
}

class ApiClient {
  private getToken(): string | null {
    try {
      return localStorage.getItem('finshield_token');
    } catch {
      return null;
    }
  }

  public async request<T = any>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const token = this.getToken();
    const headers = new Headers(options.headers || {});

    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }

    const config: RequestInit = {
      ...options,
      headers
    };

    try {
      const response = await fetch(endpoint, config);

      let parsedData: any = null;
      const text = await response.text();
      if (text && text.trim().length > 0) {
        try {
          parsedData = JSON.parse(text);
        } catch {
          parsedData = { text };
        }
      }

      if (response.status === 401) {
        return {
          ok: false,
          status: 401,
          data: parsedData,
          error: parsedData?.message || 'Session expired or unauthenticated. Please log in again.',
          isUnauthorized: true
        };
      }

      if (response.status === 403) {
        return {
          ok: false,
          status: 403,
          data: parsedData,
          error: parsedData?.message || 'Access Denied: Insufficient permissions for this action.',
          isForbidden: true
        };
      }

      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          data: parsedData,
          error: parsedData?.message || `Request failed with HTTP status ${response.status}.`
        };
      }

      return {
        ok: true,
        status: response.status,
        data: parsedData as T,
        error: null
      };
    } catch (networkErr: any) {
      console.warn(`[API Client Network Error] ${endpoint}:`, networkErr?.message || networkErr);
      return {
        ok: false,
        status: 0,
        data: null,
        error: networkErr?.message || 'Unable to connect to the backend server. Please verify your connection.'
      };
    }
  }

  public get<T = any>(endpoint: string, options?: RequestInit): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  public post<T = any>(endpoint: string, body?: any, options?: RequestInit): Promise<ApiResponse<T>> {
    const isFormData = body instanceof FormData;
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: isFormData ? body : body ? JSON.stringify(body) : undefined
    });
  }

  public put<T = any>(endpoint: string, body?: any, options?: RequestInit): Promise<ApiResponse<T>> {
    const isFormData = body instanceof FormData;
    return this.request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: isFormData ? body : body ? JSON.stringify(body) : undefined
    });
  }

  public delete<T = any>(endpoint: string, options?: RequestInit): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }
}

export const api = new ApiClient();
export default api;
