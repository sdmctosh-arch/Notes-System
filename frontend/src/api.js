async function request(path, options) {
  const res = await fetch(path, {
    headers: { 'content-type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.detail || `${res.status} ${res.statusText}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export const api = {
  listItems: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/api/items${qs ? `?${qs}` : ''}`);
  },
  getItem: (id) => request(`/api/items/${encodeURIComponent(id)}`),
  updateItem: (id, patch) =>
    request(`/api/items/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  moveItem: (id, action) =>
    request(`/api/items/${encodeURIComponent(id)}/move`, {
      method: 'POST',
      body: JSON.stringify({ action }),
    }),
};
