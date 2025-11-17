import { useEffect, useMemo, useState } from 'react';
import { formatCurrency, formatDate } from '../utils/format.js';
import { loadSavingsGoals, saveSavingsGoals, summarizeSavingsGoals } from '../utils/savings.js';

const createEmptyGoal = () => ({
  title: '',
  targetAmount: '',
  savedAmount: '',
  monthlyContribution: '',
  dueDate: '',
  owner: '',
  motivation: ''
});

const createId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return String(Date.now());
};

const SavingsGoalsPage = () => {
  const [goals, setGoals] = useState(() => loadSavingsGoals());
  const [form, setForm] = useState(createEmptyGoal());
  const [editingId, setEditingId] = useState(null);
  const [contributionValues, setContributionValues] = useState({});
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    saveSavingsGoals(goals);
  }, [goals]);

  const stats = useMemo(() => {
    const summary = summarizeSavingsGoals(goals);
    const totalMonthly = goals.reduce((sum, goal) => sum + (Number(goal.monthlyContribution) || 0), 0);
    return {
      ...summary,
      totalMonthly
    };
  }, [goals]);

  const filteredGoals = useMemo(() => {
    if (filter === 'active') {
      return goals.filter((goal) => Number(goal.savedAmount) < Number(goal.targetAmount));
    }
    if (filter === 'completed') {
      return goals.filter((goal) => goal.targetAmount && Number(goal.savedAmount) >= Number(goal.targetAmount));
    }
    return goals;
  }, [filter, goals]);

  const resetForm = () => {
    setForm(createEmptyGoal());
    setEditingId(null);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const payload = {
      id: editingId ?? createId(),
      title: form.title.trim() || 'Nytt mål',
      targetAmount: Number(form.targetAmount) || 0,
      savedAmount: Math.min(Number(form.targetAmount) || 0, Number(form.savedAmount) || 0),
      monthlyContribution: Number(form.monthlyContribution) || 0,
      dueDate: form.dueDate,
      owner: form.owner.trim(),
      motivation: form.motivation.trim()
    };

    setGoals((prev) => {
      if (editingId) {
        return prev.map((goal) => (goal.id === editingId ? payload : goal));
      }
      return [...prev, payload];
    });
    resetForm();
  };

  const startEdit = (goal) => {
    setEditingId(goal.id);
    setForm({
      title: goal.title,
      targetAmount: goal.targetAmount?.toString() ?? '',
      savedAmount: goal.savedAmount?.toString() ?? '',
      monthlyContribution: goal.monthlyContribution?.toString() ?? '',
      dueDate: goal.dueDate || '',
      owner: goal.owner || '',
      motivation: goal.motivation || ''
    });
  };

  const handleContribution = (goalId) => {
    const amount = Number(contributionValues[goalId]);
    if (!amount || amount <= 0) return;
    setGoals((prev) =>
      prev.map((goal) => {
        if (goal.id !== goalId) return goal;
        const target = Number(goal.targetAmount) || 0;
        const updated = Math.min(target, (Number(goal.savedAmount) || 0) + amount);
        return { ...goal, savedAmount: updated };
      })
    );
    setContributionValues((prev) => ({ ...prev, [goalId]: '' }));
  };

  const handleDelete = (goalId) => {
    if (!window.confirm('Slette sparemål?')) return;
    setGoals((prev) => prev.filter((goal) => goal.id !== goalId));
  };

  const formatProgress = (goal) => {
    const target = Number(goal.targetAmount) || 0;
    if (target === 0) return 0;
    return Math.min(100, Math.round(((Number(goal.savedAmount) || 0) / target) * 100));
  };

  return (
    <div className="savings-page">
      <div className="section-header">
        <h2>Sparemål</h2>
        {goals.length > 0 && <span>{goals.length} mål</span>}
      </div>

      <div className="savings-layout">
        <section className="card savings-form-card">
          <div className="panel-header">
            <div>
              <h3>{editingId ? 'Oppdater sparemål' : 'Nytt sparemål'}</h3>
              <p className="muted">Lag konkrete mål for å holde motivasjonen oppe.</p>
            </div>
            {editingId && (
              <button type="button" className="secondary" onClick={resetForm}>
                Nullstill
              </button>
            )}
          </div>
          <form onSubmit={handleSubmit}>
            <input
              required
              placeholder="Navn på mål"
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
            />
            <div className="form-row">
              <input
                required
                type="number"
                min="0"
                step="100"
                placeholder="Målbeløp (kr)"
                value={form.targetAmount}
                onChange={(event) => setForm({ ...form, targetAmount: event.target.value })}
              />
              <input
                type="number"
                min="0"
                step="100"
                placeholder="Allerede spart (kr)"
                value={form.savedAmount}
                onChange={(event) => setForm({ ...form, savedAmount: event.target.value })}
              />
            </div>
            <input
              type="number"
              min="0"
              step="100"
              placeholder="Planlagt sparing per måned"
              value={form.monthlyContribution}
              onChange={(event) => setForm({ ...form, monthlyContribution: event.target.value })}
            />
            <input
              type="date"
              value={form.dueDate}
              onChange={(event) => setForm({ ...form, dueDate: event.target.value })}
            />
            <input
              placeholder="Hvem eier målet?"
              value={form.owner}
              onChange={(event) => setForm({ ...form, owner: event.target.value })}
            />
            <textarea
              placeholder="Skriv hvorfor dette målet er viktig"
              value={form.motivation}
              onChange={(event) => setForm({ ...form, motivation: event.target.value })}
            />
            <button type="submit">{editingId ? 'Oppdater mål' : 'Lagre mål'}</button>
          </form>
        </section>

        <section className="card savings-stats-card">
          <h3>Status og tempo</h3>
          <div className="savings-stats-grid">
            <div>
              <span className="muted">Totalt målbeløp</span>
              <p className="stat">{formatCurrency(stats.totalTarget)}</p>
            </div>
            <div>
              <span className="muted">Allerede spart</span>
              <p className="stat">{formatCurrency(stats.totalSaved)}</p>
            </div>
            <div>
              <span className="muted">Planlagt per måned</span>
              <p className="stat">{formatCurrency(stats.totalMonthly)}</p>
            </div>
            <div>
              <span className="muted">Fullførte mål</span>
              <p className="stat">{stats.completedCount}</p>
            </div>
          </div>
          <div className="progress-overview">
            <span className="muted">Gjennomsnittlig fremdrift</span>
            <div className="progress-bar" aria-label="Gjennomsnittlig fremdrift">
              <span style={{ width: `${stats.avgProgress}%` }} />
            </div>
            <strong>{stats.avgProgress}%</strong>
          </div>
          <div className="pill-row" style={{ marginTop: '1rem' }}>
            <div>
              <span className="muted">Neste frist</span>
              <strong>{stats.nextDeadline ? stats.nextDeadline.title : 'Ingen dato satt'}</strong>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span className="badge">{stats.nextDeadline ? formatDate(stats.nextDeadline.dueDate) : 'Planlegg frister'}</span>
              {stats.nextDeadline?.owner && <p className="muted">{stats.nextDeadline.owner}</p>}
            </div>
          </div>
        </section>
      </div>

      <section className="card">
        <div className="section-header compact">
          <h3>Aktive mål</h3>
          <div className="filter-buttons">
            <button
              type="button"
              className={filter === 'all' ? 'active' : ''}
              onClick={() => setFilter('all')}
            >
              Alle
            </button>
            <button
              type="button"
              className={filter === 'active' ? 'active' : ''}
              onClick={() => setFilter('active')}
            >
              Pågående
            </button>
            <button
              type="button"
              className={filter === 'completed' ? 'active' : ''}
              onClick={() => setFilter('completed')}
            >
              Fullført
            </button>
          </div>
        </div>
        {filteredGoals.length === 0 ? (
          <p className="muted">Legg til et mål eller endre filter for å se listen.</p>
        ) : (
          <div className="goal-list">
            {filteredGoals.map((goal) => {
              const progress = formatProgress(goal);
              const remaining = Math.max(0, (Number(goal.targetAmount) || 0) - (Number(goal.savedAmount) || 0));
              return (
                <article key={goal.id} className={`goal-card ${progress >= 100 ? 'completed' : ''}`}>
                  <header>
                    <h4>{goal.title}</h4>
                    {goal.motivation && <p className="muted">{goal.motivation}</p>}
                  </header>
                  <div className="goal-progress">
                    <div className="progress-bar" aria-label={`Fremdrift for ${goal.title}`}>
                      <span style={{ width: `${progress}%` }} />
                    </div>
                    <div className="goal-progress-values">
                      <strong>{progress}%</strong>
                      <span className="muted">{formatCurrency(goal.savedAmount)} av {formatCurrency(goal.targetAmount)}</span>
                    </div>
                  </div>
                  <div className="goal-meta">
                    <div>
                      <span>Eier</span>
                      <strong>{goal.owner || 'Familien'}</strong>
                    </div>
                    <div>
                      <span>Månedsparing</span>
                      <strong>{formatCurrency(goal.monthlyContribution)}</strong>
                    </div>
                    <div>
                      <span>Frist</span>
                      <strong>{goal.dueDate ? formatDate(goal.dueDate) : 'Når det passer'}</strong>
                    </div>
                    <div>
                      <span>Igjen å spare</span>
                      <strong>{formatCurrency(remaining)}</strong>
                    </div>
                  </div>
                  {progress < 100 && (
                    <div className="contribution-row">
                      <input
                        type="number"
                        min="0"
                        step="100"
                        placeholder="Registrer sparing"
                        value={contributionValues[goal.id] ?? ''}
                        onChange={(event) => {
                          const { value } = event.target;
                          setContributionValues((prev) => ({ ...prev, [goal.id]: value }));
                        }}
                      />
                      <button type="button" onClick={() => handleContribution(goal.id)}>
                        Legg til beløp
                      </button>
                    </div>
                  )}
                  <div className="goal-actions">
                    <button type="button" className="secondary" onClick={() => startEdit(goal)}>
                      Rediger
                    </button>
                    <button type="button" onClick={() => handleDelete(goal.id)}>
                      Slett
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};

export default SavingsGoalsPage;
