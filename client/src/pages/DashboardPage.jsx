import { useEffect, useState } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, PointElement, LineElement, BarElement } from 'chart.js';
import { Line, Doughnut, Bar } from 'react-chartjs-2';
import { api } from '../api.js';
import { formatCurrency } from '../utils/format.js';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, PointElement, LineElement, BarElement);

const DashboardPage = () => {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');
  const [incomeInput, setIncomeInput] = useState('');
  const [statusMessage, setStatusMessage] = useState('');

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

  const lineData = {
    labels: summary.monthly.map((item) => item.period),
    datasets: [
      {
        label: 'Inntekt',
        data: summary.monthly.map((item) => item.income),
        borderColor: '#22c55e',
        backgroundColor: 'rgba(34,197,94,0.2)'
      },
      {
        label: 'Utgifter',
        data: summary.monthly.map((item) => item.expenses),
        borderColor: '#ef4444',
        backgroundColor: 'rgba(239,68,68,0.2)'
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
          <h3>Netto inntekt per måned</h3>
          <form className="inline-form" onSubmit={handleIncomeSubmit}>
            <input type="number" min="0" value={incomeInput} onChange={(e) => setIncomeInput(e.target.value)} />
            <button type="submit">Oppdater</button>
          </form>
          {statusMessage && <small className="muted">{statusMessage}</small>}
        </div>
        <div className="card">
          <h3>Ledig etter faste kostnader</h3>
          <p className="stat" style={{ color: summary.freeAfterFixed >= 0 ? '#16a34a' : '#dc2626' }}>
            {formatCurrency(summary.freeAfterFixed)}
          </p>
          <p className="muted">Basert på netto inntekt</p>
        </div>
        <div className="card">
          <h3>Netto økonomi</h3>
          <p className="stat" style={{ color: summary.net >= 0 ? '#16a34a' : '#dc2626' }}>
            {formatCurrency(summary.net)}
          </p>
          <p className="muted">Transaksjoner totalt</p>
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

      <div className="section-header">
        <h2>Sider</h2>
      </div>
      <div className="card-grid">
        {summary.pageBalances.map((page) => (
          <div className="card" key={page.name}>
            <h3>{page.name}</h3>
            <p className="stat" style={{ color: page.balance >= 0 ? '#16a34a' : '#dc2626' }}>
              {page.balance.toLocaleString('no-NO', { style: 'currency', currency: 'NOK' })}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DashboardPage;
