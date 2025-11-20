const API_BASE = import.meta.env.VITE_API_URL || '/api';

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    credentials: 'include',
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
  getTransactionById: (id) => request(`/transactions/${id}`),
  createTransaction: (payload) => request('/transactions', { method: 'POST', body: JSON.stringify(payload) }),
  updateTransaction: (id, payload) =>
    request(`/transactions/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteTransaction: (id) => request(`/transactions/${id}`, { method: 'DELETE' }),

  getFixedExpenses: () => request('/faste-utgifter'),
  createFixedExpense: (payload) => request('/faste-utgifter', { method: 'POST', body: JSON.stringify(payload) }),
  updateFixedExpense: (id, payload) => request(`/faste-utgifter/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteFixedExpense: (id) => request(`/faste-utgifter/${id}`, { method: 'DELETE' }),
  bulkAddOwnersToFixedExpenses: (owners) =>
    request('/faste-utgifter/bulk-owners', { method: 'POST', body: JSON.stringify({ owners }) }),
  resetFixedExpensePriceHistory: (id) =>
    request(`/faste-utgifter/${id}/reset-price-history`, { method: 'POST' }),

  getCategories: () => request('/categories'),
  createCategory: (payload) => request('/categories', { method: 'POST', body: JSON.stringify(payload) }),
  updateCategory: (id, payload) => request(`/categories/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteCategory: (id) => request(`/categories/${id}`, { method: 'DELETE' }),

  getPages: () => request('/pages'),
  createPage: (payload) => request('/pages', { method: 'POST', body: JSON.stringify(payload) }),
  updatePage: (id, payload) => request(`/pages/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deletePage: (id) => request(`/pages/${id}`, { method: 'DELETE' }),

  getSettings: () => request('/settings'),
  updateSettings: (payload) => request('/settings', { method: 'PUT', body: JSON.stringify(payload) }),
  renameOwner: (from, to) => request('/owners/rename', { method: 'POST', body: JSON.stringify({ from, to }) }),
  deleteOwner: (name) => request('/owners/delete', { method: 'POST', body: JSON.stringify({ name }) }),

  getLockStatus: () => request('/lock/status'),
  unlock: (password) => request('/lock/unlock', { method: 'POST', body: JSON.stringify({ password }) }),

  exportData: () => request('/export'),
  importData: (payload) => request('/import', { method: 'POST', body: JSON.stringify(payload) })
};
