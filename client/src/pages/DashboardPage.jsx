import { useCallback, useEffect, useMemo, useState } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, PointElement, LineElement, BarElement } from 'chart.js';
import { Line, Doughnut, Bar } from 'react-chartjs-2';
import { api } from '../api.js';
import { formatCurrency } from '../utils/format.js';
import { loadSavingsGoals, summarizeSavingsGoals } from '../utils/savings.js';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, PointElement, LineElement, BarElement);

const DashboardPage = () => {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');
  const [savingsStats, setSavingsStats] = useState(() => summarizeSavingsGoals(loadSavingsGoals()));
  const [hiddenCategories, setHiddenCategories] = useState([]);

  const fetchSummary = async () => {
    try {
      const data = await api.getSummary();
      setSummary(data);
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

  const fixedCategories = summary?.fixedExpenseCategoryTotals || [];
  const fixedLevels = summary?.fixedExpenseLevelTotals || [];
  const bindingSoon = summary?.bindingExpirations || [];

  useEffect(() => {
    setHiddenCategories((current) =>
      current.filter((category) => fixedCategories.some((item) => item.category === category))
    );
  }, [fixedCategories]);

  if (error) {
    return <p>Kunne ikke laste data: {error}</p>;
  }

  if (!summary) {
    return <p>Laster...</p>;
  }

  const visibleFixedCategories = useMemo(
    () => fixedCategories.filter((item) => !hiddenCategories.includes(item.category)),
    [fixedCategories, hiddenCategories]
  );

  const baselineFixedCosts =
    summary.effectiveFixedExpenseTotal ?? summary.fixedExpenseTotal ?? summary.fixedExpensesTotal ?? 0;
  const baselineFreeAfterFixed = summary.freeAfterFixed ?? 0;
  const netIncomeCandidate =
    typeof summary.activeMonthlyNetIncome === 'number'
      ? summary.activeMonthlyNetIncome
      : typeof summary.monthlyNetIncome === 'number'
      ? summary.monthlyNetIncome
      : baselineFixedCosts + baselineFreeAfterFixed;
  const hasNetIncome = Number.isFinite(netIncomeCandidate);
  const visibleFixedTotal = visibleFixedCategories.reduce((sum, item) => sum + (item.total || 0), 0);
  const visibleFreeAfterFixed = hasNetIncome
    ? netIncomeCandidate - visibleFixedTotal
    : baselineFreeAfterFixed + (baselineFixedCosts - visibleFixedTotal);

  const monthlyForecast = Array.from({ length: 12 }, (_, index) => {
    const date = new Date();
    date.setMonth(date.getMonth() + index);
    const label = date.toLocaleDateString('no-NO', {
      month: 'short',
      year: 'numeric'
    });
    const fixedCosts = visibleFixedTotal;
    const availableAfterFixed = visibleFreeAfterFixed;
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

  const handleLegendClick = useCallback((event, legendItem, legend) => {
    const index = legendItem.index;
    const label = legend?.chart?.data?.labels?.[index];
    if (!label) {
      return;
    }
    setHiddenCategories((current) => {
      if (current.includes(label)) {
        return current.filter((item) => item !== label);
      }
      return [...current, label];
    });
    legend?.chart?.toggleDataVisibility(index);
    legend?.chart?.update();
  }, []);

  const doughnutOptions = useMemo(
    () => ({
      plugins: {
        legend: {
          position: 'bottom',
          onClick: handleLegendClick
        }
      },
      cutout: '65%'
    }),
    [handleLegendClick]
  );

  const doughnutData =
    fixedCategories.length > 0
      ? {
          labels: fixedCategories.map((item) => item.category),
          datasets: [
            {
              label: 'Faste kostnader',
              data: fixedCategories.map((item) => item.total),
              backgroundColor: fixedCategories.map((item) => item.color || '#94a3b8')
            }
          ]
        }
      : null;

  const tagTotals =
    summary?.tagTotals && typeof summary.tagTotals === 'object' ? summary.tagTotals : {};
  const tagKeys = Object.keys(tagTotals);
  const tagValues = tagKeys.map((key) => tagTotals[key]);
  const tagBarData = {
    labels: tagKeys,
    datasets: [
      {
        label: 'Netto',
        data: tagValues,
        backgroundColor: '#4f46e5'
      }
    ]
  };

  return (
    <div className="dashboard-page">
      <div className="section-header">
        <div>
          <h2>Oversikt</h2>
          {hiddenCategories.length > 0 && (
            <div className="filter-indicator">
              <span className="badge">
                Viser {visibleFixedCategories.length}/{fixedCategories.length} kategorier fra grafen
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="card-grid">
        <div className="card insight-card glow-lilac">
          <h3>Faste kostnader per måned</h3>
          <p className="stat">{formatCurrency(visibleFixedTotal || summary.fixedExpenseTotal)}</p>
          <p className="muted">
            {summary.fixedExpensesCount} aktive avtaler
            {hiddenCategories.length > 0 && ' (filter fra grafen)'}
          </p>
        </div>
        <div className="card insight-card glow-mint">
          <h3>Tilgjengelig etter faste kostnader</h3>
          <p className="stat" style={{ color: visibleFreeAfterFixed >= 0 ? '#16a34a' : '#dc2626' }}>
            {formatCurrency(visibleFreeAfterFixed)}
          </p>
          <p className="muted">Basert på inntekten som er registrert under Innstillinger.</p>
        </div>
        <div className="card insight-card glow-sky">
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

      <div className="card insight-card glow-ocean chart-card">
        <div className="section-header" style={{ marginTop: 0 }}>
          <h2>Fordeling av faste kostnader</h2>
          {doughnutData && (
            <span className="badge">
              {hiddenCategories.length === 0
                ? `${fixedCategories.length} kategorier`
                : `${visibleFixedCategories.length}/${fixedCategories.length} kategorier`}
            </span>
          )}
        </div>
        {doughnutData ? (
          <div className="chart-wrapper">
            <Doughnut data={doughnutData} options={doughnutOptions} />
          </div>
        ) : (
          <p className="muted">Registrer faste utgifter for å se fordelingen.</p>
        )}
      </div>

      <div className="card-grid">
        <div className="card insight-card glow-amber">
          <h3>Prioritering</h3>
          {fixedLevels.map((item) => (
            <div key={item.level} className="pill-row">
              <span>{item.level}</span>
              <strong>{formatCurrency(item.total)}</strong>
            </div>
          ))}
          {fixedLevels.length === 0 && <p className="muted">Ingen registrerte utgifter ennå.</p>}
        </div>
        <div className="card insight-card glow-rose">
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

      <div className="card insight-card glow-sand">
        <div className="section-header compact">
          <h2>Månedlige bevegelser</h2>
        </div>
        <Line data={lineData} />
      </div>

      {tagKeys.length > 0 && (
        <div className="card insight-card glow-lilac">
          <div className="section-header compact">
            <h2>Tag-analyse</h2>
          </div>
          <Bar data={tagBarData} />
        </div>
      )}
    </div>
  );
};

export default DashboardPage;
