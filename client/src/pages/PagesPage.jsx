import { useEffect, useState } from 'react';
import { api } from '../api.js';

const emptyPage = { name: '', description: '', color: '#059669', metadata: { type: 'custom' } };

const PagesPage = () => {
  const [pages, setPages] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [form, setForm] = useState(emptyPage);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const [pageData, txData] = await Promise.all([api.getPages(), api.getTransactions({})]);
      setPages(pageData);
      setTransactions(txData);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const reset = () => {
    setForm(emptyPage);
    setEditingId(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingId) {
        await api.updatePage(editingId, form);
      } else {
        await api.createPage(form);
      }
      reset();
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Slette side?')) return;
    await api.deletePage(id);
    load();
  };

  return (
    <div>
      <div className="section-header">
        <h2>{editingId ? 'Oppdater side' : 'Ny side'}</h2>
        {editingId && (
          <button className="secondary" onClick={reset}>
            Avbryt
          </button>
        )}
      </div>
      {error && <p style={{ color: '#dc2626' }}>{error}</p>}
      <form onSubmit={handleSubmit} className="card">
        <input
          required
          placeholder="Navn"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <textarea
          placeholder="Beskrivelse, f.eks aksjer eller lån"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
        <input
          type="color"
          value={form.color}
          onChange={(e) => setForm({ ...form, color: e.target.value })}
        />
        <input
          placeholder="Tag for siden (eks: aksjer)"
          value={form.metadata.tag || ''}
          onChange={(e) => setForm({ ...form, metadata: { ...form.metadata, tag: e.target.value } })}
        />
        <button type="submit">{editingId ? 'Oppdater' : 'Lagre'}</button>
      </form>

      <div className="section-header">
        <h2>Alle sider</h2>
        <span>{pages.length} stk</span>
      </div>
      <div className="card-grid">
        {pages.map((page) => (
          <div className="card" key={page.id} style={{ borderColor: page.color }}>
            <span className="badge" style={{ background: page.color, color: '#fff' }}>
              {page.metadata?.tag || 'Tilpasset'}
            </span>
            <h3>{page.name}</h3>
            <p>{page.description}</p>
            <p>
              Saldo:{' '}
              <strong style={{ color: page.balance >= 0 ? '#16a34a' : '#dc2626' }}>
                {page.balance.toLocaleString('no-NO', { style: 'currency', currency: 'NOK' })}
              </strong>
            </p>
            <p>{transactions.filter((tx) => tx.pageId === page.id).length} transaksjoner</p>
            <button
              className="secondary"
              onClick={() => {
                setForm({
                  name: page.name,
                  description: page.description,
                  color: page.color,
                  metadata: page.metadata || {}
                });
                setEditingId(page.id);
              }}
            >
              Endre
            </button>{' '}
            <button onClick={() => handleDelete(page.id)}>Slett</button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PagesPage;
