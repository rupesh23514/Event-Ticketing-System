const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000/api';

let TOKEN = localStorage.getItem('token') || null;
export const setToken = (t) => { TOKEN = t; if(!t) localStorage.removeItem('token'); else localStorage.setItem('token', t); }
export const getToken = () => TOKEN;

async function request(path, opts={}){
  const headers = { 'Content-Type': 'application/json', ...(opts.headers||{}) };
  if (TOKEN) headers['Authorization'] = 'Bearer ' + TOKEN;
  const res = await fetch(API_BASE + path, { ...opts, headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  if (!res.ok) throw new Error((await res.json()).message || 'Request failed');
  return res.json();
}

export const api = {
  get: (p) => request(p),
  post: (p, body) => request(p, { method:'POST', body }),
  put: (p, body) => request(p, { method:'PUT', body }),
  delete: (p) => request(p, { method:'DELETE' })
}
