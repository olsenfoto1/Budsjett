import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';

const emptyCategory = { name: '', type: 'expense', color: '#4f46e5', description: '' };
const paletteOptions = [
  { value: 'analogous', label: 'Analog' },
  { value: 'complementary', label: 'Komplementær' },
  { value: 'triadic', label: 'Triadisk' },
  { value: 'tetradic', label: 'Tetradisk' },
  { value: 'monochromatic', label: 'Monokrom' }
];

const hslToHex = (h, s, l) => {
  const hue = h / 360;
  const sat = s / 100;
  const lig = l / 100;
  const toChannel = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  const q = lig < 0.5 ? lig * (1 + sat) : lig + sat - lig * sat;
  const p = 2 * lig - q;

  const r = Math.round(toChannel(p, q, hue + 1 / 3) * 255);
  const g = Math.round(toChannel(p, q, hue) * 255);
  const b = Math.round(toChannel(p, q, hue - 1 / 3) * 255);

  const toHex = (x) => x.toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

const buildPalette = (count, type) => {
  if (count <= 0) return [];
  const baseHue = Math.floor(Math.random() * 360);
  const colors = [];
  const lightnessValues = count <= 4 ? [45, 52, 59, 66] : Array.from({ length: count }, (_, i) => 40 + (i * 40) / Math.max(count - 1, 1));
  const sat = 65;

  const huesByType = {
    analogous: (i) => baseHue + (i - (count - 1) / 2) * 20,
    complementary: (i) => baseHue + (i % 2 === 0 ? 0 : 180) + (Math.floor(i / 2) - (count - 2) / 4) * 25,
    triadic: (i) => baseHue + (i % 3) * 120 + Math.floor(i / 3) * 10,
    tetradic: (i) => baseHue + (i % 4) * 90 + Math.floor(i / 4) * 12,
    monochromatic: () => baseHue
  };

  for (let i = 0; i < count; i += 1) {
    const hueGenerator = huesByType[type] || huesByType.analogous;
    const hue = ((hueGenerator(i) % 360) + 360) % 360;
    const lightness = lightnessValues[i % lightnessValues.length];
    colors.push(hslToHex(hue, sat, lightness));
  }
  return colors;
};

const CategoriesPage = () => {
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState(emptyCategory);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [paletteType, setPaletteType] = useState('analogous');

  const paletteHint = useMemo(
    () => paletteOptions.find((option) => option.value === paletteType)?.label ?? 'Palett',
    [paletteType]
  );

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

  const applyPalette = async (typeOverride) => {
    if (!categories.length) return;
    const nextType = typeOverride || paletteType;
    const palette = buildPalette(categories.length, nextType);
    const updatedCategories = categories.map((category, index) => ({
      ...category,
      color: palette[index]
    }));

    setCategories(updatedCategories);
    if (editingId) {
      const edited = updatedCategories.find((cat) => cat.id === editingId);
      if (edited) setForm(edited);
    }

    try {
      await Promise.all(
        updatedCategories.map((category) => api.updateCategory(category.id, { ...category }))
      );
      setPaletteType(nextType);
    } catch (err) {
      setError(err.message);
    }
  };

  const applyRandomPalette = () => {
    const randomType = paletteOptions[Math.floor(Math.random() * paletteOptions.length)].value;
    applyPalette(randomType);
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

      <div className="section-header" style={{ marginTop: '1.5rem' }}>
        <h2>Fargepalett</h2>
        <span>{paletteHint}</span>
      </div>
      <div className="card" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          Palett
          <select value={paletteType} onChange={(e) => setPaletteType(e.target.value)}>
            {paletteOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <button className="secondary" onClick={() => applyPalette()} disabled={!categories.length}>
          Bruk på alle kategorier
        </button>
        <button onClick={applyRandomPalette} disabled={!categories.length}>
          Tilfeldig palett
        </button>
      </div>

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
