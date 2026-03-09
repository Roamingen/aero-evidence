import { parseJsonResponse } from './http';
import { buildApiUrl } from './apiBase';

export async function authorizedJsonRequest(token, url, options = {}) {
  const response = await fetch(buildApiUrl(url), {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await parseJsonResponse(response);
  if (!response.ok) {
    throw new Error(data.message || '请求失败');
  }

  return data;
}