const API = '/api';

async function apiJson(path, options = {}) {
  const r = await fetch(API + path, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options
  });
  const text = await r.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text || r.statusText };
  }
  if (!r.ok) {
    const msg = (data && data.error) || r.statusText || 'Request failed';
    throw new Error(msg);
  }
  return data;
}

function apiUrl(path) {
  return API + path;
}
