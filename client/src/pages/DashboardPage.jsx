import { useEffect, useState } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, PointElement, LineElement, BarElement } from 'chart.js';
import { Line, Doughnut, Bar } from 'react-chartjs-2';
import { api } from '../api.js';
import { formatCurrency } from '../utils/format.js';
import { loadSavingsGoals, summarizeSavingsGoals } from '../utils/savings.js';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, PointElement, LineElement, BarElement);

const DashboardPage = () => {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');
  const [incomeInput, setIncomeInput] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [savingsStats, setSavingsStats] = useState(() => summarizeSavingsGoals(loadSavingsGoals()));

  const fetchSummary = async () => {
    try {
      const data = await api.getSummary();
      setSummary(data);
      setIncomeInput(String(Math.round(data.monthlyNetIncome || 0)) || '');
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, []);

  useEffect(() => {
    const updateStats = () => {
      setSavingsStats(summarizeSavingsGoals(loadSavingsGoals()));
    };
    updateStats();
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', updateStats);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('storage', updateStats);
      }
    };
  }, []);

  const handleIncomeSubmit = async (event) => {
    event.preventDefault();
    try {
      await api.updateSettings({ monthlyNetIncome: Number(incomeInput) || 0 });
      setStatusMessage('Lagret!');
      fetchSummary();
      setTimeout(() => setStatusMessage(''), 2000);
    } catch (err) {
      setStatusMessage(err.message);
    }
  };

  if (error) {
    return <p>Kunne ikke laste data: {error}</p>;
  }

  if (!summary) {
    return <p>Laster...</p>;
  }

  const fixedCategories = summary.fixedExpenseCategoryTotals || [];
  const fixedLevels = summary.fixedExpenseLevelTotals || [];
  const bindingSoon = summary.bindingExpirations || [];

  const doughnutData =
    fixedCategories.length > 0
      ? {
          labels: fixedCategories.map((item) => item.category),
          datasets: [
            {
              label: 'Faste kostnader',
              data: fixedCategories.map((item) => item.total),
              backgroundColor: ['#6366f1', '#f97316', '#14b8a6', '#facc15', '#94a3b8']
            }
          ]
        }
      : null;

  const monthlyForecast = Array.from({ length: 12 }, (_, index) => {
    const date = new Date();
    date.setMonth(date.getMonth() + index);
    const label = date.toLocaleDateString('no-NO', {
      month: 'short',
      year: 'numeric'
    });
    const fixedCosts = summary.fixedExpenseTotal || 0;
    const availableAfterFixed = summary.freeAfterFixed || 0;
    return {
      label,
      fixedCosts,
      availableAfterFixed
    };
  });

  const lineData = {
    labels: monthlyForecast.map((item) => item.label),
    datasets: [
      {
        label: 'Faste kostnader',
        data: monthlyForecast.map((item) => item.fixedCosts),
        borderColor: '#6366f1',
        backgroundColor: 'rgba(99,102,241,0.15)'
      },
      {
        label: 'Tilgjengelig etter faste kostnader',
        data: monthlyForecast.map((item) => item.availableAfterFixed),
        borderColor: '#16a34a',
        backgroundColor: 'rgba(22,163,74,0.15)'
      }
    ]
  };

  const tagBarData = {
    labels: Object.keys(summary.tagTotals),
    datasets: [
      {
        label: 'Netto',
        data: Object.values(summary.tagTotals),
        backgroundColor: '#4f46e5'
      }
    ]
  };

  return (
    <div>
      <div className="card-grid">
        <div className="card">
          <h3>Faste kostnader per måned</h3>
          <p className="stat">{formatCurrency(summary.fixedExpenseTotal)}</p>
          <p className="muted">{summary.fixedExpensesCount} aktive avtaler</p>
        </div>
        <div className="card">
          <div className="panel-header">
            <div>
              <h3>Netto inntekt per måned</h3>
              <p className="muted">Brukes som utgangspunkt for oversikten.</p>
            </div>
            {statusMessage && <span className="badge">{statusMessage}</span>}
          </div>
          <form className="inline-form" onSubmit={handleIncomeSubmit}>
            <label htmlFor="monthlyNetIncome">Beløp (NOK)</label>
            <input
              id="monthlyNetIncome"
              type="number"
              min="0"
              value={incomeInput}
              onChange={(e) => setIncomeInput(e.target.value)}
            />
            <button type="submit">Oppdater</button>
          </form>
        </div>
        <div className="card">
          <h3>Tilgjengelig etter faste kostnader</h3>
          <p className="stat" style={{ color: summary.freeAfterFixed >= 0 ? '#16a34a' : '#dc2626' }}>
            {formatCurrency(summary.freeAfterFixed)}
          </p>
          <p className="muted">Basert på netto inntekt</p>
        </div>
        <div className="card">
          <h3>Sparemål</h3>
          {savingsStats.goalCount > 0 ? (
            <>
              <p className="stat">{savingsStats.avgProgress}%</p>
              <div className="progress-track" aria-label="Spareprogresjon">
                <div className="progress-fill" style={{ width: `${savingsStats.avgProgress}%` }} />
              </div>
              <p className="muted">
                {formatCurrency(savingsStats.totalSaved)} spart av {formatCurrency(savingsStats.totalTarget)}
              </p>
            </>
          ) : (
            <p className="muted">Opprett sparemål for å følge progresjonen her.</p>
          )}
        </div>
      </div>

      <div className="section-header">
        <h2>Fordeling av faste kostnader</h2>
        {doughnutData && <span className="badge">{fixedCategories.length} kategorier</span>}
      </div>
      <div className="card">
        {doughnutData ? (
          <div className="chart-wrapper">
            <Doughnut data={doughnutData} options={{ plugins: { legend: { position: 'bottom' } }, cutout: '60%' }} />
          </div>
        ) : (
          <p className="muted">Registrer faste utgifter for å se fordelingen.</p>
        )}
      </div>

      <div className="card-grid" style={{ marginTop: '1.5rem' }}>
        <div className="card">
          <h3>Prioritering</h3>
          {fixedLevels.map((item) => (
            <div key={item.level} className="pill-row">
              <span>{item.level}</span>
              <strong>{formatCurrency(item.total)}</strong>
            </div>
          ))}
        </div>
        <div className="card">
          <h3>Bindinger neste 90 dager</h3>
          {bindingSoon.length === 0 && <p className="muted">Ingen bindinger som utløper.</p>}
          {bindingSoon.map((item) => (
            <div key={item.id} className="pill-row">
              <span>
                <strong>{item.name}</strong>
                <br />
                <small className="muted">{new Date(item.bindingEndDate).toLocaleDateString('no-NO')}</small>
              </span>
              <div style={{ textAlign: 'right' }}>
                <span className="badge">{item.daysLeft} dager</span>
                <p style={{ margin: '0.35rem 0 0' }}>{formatCurrency(item.amountPerMonth)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="section-header">
        <h2>Månedlige bevegelser</h2>
      </div>
      <div className="card">
        <Line data={lineData} />
      </div>

      {Object.keys(summary.tagTotals).length > 0 && (
        <>
          <div className="section-header">
            <h2>Tag-analyse</h2>
          </div>
          <div className="card">
            <Bar data={tagBarData} />
          </div>
        </>
      )}

    </div>
  );
};

export default DashboardPage;
