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

const paletteStyleOptions = [
  { value: 'balanced', label: 'Balansert' },
  { value: 'vivid', label: 'Klar og sterk' },
  { value: 'pastel', label: 'Pastell' },
  { value: 'muted', label: 'Dempet' }
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

const paletteStyleConfig = {
  balanced: { saturation: 65, lightnessValues: [45, 52, 59, 66] },
  vivid: { saturation: 75, lightnessValues: [45, 50, 55, 60] },
  pastel: { saturation: 55, lightnessValues: [65, 70, 75, 80] },
  muted: { saturation: 50, lightnessValues: [35, 42, 49, 56] }
};

const buildPalette = (count, type, style) => {
  if (count <= 0) return [];
  const baseHue = Math.floor(Math.random() * 360);
  const colors = [];
  const styleConfig = paletteStyleConfig[style] || paletteStyleConfig.balanced;
  const lightnessValues =
    count <= styleConfig.lightnessValues.length
      ? styleConfig.lightnessValues
      : Array.from(
          { length: count },
          (_, i) =>
            Math.min(
              90,
              styleConfig.lightnessValues[0] +
                (i * (styleConfig.lightnessValues.at(-1) - styleConfig.lightnessValues[0])) /
                  Math.max(count - 1, 1)
            )
        );
  const sat = styleConfig.saturation;

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

const randomHexColor = () =>
  `#${Math.floor(Math.random() * 0xffffff)
    .toString(16)
    .padStart(6, '0')}`;

const CategoriesPage = () => {
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState(emptyCategory);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [paletteType, setPaletteType] = useState('analogous');
  const [paletteStyle, setPaletteStyle] = useState('balanced');

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

  const applyPalette = async (typeOverride, styleOverride) => {
    if (!categories.length) return;
    const nextType = typeOverride || paletteType;
    const nextStyle = styleOverride || paletteStyle;
    const palette = buildPalette(categories.length, nextType, nextStyle);
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
      setPaletteStyle(nextStyle);
    } catch (err) {
      setError(err.message);
    }
  };

  const applyRandomPalette = () => {
    const randomType = paletteOptions[Math.floor(Math.random() * paletteOptions.length)].value;
    applyPalette(randomType);
  };

  const applyRandomColors = async () => {
    if (!categories.length) return;
    const updatedCategories = categories.map((category) => ({
      ...category,
      color: randomHexColor()
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
    } catch (err) {
      setError(err.message);
    }
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
          <select
            value={paletteType}
            onChange={(e) => {
              setPaletteType(e.target.value);
              applyPalette(e.target.value);
            }}
            disabled={!categories.length}
          >
            {paletteOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          Fargestil
          <select
            value={paletteStyle}
            onChange={(e) => {
              setPaletteStyle(e.target.value);
              applyPalette(undefined, e.target.value);
            }}
            disabled={!categories.length}
          >
            {paletteStyleOptions.map((option) => (
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
        <button onClick={applyRandomColors} disabled={!categories.length}>
          Helt tilfeldige farger
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
