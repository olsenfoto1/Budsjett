const API_BASE = import.meta.env.VITE_API_URL || '/api';

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Ukjent feil');
  }
  if (response.status === 204) return null;
  return response.json();
}

export const api = {
  getSummary: () => request('/dashboard'),
  getTransactions: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/transactions${query ? `?${query}` : ''}`);
  },
  createTransaction: (payload) => request('/transactions', { method: 'POST', body: JSON.stringify(payload) }),
  updateTransaction: (id, payload) =>
    request(`/transactions/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteTransaction: (id) => request(`/transactions/${id}`, { method: 'DELETE' }),

  getCategories: () => request('/categories'),
  createCategory: (payload) => request('/categories', { method: 'POST', body: JSON.stringify(payload) }),
  updateCategory: (id, payload) => request(`/categories/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteCategory: (id) => request(`/categories/${id}`, { method: 'DELETE' }),

  getPages: () => request('/pages'),
  createPage: (payload) => request('/pages', { method: 'POST', body: JSON.stringify(payload) }),
  updatePage: (id, payload) => request(`/pages/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deletePage: (id) => request(`/pages/${id}`, { method: 'DELETE' }),

  exportData: () => request('/export'),
  importData: (payload) => request('/import', { method: 'POST', body: JSON.stringify(payload) })
};
