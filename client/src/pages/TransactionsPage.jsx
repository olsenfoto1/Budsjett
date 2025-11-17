import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { formatOsloDateTime, fromDateTimeInputValue, nowDateTimeInputValue, toDateTimeInputValue } from '../utils/dates.js';

const createEmptyForm = () => ({
  title: '',
  amount: '',
  type: 'expense',
  categoryId: '',
  pageId: '',
  tags: '',
  occurredOn: nowDateTimeInputValue(),
  notes: ''
});

const FILTER_DEFAULTS = { type: '', categoryId: '', tag: '', pageId: '', search: '' };

const TransactionsPage = () => {
  const [transactions, setTransactions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [pages, setPages] = useState([]);
  const [form, setForm] = useState(createEmptyForm());
  const [editingId, setEditingId] = useState(null);
  const [filters, setFilters] = useState(() => ({ ...FILTER_DEFAULTS }));
  const [error, setError] = useState('');

  const fetchAll = async () => {
    try {
      const [txData, catData, pageData] = await Promise.all([
        api.getTransactions(filters),
        api.getCategories(),
        api.getPages()
      ]);
      setTransactions(txData);
      setCategories(catData);
      setPages(pageData);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(filters)]);

  const resetForm = () => {
    setForm(createEmptyForm());
    setEditingId(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      ...form,
      amount: Number(form.amount),
      categoryId: form.categoryId ? Number(form.categoryId) : null,
      pageId: form.pageId ? Number(form.pageId) : null,
      tags: form.tags ? form.tags.split(',').map((tag) => tag.trim()).filter(Boolean) : [],
      occurredOn: fromDateTimeInputValue(form.occurredOn)
    };
    try {
      if (editingId) {
        await api.updateTransaction(editingId, payload);
      } else {
        await api.createTransaction(payload);
      }
      resetForm();
      fetchAll();
    } catch (err) {
      setError(err.message);
    }
  };

  const startEdit = (tx) => {
    setEditingId(tx.id);
    setForm({
      title: tx.title,
      amount: tx.amount,
      type: tx.type,
      categoryId: tx.categoryId || '',
      pageId: tx.pageId || '',
      tags: (tx.tags || []).join(', '),
      occurredOn: toDateTimeInputValue(tx.occurredOn),
      notes: tx.notes || ''
    });
  };

  const handleDelete = async (id) => {
    if (!confirm('Slette transaksjon?')) return;
    try {
      await api.deleteTransaction(id);
      fetchAll();
    } catch (err) {
      setError(err.message);
    }
  };

  const totalByCategory = useMemo(() => {
    const map = {};
    transactions.forEach((tx) => {
      const key = tx.categoryName || 'Uten kategori';
      map[key] = (map[key] || 0) + (tx.type === 'expense' ? tx.amount : 0);
    });
    return map;
  }, [transactions]);

  const resetFilters = () => setFilters({ ...FILTER_DEFAULTS });

  return (
    <div className="transactions-page">
      <div className="transactions-layout">
        <section className="card transaction-form-card">
          <div className="panel-header">
            <div>
              <h2>{editingId ? 'Oppdater transaksjon' : 'Ny transaksjon'}</h2>
              <p className="muted">Legg inn utgifter og inntekter for å holde oversikt.</p>
            </div>
            {editingId && (
              <button type="button" onClick={resetForm} className="secondary">
                Avbryt
              </button>
            )}
          </div>
          {error && <p className="error-text">{error}</p>}
          <form onSubmit={handleSubmit}>
            <input
              required
              placeholder="Navn"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
            <div className="form-row">
              <input
                required
                type="number"
                step="0.01"
                placeholder="Beløp"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="expense">Utgift</option>
                <option value="income">Inntekt</option>
              </select>
            </div>
            <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
              <option value="">Kategori (valgfritt)</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            <input
              type="datetime-local"
              value={form.occurredOn}
              onChange={(e) => setForm({ ...form, occurredOn: e.target.value })}
            />
            <input
              placeholder="Tags (kommaseparert)"
              value={form.tags}
              onChange={(e) => setForm({ ...form, tags: e.target.value })}
            />
            <textarea
              placeholder="Notater"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
            <button type="submit">{editingId ? 'Oppdater' : 'Lagre'}</button>
          </form>
        </section>

        <section className="card transaction-filters-card">
          <div className="panel-header">
            <div>
              <h2>Filtre</h2>
              <p className="muted">Avgrens listen for å finne riktig transaksjon raskt.</p>
            </div>
            <button className="secondary" onClick={resetFilters} type="button">
              Nullstill
            </button>
          </div>
          <div className="filter-grid">
            <select value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })}>
              <option value="">Alle typer</option>
              <option value="expense">Utgift</option>
              <option value="income">Inntekt</option>
            </select>
            <select value={filters.categoryId} onChange={(e) => setFilters({ ...filters, categoryId: e.target.value })}>
              <option value="">Alle kategorier</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
            <select value={filters.pageId} onChange={(e) => setFilters({ ...filters, pageId: e.target.value })}>
              <option value="">Alle sider</option>
              {pages.map((page) => (
                <option key={page.id} value={page.id}>
                  {page.name}
                </option>
              ))}
            </select>
            <input
              placeholder="Tag"
              value={filters.tag}
              onChange={(e) => setFilters({ ...filters, tag: e.target.value })}
            />
            <input
              placeholder="Søk"
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            />
          </div>
        </section>
      </div>

      <section className="table-section">
        <div className="section-header compact">
          <h2>Transaksjoner</h2>
          <span className="muted">{transactions.length} rader</span>
        </div>
        <div className="table-wrapper">
          {transactions.length === 0 ? (
            <p className="muted">Ingen transaksjoner matcher filtrene dine ennå.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Dato</th>
                  <th>Navn</th>
                  <th>Kategori</th>
                  <th>Side</th>
                  <th>Beløp</th>
                  <th>Tags</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => (
                  <tr key={tx.id}>
                    <td>{formatOsloDateTime(tx.occurredOn)}</td>
                    <td>
                      <strong>{tx.title}</strong>
                      {tx.notes && (
                        <>
                          <br />
                          <small className="muted">{tx.notes}</small>
                        </>
                      )}
                    </td>
                    <td>{tx.categoryName || '-'}</td>
                    <td>{tx.pageName || '-'}</td>
                    <td style={{ color: tx.type === 'expense' ? '#dc2626' : '#16a34a' }}>
                      {tx.amount.toLocaleString('no-NO', { style: 'currency', currency: 'NOK' })}
                    </td>
                    <td>
                      {tx.tags?.map((tag) => (
                        <span className="tag" key={tag}>
                          {tag}
                        </span>
                      ))}
                    </td>
                    <td className="table-actions">
                      <button className="secondary" onClick={() => startEdit(tx)}>
                        Endre
                      </button>
                      <button onClick={() => handleDelete(tx.id)}>Slett</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <div className="section-header">
        <h2>Totalsummer per kategori</h2>
      </div>
      {Object.keys(totalByCategory).length === 0 ? (
        <div className="card">
          <p className="muted">Legg til transaksjoner for å se fordelingen per kategori.</p>
        </div>
      ) : (
        <div className="card-grid">
          {Object.entries(totalByCategory).map(([category, total]) => (
            <div className="card" key={category}>
              <h3>{category}</h3>
              <p className="stat">{total.toLocaleString('no-NO', { style: 'currency', currency: 'NOK' })}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TransactionsPage;
