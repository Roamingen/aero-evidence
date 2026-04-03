const configuredBaseUrl = String(import.meta.env.VITE_API_BASE_URL || '').trim();

// DEV 模式下不设置绝对地址，走相对路径由 vite proxy 转发
// 这样手机通过局域网 IP 访问时也能正常请求
export const API_BASE_URL = configuredBaseUrl || '';

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