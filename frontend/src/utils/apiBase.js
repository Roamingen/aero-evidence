const configuredBaseUrl = String(import.meta.env.VITE_API_BASE_URL || '').trim();

export const API_BASE_URL = configuredBaseUrl || (import.meta.env.DEV ? 'http://127.0.0.1:3000' : '');

export function buildApiUrl(path) {
  const normalizedPath = String(path || '').trim();
  if (!normalizedPath) {
    return API_BASE_URL || '';
  }

  if (/^https?:\/\//i.test(normalizedPath)) {
    return normalizedPath;
  }

  if (!API_BASE_URL) {
    return normalizedPath;
  }

  const baseUrl = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
  const requestPath = normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`;
  return `${baseUrl}${requestPath}`;
}