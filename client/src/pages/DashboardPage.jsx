import { useCallback, useEffect, useMemo, useState } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, PointElement, LineElement, BarElement } from 'chart.js';
import { Line, Doughnut, Bar } from 'react-chartjs-2';
import { api } from '../api.js';
import { formatCurrency, formatDate } from '../utils/format.js';
import { loadSavingsGoals, summarizeSavingsGoals } from '../utils/savings.js';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, PointElement, LineElement, BarElement);

const hexToRgba = (hex, alpha = 0.2) => {
  if (typeof hex !== 'string') return `rgba(99, 102, 241, ${alpha})`;
  const normalized = hex.trim().replace('#', '');
  const expanded = normalized.length === 3 ? normalized.split('').map((char) => char + char).join('') : normalized;
  if (expanded.length !== 6) return `rgba(99, 102, 241, ${alpha})`;
  const numeric = Number.parseInt(expanded, 16);
  if (Number.isNaN(numeric)) return `rgba(99, 102, 241, ${alpha})`;
  const r = (numeric >> 16) & 255;
  const g = (numeric >> 8) & 255;
  const b = numeric & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const DashboardPage = () => {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');
  const [savingsStats, setSavingsStats] = useState(() => summarizeSavingsGoals(loadSavingsGoals()));
  const [hiddenCategories, setHiddenCategories] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');

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

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 350);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    if (!debouncedSearch) {
      setSearchResults([]);
      setSearchError('');
      return;
    }

    setSearchLoading(true);
    setSearchError('');
    api
      .getTransactions({ search: debouncedSearch, type: 'expense', sortBy: 'occurredOn', order: 'DESC' })
      .then((data) => setSearchResults(Array.isArray(data) ? data.slice(0, 8) : []))
      .catch((err) => setSearchError(err.message || 'Kunne ikke søke etter utgifter.'))
      .finally(() => setSearchLoading(false));
  }, [debouncedSearch]);

  const visibleFixedCategories = useMemo(
    () => fixedCategories.filter((item) => !hiddenCategories.includes(item.category)),
    [fixedCategories, hiddenCategories]
  );

  const baselineFixedCosts =
    summary?.effectiveFixedExpenseTotal ?? summary?.fixedExpenseTotal ?? summary?.fixedExpensesTotal ?? 0;
  const baselineFreeAfterFixed = summary?.freeAfterFixed ?? 0;
  const netIncomeCandidate =
    typeof summary?.activeMonthlyNetIncome === 'number'
      ? summary.activeMonthlyNetIncome
      : typeof summary?.monthlyNetIncome === 'number'
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

  const priceTrendItems = summary?.fixedExpensePriceHistory || [];

  const priceTrendLabels = useMemo(() => {
    const dates = new Set();
    priceTrendItems.forEach((item) => {
      (item.priceHistory || []).forEach((entry) => {
        if (entry.changedAt) {
          dates.add(entry.changedAt);
        }
      });
    });
    return Array.from(dates)
      .sort((a, b) => new Date(a) - new Date(b))
      .map((value) => ({
        raw: value,
        timestamp: new Date(value).getTime(),
        label: new Date(value).toLocaleDateString('no-NO', {
          day: '2-digit',
          month: 'short',
          year: 'numeric'
        })
      }))
      .filter((item) => Number.isFinite(item.timestamp));
  }, [priceTrendItems]);

  const priceTrendChartData = useMemo(() => {
    if (!priceTrendLabels.length || !priceTrendItems.length) return null;
    const labelTimestamps = priceTrendLabels.map((item) => item.timestamp);
    return {
      labels: priceTrendLabels.map((item) => item.label),
      datasets: priceTrendItems.map((item) => {
        const history = (item.priceHistory || [])
          .map((entry) => ({
            amount: Number(entry.amount) || 0,
            timestamp: new Date(entry.changedAt).getTime()
          }))
          .filter((entry) => Number.isFinite(entry.timestamp))
          .sort((a, b) => a.timestamp - b.timestamp);
        let pointer = 0;
        let currentAmount = history[0]?.amount ?? 0;
        const points = labelTimestamps.map((ts) => {
          while (pointer < history.length && history[pointer].timestamp <= ts) {
            currentAmount = history[pointer].amount;
            pointer += 1;
          }
          return currentAmount;
        });
        const color = item.color || '#6366f1';
        return {
          label: item.name,
          data: points,
          borderColor: color,
          backgroundColor: hexToRgba(color, 0.2),
          tension: 0.25
        };
      })
    };
  }, [priceTrendLabels, priceTrendItems]);

  const priceTrendChartOptions = useMemo(
    () => ({
      responsive: true,
      interaction: { mode: 'nearest', intersect: false },
      plugins: {
        legend: { position: 'bottom' },
        tooltip: {
          callbacks: {
            label: (context) => `${context.dataset.label}: ${formatCurrency(context.parsed.y)}`
          }
        }
      },
      scales: {
        y: {
          ticks: {
            callback: (value) => formatCurrency(value)
          }
        }
      }
    }),
    []
  );

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

  const tagTotals = summary?.tagTotals || {};
  const tagBarData = {
    labels: Object.keys(tagTotals),
    datasets: [
      {
        label: 'Netto',
        data: Object.values(tagTotals),
        backgroundColor: '#4f46e5'
      }
    ]
  };

  if (error) {
    return <p>Kunne ikke laste data: {error}</p>;
  }

  if (!summary) {
    return <p>Laster...</p>;
  }

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

      <div className="card insight-card glow-search transaction-search-card">
        <div className="transaction-search-header">
          <div>
            <h3>Finn en utgift lynraskt</h3>
            <p className="muted">Skriv for å få forslag på tvers av alle utgifter, med kategori, dato og side.</p>
          </div>
          {debouncedSearch && !searchLoading && <span className="badge">{searchResults.length} forslag</span>}
        </div>
        <div className="search-input-row">
          <span className="search-icon" aria-hidden="true">
            🔎
          </span>
          <input
            className="search-input"
            type="search"
            placeholder="For eksempel: strøm, barnehage, forsikring…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button type="button" className="ghost-button" onClick={() => setSearchTerm('')}>
              Nullstill
            </button>
          )}
        </div>
        {searchError && <p className="error-text">{searchError}</p>}
        <div className="suggestion-list" role="list" aria-live="polite">
          {!debouncedSearch && <p className="muted">Start å skrive for å se de mest relevante utgiftene dine.</p>}
          {debouncedSearch && searchLoading && <p className="muted">Søker etter utgifter…</p>}
          {debouncedSearch && !searchLoading && searchResults.length === 0 && (
            <p className="muted">Fant ingen utgifter som matcher «{debouncedSearch}».</p>
          )}
          {searchResults.map((tx) => (
            <article key={tx.id} className="suggestion-item" role="listitem">
              <div>
                <div className="suggestion-title">{tx.title}</div>
                <div className="suggestion-meta">
                  <span className="badge soft">{tx.categoryName || 'Ingen kategori'}</span>
                  {tx.pageName && <span className="pill">{tx.pageName}</span>}
                  <span className="pill">{formatDate(tx.occurredOn)}</span>
                </div>
                {tx.notes && <p className="muted">{tx.notes}</p>}
              </div>
              <div className="suggestion-amount" aria-label="Beløp">
                {formatCurrency(tx.amount)}
              </div>
            </article>
          ))}
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

      <div className="card insight-card glow-indigo chart-card">
        <div className="section-header" style={{ marginTop: 0 }}>
          <div>
            <h2>Prisendringer i faste utgifter</h2>
            <p className="muted">Historikk for utgifter som er oppdatert med ny pris.</p>
          </div>
          {priceTrendItems.length > 0 && (
            <span className="badge">{priceTrendItems.length} utgifter</span>
          )}
        </div>
        {priceTrendChartData ? (
          <div className="chart-wrapper">
            <Line data={priceTrendChartData} options={priceTrendChartOptions} />
          </div>
        ) : (
          <p className="muted">Ingen prisendringer registrert ennå.</p>
        )}
      </div>

      <div className="card insight-card glow-sand">
        <div className="section-header compact">
          <h2>Månedlige bevegelser</h2>
        </div>
        <Line data={lineData} />
      </div>

      {Object.keys(summary.tagTotals).length > 0 && (
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
