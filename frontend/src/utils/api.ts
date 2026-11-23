/**
 * Resolves full API endpoint URL taking into account environment variables (VITE_API_URL).
 * If VITE_API_URL is set (e.g. on Vercel pointing to Render backend), prefixes relative URLs.
 * If unset (e.g. local Vite dev server), preserves relative path for Vite dev proxy.
 */
export function getApiUrl(endpoint: string): string {
  if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
    return endpoint;
  }
  const base = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
  const cleanPath = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${base}${cleanPath}`;
}
