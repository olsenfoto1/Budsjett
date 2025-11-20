import { useEffect, useState } from 'react';
import { api } from '../api.js';

const emptyCategory = { name: '', type: 'expense', color: '#4f46e5', description: '' };

const CategoriesPage = () => {
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState(emptyCategory);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const data = await api.getCategories();
      setCategories(data);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const reset = () => {
    setForm(emptyCategory);
    setEditingId(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingId) {
        await api.updateCategory(editingId, form);
      } else {
        await api.createCategory(form);
      }
      reset();
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Slette kategori?')) return;
    await api.deleteCategory(id);
    load();
  };

  return (
    <div>
      <div className="section-header">
        <h2>{editingId ? 'Oppdater kategori' : 'Ny kategori'}</h2>
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
        <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
          <option value="expense">Utgift</option>
          <option value="income">Inntekt</option>
        </select>
        <input
          type="color"
          value={form.color}
          onChange={(e) => setForm({ ...form, color: e.target.value })}
        />
        <textarea
          placeholder="Beskrivelse"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
        <button type="submit">{editingId ? 'Oppdater' : 'Lagre'}</button>
      </form>

      <div className="section-header">
        <h2>Kategorier</h2>
        <span>{categories.length} stk</span>
      </div>
      <div className="card-grid">
        {categories.map((category) => (
          <div className="card" key={category.id}>
            <span className="badge" style={{ background: category.color, color: '#fff' }}>
              {category.type === 'income' ? 'Inntekt' : 'Utgift'}
            </span>
            <h3>{category.name}</h3>
            <p>{category.description}</p>
            <button
              className="secondary"
              onClick={() => {
                setForm({ ...category });
                setEditingId(category.id);
              }}
            >
              Endre
            </button>{' '}
            <button onClick={() => handleDelete(category.id)}>Slett</button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CategoriesPage;
