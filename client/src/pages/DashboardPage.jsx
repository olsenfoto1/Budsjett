import { useEffect, useState } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, PointElement, LineElement, BarElement } from 'chart.js';
import { Line, Doughnut, Bar } from 'react-chartjs-2';
import { api } from '../api.js';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, PointElement, LineElement, BarElement);

const DashboardPage = () => {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .getSummary()
      .then(setSummary)
      .catch((err) => setError(err.message));
  }, []);

  if (error) {
    return <p>Kunne ikke laste data: {error}</p>;
  }

  if (!summary) {
    return <p>Laster...</p>;
  }

  const doughnutData = {
    labels: summary.categoryTotals.map((cat) => cat.name),
    datasets: [
      {
        label: 'Utgifter',
        data: summary.categoryTotals.map((cat) => cat.total),
        backgroundColor: summary.categoryTotals.map((cat) => cat.color || '#94a3b8')
      }
    ]
  };

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
          <h3>Total inntekt</h3>
          <p className="stat">{summary.totalIncome.toLocaleString('no-NO', { style: 'currency', currency: 'NOK' })}</p>
        </div>
        <div className="card">
          <h3>Total utgift</h3>
          <p className="stat">{summary.totalExpense.toLocaleString('no-NO', { style: 'currency', currency: 'NOK' })}</p>
        </div>
        <div className="card">
          <h3>Netto</h3>
          <p className="stat" style={{ color: summary.net >= 0 ? '#16a34a' : '#dc2626' }}>
            {summary.net.toLocaleString('no-NO', { style: 'currency', currency: 'NOK' })}
          </p>
        </div>
      </div>

      <div className="section-header">
        <h2>Kategorier</h2>
        <span className="badge">Full kontroll</span>
      </div>
      <div className="card">
        <Doughnut data={doughnutData} />
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
