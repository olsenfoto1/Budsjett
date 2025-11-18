import { useCallback, useEffect, useMemo, useState } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import { api } from '../api.js';
import { formatCurrency, formatDate, formatNotice } from '../utils/format.js';

ChartJS.register(ArcElement, Tooltip, Legend);

const FALLBACK_CATEGORY_OPTIONS = ['Abonnementer', 'Lån', 'Forsikring', 'Strøm', 'Annet'];
const LEVEL_OPTIONS = ['Må-ha', 'Kjekt å ha', 'Luksus'];

const createEmptyForm = (category = FALLBACK_CATEGORY_OPTIONS[0]) => ({
  name: '',
  amountPerMonth: '',
  category,
  owners: '',
  level: LEVEL_OPTIONS[0],
  startDate: '',
  bindingEndDate: '',
  noticePeriodMonths: '',
  note: ''
});

const Modal = ({ children, onClose }) => (
  <div className="modal-overlay" role="dialog" aria-modal="true">
    <div className="modal-card">
      <button type="button" className="secondary close-button" onClick={onClose}>
        Lukk
      </button>
      {children}
    </div>
  </div>
);

const FixedExpensesPage = () => {
  const [expenses, setExpenses] = useState([]);
  const [form, setForm] = useState(() => createEmptyForm());
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [simulatedExpense, setSimulatedExpense] = useState(null);
  const [selectedOwner, setSelectedOwner] = useState(null);
  const [categoryOptions, setCategoryOptions] = useState(FALLBACK_CATEGORY_OPTIONS);
  const [categoryError, setCategoryError] = useState('');
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);
  const [bulkOwnersInput, setBulkOwnersInput] = useState('');
  const [bulkOwnersError, setBulkOwnersError] = useState('');
  const [bulkOwnersSuccess, setBulkOwnersSuccess] = useState('');
  const [isBulkUpdatingOwners, setIsBulkUpdatingOwners] = useState(false);
  const availableCategories = useMemo(() => {
    if (!form.category || categoryOptions.includes(form.category)) {
      return categoryOptions;
    }
    return [form.category, ...categoryOptions];
  }, [categoryOptions, form.category]);

  const fetchExpenses = async () => {
    try {
      const data = await api.getFixedExpenses();
      setExpenses(data.sort((a, b) => (b.amountPerMonth || 0) - (a.amountPerMonth || 0)));
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    fetchExpenses();
  }, []);

  const loadCategories = useCallback(async () => {
    setIsLoadingCategories(true);
    setCategoryError('');
    try {
      const categories = await api.getCategories();
      const expenseCategories = categories
        .filter((category) => category.type !== 'income')
        .map((category) => category.name);
      if (expenseCategories.length) {
        setCategoryOptions(expenseCategories);
      } else {
        setCategoryOptions(FALLBACK_CATEGORY_OPTIONS);
      }
    } catch (err) {
      console.error('Kunne ikke hente kategorier', err);
      setCategoryError('Kunne ikke hente oppdaterte kategorier. Viser standardvalg.');
      setCategoryOptions((current) => (current.length ? current : FALLBACK_CATEGORY_OPTIONS));
    } finally {
      setIsLoadingCategories(false);
    }
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const filteredExpenses = useMemo(() => {
    if (!selectedOwner) return expenses;
    return expenses.filter((expense) => (expense.owners || []).includes(selectedOwner));
  }, [expenses, selectedOwner]);

  const totalPerMonth = useMemo(
    () => filteredExpenses.reduce((sum, expense) => sum + (Number(expense.amountPerMonth) || 0), 0),
    [filteredExpenses]
  );

  const categoryTotals = useMemo(() => {
    const map = new Map();
    filteredExpenses.forEach((expense) => {
      const key = expense.category || 'Annet';
      map.set(key, (map.get(key) || 0) + (expense.amountPerMonth || 0));
    });
    return Array.from(map.entries())
      .map(([category, total]) => ({ category, total }))
      .sort((a, b) => b.total - a.total);
  }, [filteredExpenses]);

  const levelTotals = useMemo(() => {
    const map = new Map();
    filteredExpenses.forEach((expense) => {
      const key = expense.level || 'Må-ha';
      map.set(key, (map.get(key) || 0) + (expense.amountPerMonth || 0));
    });
    return LEVEL_OPTIONS.map((level) => ({ level, total: map.get(level) || 0 }));
  }, [filteredExpenses]);

  const groupedExpenses = useMemo(() => {
    if (!filteredExpenses.length) return [];
    const map = new Map();
    filteredExpenses.forEach((expense) => {
      const key = expense.category || 'Annet';
      const existing = map.get(key) || [];
      existing.push(expense);
      map.set(key, existing);
    });
    return Array.from(map.entries())
      .map(([category, items]) => ({
        category,
        items: items.sort((a, b) => (b.amountPerMonth || 0) - (a.amountPerMonth || 0)),
        total: items.reduce((sum, item) => sum + (Number(item.amountPerMonth) || 0), 0)
      }))
      .sort((a, b) => b.total - a.total);
  }, [filteredExpenses]);

  const bindingSoon = useMemo(() => {
    const now = Date.now();
    return filteredExpenses
      .filter((expense) => expense.bindingEndDate)
      .map((expense) => {
        const bindingTime = new Date(expense.bindingEndDate).getTime();
        const daysLeft = Math.ceil((bindingTime - now) / (1000 * 60 * 60 * 24));
        return { ...expense, daysLeft };
      })
      .filter((item) => item.daysLeft >= 0 && item.daysLeft <= 90)
      .sort((a, b) => new Date(a.bindingEndDate) - new Date(b.bindingEndDate));
  }, [filteredExpenses]);

  const doughnutData = useMemo(() => {
    if (!categoryTotals.length) {
      return null;
    }
    return {
      labels: categoryTotals.map((item) => item.category),
      datasets: [
        {
          data: categoryTotals.map((item) => item.total),
          backgroundColor: ['#6366f1', '#f97316', '#14b8a6', '#facc15', '#94a3b8']
        }
      ]
    };
  }, [categoryTotals]);

  const handleOpenForm = (expense) => {
    // Hent alltid siste kategorier når skjemaet åpnes
    loadCategories();
    if (expense) {
      setEditingId(expense.id);
      setForm({
        name: expense.name,
        amountPerMonth: expense.amountPerMonth,
        category: expense.category || categoryOptions[0] || FALLBACK_CATEGORY_OPTIONS[0],
        owners: (expense.owners || []).join(', '),
        level: expense.level,
        startDate: expense.startDate || '',
        bindingEndDate: expense.bindingEndDate || '',
        noticePeriodMonths: expense.noticePeriodMonths ?? '',
        note: expense.note || ''
      });
    } else {
      setEditingId(null);
      setForm(createEmptyForm(categoryOptions[0] || FALLBACK_CATEGORY_OPTIONS[0]));
    }
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setForm(createEmptyForm(categoryOptions[0] || FALLBACK_CATEGORY_OPTIONS[0]));
    setEditingId(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const normalizedCategory = categoryOptions.includes(form.category)
      ? form.category
      : categoryOptions[0] || FALLBACK_CATEGORY_OPTIONS[0];
    const payload = {
      name: form.name,
      amountPerMonth: Number(form.amountPerMonth),
      category: normalizedCategory,
      owners: form.owners
        ? form.owners
            .split(',')
            .map((owner) => owner.trim())
            .filter(Boolean)
        : [],
      level: form.level,
      startDate: form.startDate || '',
      bindingEndDate: form.bindingEndDate || '',
      noticePeriodMonths: form.noticePeriodMonths === '' ? null : Number(form.noticePeriodMonths),
      note: form.note
    };
    try {
      if (editingId) {
        await api.updateFixedExpense(editingId, payload);
      } else {
        await api.createFixedExpense(payload);
      }
      closeForm();
      fetchExpenses();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Slette denne faste utgiften?')) return;
    try {
      await api.deleteFixedExpense(id);
      fetchExpenses();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleBulkAddOwners = async (event) => {
    event.preventDefault();
    setBulkOwnersSuccess('');
    const trimmedValue = bulkOwnersInput.trim();
    if (!trimmedValue) {
      setBulkOwnersError('Skriv inn minst én eier.');
      return;
    }

    try {
      setIsBulkUpdatingOwners(true);
      setBulkOwnersError('');
      await api.bulkAddOwnersToFixedExpenses(trimmedValue);
      setBulkOwnersSuccess('Eier(e) lagt til');
      setBulkOwnersInput('');
      fetchExpenses();
    } catch (err) {
      setBulkOwnersError(err.message);
    } finally {
      setIsBulkUpdatingOwners(false);
    }
  };

  const simulation = useMemo(() => {
    if (!simulatedExpense) return null;
    const newTotal = totalPerMonth - (simulatedExpense.amountPerMonth || 0);
    const savedMonthly = simulatedExpense.amountPerMonth || 0;
    return {
      current: totalPerMonth,
      newTotal,
      savedMonthly,
      savedYearly: savedMonthly * 12
    };
  }, [simulatedExpense, totalPerMonth]);

  const luxuryTotal = levelTotals.find((item) => item.level === 'Luksus')?.total || 0;

  return (
    <div>
      <div className="section-header">
          <div>
            <h2>Faste utgifter</h2>
            {selectedOwner && (
              <div className="filter-indicator">
                <span className="badge">Filtrert på {selectedOwner}</span>
              </div>
            )}
          </div>
          <div className="section-actions">
            {selectedOwner && (
              <button className="secondary" onClick={() => setSelectedOwner(null)}>
                Fjern filter
              </button>
            )}
            <button onClick={() => handleOpenForm(null)}>Ny fast utgift</button>
          </div>
        </div>
        {error && <p className="error-text">{error}</p>}

      <div className="card-grid">
        <div className="card">
          <h3>Totale faste kostnader per måned</h3>
          <p className="stat">{formatCurrency(totalPerMonth)}</p>
          <p className="muted">
            {filteredExpenses.length} aktive avtaler
            {selectedOwner && ` (av ${expenses.length})`}
          </p>
        </div>
        <div className="card">
          <h3>Sum per kategori</h3>
          <div className="pill-list">
            {categoryTotals.length === 0 && <p className="muted">Ingen registrerte utgifter ennå.</p>}
            {categoryTotals.map((item) => (
              <div key={item.category} className="pill-row">
                <span>{item.category}</span>
                <strong>{formatCurrency(item.total)}</strong>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <h3>Binding utløper snart</h3>
          {bindingSoon.length === 0 && <p className="muted">Ingen bindinger de neste 90 dagene.</p>}
          {bindingSoon.map((item) => (
            <div key={item.id} className="pill-row">
              <span>
                <strong>{item.name}</strong>
                <br />
                <small>{formatDate(item.bindingEndDate)}</small>
              </span>
              <div style={{ textAlign: 'right' }}>
                <span className="badge">{item.daysLeft} dager</span>
                <p style={{ margin: '0.2rem 0 0' }}>{formatCurrency(item.amountPerMonth)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <div className="section-header" style={{ marginTop: 0 }}>
          <h2>Fordeling per kategori</h2>
          {doughnutData && <span className="badge">{categoryTotals.length} kategorier</span>}
        </div>
        {doughnutData ? (
          <div className="chart-wrapper">
            <Doughnut
              data={doughnutData}
              options={{
                plugins: { legend: { position: 'bottom' } },
                cutout: '65%'
              }}
            />
          </div>
        ) : (
          <p className="muted">Legg inn utgifter for å se grafen.</p>
        )}
      </div>

      <div className="card analysis-card">
        <h3>Må-ha / Kjekt å ha / Luksus</h3>
        <div className="analysis-grid">
          {levelTotals.map((item) => (
            <div key={item.level} className="analysis-item">
              <span className="muted">{item.level}</span>
              <strong>{formatCurrency(item.total)}</strong>
            </div>
          ))}
        </div>
        <p className="muted">
          Hvis dere sier opp alle «Luksus»-utgifter sparer dere {formatCurrency(luxuryTotal)} per måned og{' '}
          {formatCurrency(luxuryTotal * 12)} per år.
        </p>
      </div>

      <div className="section-header">
        <h2>Alle faste utgifter</h2>
        <span>
          {filteredExpenses.length} avtaler
          {selectedOwner && ` (av ${expenses.length})`}
        </span>
      </div>
      <div className="category-sections">
        {groupedExpenses.length === 0 && <p className="muted">Ingen registrerte utgifter ennå.</p>}
        {groupedExpenses.map((group) => (
          <section className="category-section" key={group.category}>
            <div className="category-section-header">
              <div>
                <h3>{group.category}</h3>
                <p className="muted">{group.items.length} avtaler</p>
              </div>
              <div className="category-total">
                <span className="muted">Sum</span>
                <strong>{formatCurrency(group.total)}</strong>
              </div>
            </div>
            <div className="category-expense-list">
              {group.items.map((expense) => (
                <article className="expense-entry" key={expense.id}>
                  <div className="expense-entry-main">
                    <div>
                      <p className="expense-name">{expense.name}</p>
                      {expense.startDate && (
                        <small className="muted subtle-label">Startet {formatDate(expense.startDate)}</small>
                      )}
                      <div className="expense-meta">
                        <span className="badge">{expense.level}</span>
                        <span className="muted">Binding: {formatDate(expense.bindingEndDate)}</span>
                        <span className="muted">Oppsigelse: {formatNotice(expense.noticePeriodMonths)}</span>
                      </div>
                      <div className="expense-owners">
                        {(expense.owners || []).length === 0 ? (
                          <span className="muted">Ingen eiere</span>
                        ) : (
                          <div className="chip-list">
                            {(expense.owners || []).map((owner) => (
                              <button
                                type="button"
                                className={`chip chip-button${selectedOwner === owner ? ' chip-active' : ''}`}
                                key={owner}
                                onClick={() =>
                                  setSelectedOwner((current) => (current === owner ? null : owner))
                                }
                              >
                                {owner}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      {expense.note && <p className="expense-note">{expense.note}</p>}
                    </div>
                    <div className="expense-amount">
                      <span className="muted">Per måned</span>
                      <strong>{formatCurrency(expense.amountPerMonth)}</strong>
                    </div>
                  </div>
                  <div className="expense-actions">
                    <button className="secondary" onClick={() => setSimulatedExpense(expense)}>
                      Simuler oppsigelse
                    </button>
                    <button className="secondary" onClick={() => handleOpenForm(expense)}>
                      Rediger
                    </button>
                    <button onClick={() => handleDelete(expense.id)}>Slett</button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="card" style={{ marginTop: '2rem' }}>
        <div className="section-header" style={{ marginTop: 0 }}>
          <div>
            <h2>Legg til eier på alle faste utgifter</h2>
            <p className="muted">Skriv inn navn separert med komma for å legge dem til på alle utgifter.</p>
          </div>
          {bulkOwnersSuccess && <span className="badge">{bulkOwnersSuccess}</span>}
        </div>
        <form className="inline-form" onSubmit={handleBulkAddOwners}>
          <label htmlFor="bulk-owners-input">Eier(e)</label>
          <input
            id="bulk-owners-input"
            placeholder="F.eks. Ola, Kari"
            value={bulkOwnersInput}
            onChange={(e) => {
              setBulkOwnersInput(e.target.value);
              if (bulkOwnersError) setBulkOwnersError('');
              if (bulkOwnersSuccess) setBulkOwnersSuccess('');
            }}
          />
          <button type="submit" disabled={isBulkUpdatingOwners}>
            {isBulkUpdatingOwners ? 'Oppdaterer…' : 'Legg til på alle'}
          </button>
        </form>
        {bulkOwnersError && <p className="error-text">{bulkOwnersError}</p>}
      </div>

      {showForm && (
        <Modal onClose={closeForm}>
          <h3>{editingId ? 'Oppdater fast utgift' : 'Ny fast utgift'}</h3>
          <form onSubmit={handleSubmit} className="stacked-form">
            <input
              required
              placeholder="Navn"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <input
              required
              type="number"
              min="0"
              step="1"
              placeholder="Beløp per måned"
              value={form.amountPerMonth}
              onChange={(e) => setForm({ ...form, amountPerMonth: e.target.value })}
            />
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              disabled={isLoadingCategories && !categoryOptions.length}
            >
              {availableCategories.map((option) => (
                <option value={option} key={option}>
                  {option}
                </option>
              ))}
            </select>
            {categoryError && <p className="error-text">{categoryError}</p>}
            <select value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })}>
              {LEVEL_OPTIONS.map((option) => (
                <option value={option} key={option}>
                  {option}
                </option>
              ))}
            </select>
            <input
              placeholder="Eiere (kommaseparert)"
              value={form.owners}
              onChange={(e) => setForm({ ...form, owners: e.target.value })}
            />
            <label className="muted">Startdato</label>
            <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            <label className="muted">Binding utløper</label>
            <input
              type="date"
              value={form.bindingEndDate}
              onChange={(e) => setForm({ ...form, bindingEndDate: e.target.value })}
            />
            <input
              type="number"
              min="0"
              placeholder="Oppsigelsestid (mnd)"
              value={form.noticePeriodMonths}
              onChange={(e) => setForm({ ...form, noticePeriodMonths: e.target.value })}
            />
            <textarea
              placeholder="Notat"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />
            <div className="form-actions">
              <button type="button" className="secondary" onClick={closeForm}>
                Avbryt
              </button>
              <button type="submit">{editingId ? 'Oppdater' : 'Lagre'}</button>
            </div>
          </form>
        </Modal>
      )}

      {simulation && (
        <Modal onClose={() => setSimulatedExpense(null)}>
          <h3>Simuler oppsigelse</h3>
          <p>
            <strong>{simulatedExpense.name}</strong>
          </p>
          <div className="analysis-grid">
            <div>
              <span className="muted">Nåværende total</span>
              <strong>{formatCurrency(simulation.current)}</strong>
            </div>
            <div>
              <span className="muted">Ny total</span>
              <strong>{formatCurrency(simulation.newTotal)}</strong>
            </div>
            <div>
              <span className="muted">Spart per måned</span>
              <strong>{formatCurrency(simulation.savedMonthly)}</strong>
            </div>
            <div>
              <span className="muted">Spart per år</span>
              <strong>{formatCurrency(simulation.savedYearly)}</strong>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default FixedExpensesPage;
