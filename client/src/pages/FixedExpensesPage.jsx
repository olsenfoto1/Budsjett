import { useEffect, useMemo, useState } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import { api } from '../api.js';
import { formatCurrency, formatDate, formatNotice } from '../utils/format.js';

ChartJS.register(ArcElement, Tooltip, Legend);

const CATEGORY_OPTIONS = ['Abonnement', 'Lån', 'Forsikring', 'Strøm', 'Annet'];
const LEVEL_OPTIONS = ['Må-ha', 'Kjekt å ha', 'Luksus'];

const emptyForm = {
  name: '',
  amountPerMonth: '',
  category: CATEGORY_OPTIONS[0],
  owners: '',
  level: LEVEL_OPTIONS[0],
  startDate: '',
  bindingEndDate: '',
  noticePeriodMonths: '',
  note: ''
};

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
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [simulatedExpense, setSimulatedExpense] = useState(null);

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

  const totalPerMonth = useMemo(
    () => expenses.reduce((sum, expense) => sum + (Number(expense.amountPerMonth) || 0), 0),
    [expenses]
  );

  const categoryTotals = useMemo(() => {
    const map = new Map();
    expenses.forEach((expense) => {
      const key = expense.category || 'Annet';
      map.set(key, (map.get(key) || 0) + (expense.amountPerMonth || 0));
    });
    return Array.from(map.entries())
      .map(([category, total]) => ({ category, total }))
      .sort((a, b) => b.total - a.total);
  }, [expenses]);

  const levelTotals = useMemo(() => {
    const map = new Map();
    expenses.forEach((expense) => {
      const key = expense.level || 'Må-ha';
      map.set(key, (map.get(key) || 0) + (expense.amountPerMonth || 0));
    });
    return LEVEL_OPTIONS.map((level) => ({ level, total: map.get(level) || 0 }));
  }, [expenses]);

  const bindingSoon = useMemo(() => {
    const now = Date.now();
    const ninetyDays = 90 * 24 * 60 * 60 * 1000;
    return expenses
      .filter((expense) => expense.bindingEndDate)
      .map((expense) => {
        const bindingTime = new Date(expense.bindingEndDate).getTime();
        const daysLeft = Math.ceil((bindingTime - now) / (1000 * 60 * 60 * 24));
        return { ...expense, daysLeft };
      })
      .filter((item) => item.daysLeft >= 0 && item.daysLeft <= 90)
      .sort((a, b) => new Date(a.bindingEndDate) - new Date(b.bindingEndDate));
  }, [expenses]);

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
    if (expense) {
      setEditingId(expense.id);
      setForm({
        name: expense.name,
        amountPerMonth: expense.amountPerMonth,
        category: expense.category,
        owners: (expense.owners || []).join(', '),
        level: expense.level,
        startDate: expense.startDate || '',
        bindingEndDate: expense.bindingEndDate || '',
        noticePeriodMonths: expense.noticePeriodMonths ?? '',
        note: expense.note || ''
      });
    } else {
      setEditingId(null);
      setForm(emptyForm);
    }
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setForm(emptyForm);
    setEditingId(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const payload = {
      name: form.name,
      amountPerMonth: Number(form.amountPerMonth),
      category: form.category,
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
        <h2>Faste utgifter</h2>
        <button onClick={() => handleOpenForm(null)}>Ny fast utgift</button>
      </div>
      {error && <p className="error-text">{error}</p>}

      <div className="card-grid">
        <div className="card">
          <h3>Totale faste kostnader per måned</h3>
          <p className="stat">{formatCurrency(totalPerMonth)}</p>
          <p className="muted">{expenses.length} aktive avtaler</p>
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
        <span>{expenses.length} rader</span>
      </div>
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Navn</th>
              <th>Beløp/mnd</th>
              <th>Kategori</th>
              <th>Eier</th>
              <th>Nivå</th>
              <th>Binding utløper</th>
              <th>Oppsigelsestid</th>
              <th>Notat</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {expenses.map((expense) => (
              <tr key={expense.id}>
                <td>
                  <div className="table-inline">
                    <strong>{expense.name}</strong>
                    {expense.startDate && (
                      <small className="muted subtle-label">Startet {formatDate(expense.startDate)}</small>
                    )}
                  </div>
                </td>
                <td>{formatCurrency(expense.amountPerMonth)}</td>
                <td>{expense.category}</td>
                <td>
                  {(expense.owners || []).length === 0 ? (
                    <span className="muted">-</span>
                  ) : (
                    <div className="chip-list">
                      {(expense.owners || []).map((owner) => (
                        <span className="chip" key={owner}>
                          {owner}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td>{expense.level}</td>
                <td>{formatDate(expense.bindingEndDate)}</td>
                <td>{formatNotice(expense.noticePeriodMonths)}</td>
                <td>{expense.note || '-'}</td>
                <td>
                  <div className="table-actions">
                    <button className="secondary" onClick={() => setSimulatedExpense(expense)}>
                      Simuler oppsigelse
                    </button>
                    <button className="secondary" onClick={() => handleOpenForm(expense)}>
                      Rediger
                    </button>
                    <button onClick={() => handleDelete(expense.id)}>Slett</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
              step="100"
              placeholder="Beløp per måned"
              value={form.amountPerMonth}
              onChange={(e) => setForm({ ...form, amountPerMonth: e.target.value })}
            />
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {CATEGORY_OPTIONS.map((option) => (
                <option value={option} key={option}>
                  {option}
                </option>
              ))}
            </select>
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
