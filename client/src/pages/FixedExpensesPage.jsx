import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, PointElement, LineElement } from 'chart.js';
import { Doughnut, Line } from 'react-chartjs-2';
import { api } from '../api.js';
import { formatCurrency, formatDate, formatNotice } from '../utils/format.js';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, PointElement, LineElement);

const FALLBACK_CATEGORY_OPTIONS = ['Abonnementer', 'Lån', 'Forsikring', 'Strøm', 'Annet'];
const FALLBACK_CATEGORY_COLORS = {
  Abonnementer: '#6366f1',
  Lån: '#f97316',
  Forsikring: '#14b8a6',
  Strøm: '#facc15',
  Annet: '#94a3b8'
};
const LEVEL_OPTIONS = ['Må-ha', 'Kjekt å ha', 'Luksus'];
const CATEGORY_SORT_STORAGE_KEY = 'fixed-expense-category-sort';
const CATEGORY_SORT_OPTIONS = [
  { value: 'total-desc', label: 'Størst sum' },
  { value: 'total-asc', label: 'Lavest sum' },
  { value: 'alpha-asc', label: 'Alfabetisk' }
];

const hexToRgba = (hex, alpha = 1) => {
  if (typeof hex !== 'string') return `rgba(148, 163, 184, ${alpha})`;
  const normalized = hex.trim().replace('#', '');
  const expanded = normalized.length === 3 ? normalized.split('').map((char) => char + char).join('') : normalized;
  if (expanded.length !== 6) return `rgba(148, 163, 184, ${alpha})`;
  const numeric = Number.parseInt(expanded, 16);
  if (Number.isNaN(numeric)) return `rgba(148, 163, 184, ${alpha})`;
  const r = (numeric >> 16) & 255;
  const g = (numeric >> 8) & 255;
  const b = numeric & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

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

const Modal = ({ children, onClose }) => {
  const elRef = useRef(null);
  if (typeof document !== 'undefined' && !elRef.current) {
    elRef.current = document.createElement('div');
  }

  useEffect(() => {
    if (!elRef.current) return undefined;
    const modalRoot = elRef.current;
    document.body.appendChild(modalRoot);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      if (modalRoot.parentNode) {
        modalRoot.parentNode.removeChild(modalRoot);
      }
    };
  }, [onClose]);

  if (!elRef.current) return null;

  return createPortal(
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="secondary close-button" onClick={onClose}>
          Lukk
        </button>
        {children}
      </div>
    </div>,
    elRef.current
  );
};

const FixedExpensesPage = () => {
  const [expenses, setExpenses] = useState([]);
  const [form, setForm] = useState(() => createEmptyForm());
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [simulatedExpense, setSimulatedExpense] = useState(null);
  const handleCloseSimulation = useCallback(() => setSimulatedExpense(null), []);
  const [selectedOwners, setSelectedOwners] = useState([]);
  const [hasManualOwnerSelection, setHasManualOwnerSelection] = useState(false);
  const [categoryOptions, setCategoryOptions] = useState(FALLBACK_CATEGORY_OPTIONS);
  const [categoryColorMap, setCategoryColorMap] = useState(() => ({ ...FALLBACK_CATEGORY_COLORS }));
  const [categoryError, setCategoryError] = useState('');
  const [hiddenCategories, setHiddenCategories] = useState([]);
  const [isLoadingExpenses, setIsLoadingExpenses] = useState(true);
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);
  const [bulkOwnersInput, setBulkOwnersInput] = useState('');
  const [bulkOwnersError, setBulkOwnersError] = useState('');
  const [bulkOwnersSuccess, setBulkOwnersSuccess] = useState('');
  const [isBulkUpdatingOwners, setIsBulkUpdatingOwners] = useState(false);
  const [monthlyNetIncome, setMonthlyNetIncome] = useState(null);
  const [ownerProfiles, setOwnerProfiles] = useState([]);
  const [settingsError, setSettingsError] = useState('');
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [defaultOwners, setDefaultOwners] = useState([]);
  const [categorySort, setCategorySort] = useState(() => {
    const stored = localStorage.getItem(CATEGORY_SORT_STORAGE_KEY);
    return CATEGORY_SORT_OPTIONS.some((option) => option.value === stored) ? stored : 'total-desc';
  });
  const [priceInputs, setPriceInputs] = useState({});
  const [priceErrors, setPriceErrors] = useState({});
  const [isUpdatingPriceId, setIsUpdatingPriceId] = useState(null);
  const [isResettingPriceId, setIsResettingPriceId] = useState(null);
  const ownerOptions = useMemo(() => {
    const set = new Set();
    expenses.forEach((expense) => {
      (expense.owners || []).forEach((owner) => {
        const trimmed = owner?.trim();
        if (trimmed) {
          set.add(trimmed);
        }
      });
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'no'));
  }, [expenses]);
  const availableCategories = useMemo(() => {
    if (!form.category || categoryOptions.includes(form.category)) {
      return categoryOptions;
    }
    return [form.category, ...categoryOptions];
  }, [categoryOptions, form.category]);

  const fetchExpenses = async () => {
    setIsLoadingExpenses(true);
    try {
      const data = await api.getFixedExpenses();
      setExpenses(data.sort((a, b) => (b.amountPerMonth || 0) - (a.amountPerMonth || 0)));
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoadingExpenses(false);
    }
  };

  useEffect(() => {
    fetchExpenses();
  }, []);

  useEffect(() => {
    let isMounted = true;
    const loadSettings = async () => {
      try {
        const settings = await api.getSettings();
        if (!isMounted) return;
        setMonthlyNetIncome(Number(settings.monthlyNetIncome) || 0);
        setOwnerProfiles(Array.isArray(settings.ownerProfiles) ? settings.ownerProfiles : []);
        const defaultOwnerList = Array.isArray(settings.defaultFixedExpensesOwners)
          ? settings.defaultFixedExpensesOwners
          : typeof settings.defaultFixedExpensesOwner === 'string' && settings.defaultFixedExpensesOwner.trim()
          ? [settings.defaultFixedExpensesOwner.trim()]
          : [];
        setDefaultOwners(defaultOwnerList);
        setSettingsError('');
      } catch (err) {
        if (!isMounted) return;
        console.error('Kunne ikke hente innstillinger', err);
        setSettingsError('Kunne ikke hente innstillinger.');
      } finally {
        if (isMounted) {
          setSettingsLoaded(true);
        }
      }
    };
    loadSettings();
    return () => {
      isMounted = false;
    };
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
      const colors = { ...FALLBACK_CATEGORY_COLORS };
      categories.forEach((category) => {
        if (category?.name) {
          colors[category.name] = category.color || colors[category.name] || '#94a3b8';
        }
      });
      setCategoryColorMap(colors);
    } catch (err) {
      console.error('Kunne ikke hente kategorier', err);
      setCategoryError('Kunne ikke hente oppdaterte kategorier. Viser standardvalg.');
      setCategoryOptions((current) => (current.length ? current : FALLBACK_CATEGORY_OPTIONS));
      setCategoryColorMap((current) => (Object.keys(current).length ? current : { ...FALLBACK_CATEGORY_COLORS }));
    } finally {
      setIsLoadingCategories(false);
    }
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const getCategoryStyle = useCallback(
    (categoryName) => {
      const color = categoryColorMap[categoryName] || FALLBACK_CATEGORY_COLORS[categoryName] || '#94a3b8';
      return {
        '--category-accent': hexToRgba(color, 0.14),
        '--category-accent-strong': hexToRgba(color, 0.26),
        '--category-border': hexToRgba(color, 0.38),
        '--category-glow': hexToRgba(color, 0.22),
        '--category-solid': color
      };
    },
    [categoryColorMap]
  );

  const activeOwners = useMemo(
    () => (hasManualOwnerSelection ? selectedOwners : defaultOwners),
    [hasManualOwnerSelection, selectedOwners, defaultOwners]
  );

  const filteredExpenses = useMemo(() => {
    if (!activeOwners.length) return expenses;
    return expenses.filter((expense) =>
      (expense.owners || []).some((owner) => activeOwners.includes(owner))
    );
  }, [expenses, activeOwners]);

  const categoryTotals = useMemo(() => {
    const map = new Map();
    filteredExpenses.forEach((expense) => {
      const key = expense.category || 'Annet';
      map.set(key, (map.get(key) || 0) + (expense.amountPerMonth || 0));
    });
    return Array.from(map.entries())
      .map(([category, total]) => ({
        category,
        total,
        color: categoryColorMap[category] || FALLBACK_CATEGORY_COLORS[category] || '#94a3b8'
      }))
      .sort((a, b) => b.total - a.total);
  }, [filteredExpenses, categoryColorMap]);

  const hiddenCategorySet = useMemo(() => new Set(hiddenCategories), [hiddenCategories]);

  const visibleCategoryTotals = useMemo(
    () => categoryTotals.filter((item) => !hiddenCategorySet.has(item.category)),
    [categoryTotals, hiddenCategorySet]
  );

  const fullTotalPerMonth = useMemo(
    () => filteredExpenses.reduce((sum, expense) => sum + (Number(expense.amountPerMonth) || 0), 0),
    [filteredExpenses]
  );

  const totalPerMonth = useMemo(
    () => visibleCategoryTotals.reduce((sum, item) => sum + (Number(item.total) || 0), 0),
    [visibleCategoryTotals]
  );

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
      .sort((a, b) => {
        if (categorySort === 'alpha-asc') {
          return a.category.localeCompare(b.category, 'nb');
        }
        if (categorySort === 'total-asc') {
          return (a.total || 0) - (b.total || 0);
        }
        return (b.total || 0) - (a.total || 0);
      });
  }, [filteredExpenses, categorySort]);

  useEffect(() => {
    localStorage.setItem(CATEGORY_SORT_STORAGE_KEY, categorySort);
  }, [categorySort]);

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

  const priceTrendExpenses = useMemo(
    () =>
      filteredExpenses.filter(
        (expense) => (expense.priceHistory || []).length > 1 && !hiddenCategorySet.has(expense.category)
      ),
    [filteredExpenses, hiddenCategorySet]
  );

  const priceTrendLabels = useMemo(() => {
    const dates = new Set();
    priceTrendExpenses.forEach((expense) => {
      (expense.priceHistory || []).forEach((entry) => {
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
  }, [priceTrendExpenses]);

  const priceTrendChartData = useMemo(() => {
    if (!priceTrendLabels.length || !priceTrendExpenses.length) return null;
    const labelTimestamps = priceTrendLabels.map((item) => item.timestamp);
    return {
      labels: priceTrendLabels.map((item) => item.label),
      datasets: priceTrendExpenses.map((expense) => {
        const sortedHistory = (expense.priceHistory || [])
          .map((entry) => ({
            amount: Number(entry.amount) || 0,
            timestamp: new Date(entry.changedAt).getTime()
          }))
          .filter((entry) => Number.isFinite(entry.timestamp))
          .sort((a, b) => a.timestamp - b.timestamp);
        let pointer = 0;
        let currentAmount = sortedHistory[0]?.amount ?? 0;
        const points = labelTimestamps.map((labelTs) => {
          while (pointer < sortedHistory.length && sortedHistory[pointer].timestamp <= labelTs) {
            currentAmount = sortedHistory[pointer].amount;
            pointer += 1;
          }
          return currentAmount;
        });
        const color =
          categoryColorMap[expense.category] || FALLBACK_CATEGORY_COLORS[expense.category] || '#4f46e5';
        return {
          label: expense.name,
          data: points,
          borderColor: color,
          backgroundColor: hexToRgba(color, 0.2),
          tension: 0.25
        };
      })
    };
  }, [priceTrendLabels, priceTrendExpenses, categoryColorMap]);

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

  useEffect(() => {
    setHiddenCategories((current) => current.filter((category) => categoryTotals.some((item) => item.category === category)));
  }, [categoryTotals]);

  const handleLegendClick = useCallback(
    (event, legendItem, legend) => {
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
    },
    []
  );

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

  const doughnutData = useMemo(() => {
    if (!categoryTotals.length) {
      return null;
    }
    return {
      labels: categoryTotals.map((item) => item.category),
      datasets: [
        {
          data: categoryTotals.map((item) => item.total),
          backgroundColor: categoryTotals.map((item) => item.color || '#94a3b8')
        }
      ]
    };
  }, [categoryTotals]);

  const ownerIncomeMap = useMemo(() => {
    const map = new Map();
    ownerProfiles.forEach((profile) => {
      if (!profile?.name) return;
      const value = Number(profile.monthlyNetIncome);
      if (Number.isFinite(value)) {
        map.set(profile.name, value);
      }
    });
    return map;
  }, [ownerProfiles]);

  const activeIncome = activeOwners.length
    ? activeOwners.reduce((sum, owner) => sum + (ownerIncomeMap.get(owner) || 0), 0)
    : monthlyNetIncome;
  const hasIncomeValue = typeof activeIncome === 'number' && Number.isFinite(activeIncome);
  const freeAfterFixed = hasIncomeValue ? activeIncome - totalPerMonth : null;
  const netIncomeLoaded = settingsLoaded;
  const luxuryTotal = levelTotals.find((item) => item.level === 'Luksus')?.total || 0;
  const missingIncomeOwners =
    settingsLoaded && activeOwners.length > 0
      ? activeOwners.filter((owner) => !ownerIncomeMap.has(owner))
      : [];
  const missingIncomeForOwner = missingIncomeOwners.length > 0;
  const filterDescription = activeOwners.length
    ? `utgiftene til ${activeOwners.join(', ')}`
    : 'alle faste utgifter';
  const incomeSourceDescription = activeOwners.length
    ? `${activeOwners.join(', ')} sin samlede netto inntekt`
    : 'netto inntekt';
  const showingDefaultOwnerIncome = !hasManualOwnerSelection && defaultOwners.length > 0;
  const manualFilterActive = hasManualOwnerSelection && activeOwners.length > 0;

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

  const closeForm = useCallback(() => {
    setShowForm(false);
    setForm(createEmptyForm(categoryOptions[0] || FALLBACK_CATEGORY_OPTIONS[0]));
    setEditingId(null);
  }, [categoryOptions]);

  const handleToggleOwnerFilter = useCallback(
    (owner) => {
      setSelectedOwners((current) => {
        const baseline = hasManualOwnerSelection ? current : defaultOwners;
        if (baseline.includes(owner)) {
          return baseline.filter((item) => item !== owner);
        }
        return [...baseline, owner];
      });
      setHasManualOwnerSelection(true);
    },
    [defaultOwners, hasManualOwnerSelection]
  );

  const clearOwnerFilter = useCallback(() => {
    setSelectedOwners([]);
    setHasManualOwnerSelection(false);
  }, []);

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

  const handleNewPriceChange = useCallback(
    (id, value) => {
      setPriceInputs((current) => ({ ...current, [id]: value }));
      if (priceErrors[id]) {
        setPriceErrors((current) => ({ ...current, [id]: '' }));
      }
    },
    [priceErrors]
  );

  const handleSubmitNewPrice = useCallback(
    async (expense) => {
      const rawValue = priceInputs[expense.id];
      const nextAmount = Number(rawValue);
      if (!Number.isFinite(nextAmount) || nextAmount < 0) {
        setPriceErrors((current) => ({ ...current, [expense.id]: 'Skriv inn en gyldig pris.' }));
        return;
      }
      if (nextAmount === expense.amountPerMonth) {
        setPriceErrors((current) => ({ ...current, [expense.id]: 'Prisen er uendret.' }));
        return;
      }
      try {
        setIsUpdatingPriceId(expense.id);
        await api.updateFixedExpense(expense.id, { amountPerMonth: nextAmount });
        setPriceErrors((current) => ({ ...current, [expense.id]: '' }));
        setPriceInputs((current) => ({ ...current, [expense.id]: '' }));
        fetchExpenses();
      } catch (err) {
        setPriceErrors((current) => ({ ...current, [expense.id]: err.message }));
      } finally {
        setIsUpdatingPriceId(null);
      }
    },
    [priceInputs, fetchExpenses]
  );

  const handleResetPriceHistory = useCallback(
    async (expense) => {
      try {
        setIsResettingPriceId(expense.id);
        await api.resetFixedExpensePriceHistory(expense.id);
        setPriceErrors((current) => ({ ...current, [expense.id]: '' }));
        setPriceInputs((current) => ({ ...current, [expense.id]: '' }));
        fetchExpenses();
      } catch (err) {
        setPriceErrors((current) => ({ ...current, [expense.id]: err.message }));
      } finally {
        setIsResettingPriceId(null);
      }
    },
    [fetchExpenses]
  );

  const simulation = useMemo(() => {
    if (!simulatedExpense) return null;
    const categoryKey = simulatedExpense.category || 'Annet';
    const baselineIncludesExpense = !hiddenCategories.includes(categoryKey);
    const baselineTotal = baselineIncludesExpense ? totalPerMonth : fullTotalPerMonth;
    const savedMonthly = simulatedExpense.amountPerMonth || 0;
    const newTotal = baselineTotal - savedMonthly;
    return {
      current: baselineTotal,
      newTotal,
      savedMonthly,
      savedYearly: savedMonthly * 12
    };
  }, [simulatedExpense, totalPerMonth, fullTotalPerMonth, hiddenCategories]);



  return (
    <div className="fixed-expenses-page">
      <div className="section-header">
        <div>
          <h2>Faste utgifter</h2>
          {manualFilterActive && (
            <div className="filter-indicator">
              <span className="badge">Filtrert på {activeOwners.join(', ')}</span>
            </div>
          )}
        </div>
        <div className="section-actions">
          {hasManualOwnerSelection && (
            <button className="secondary" onClick={clearOwnerFilter}>
              Fjern filter
            </button>
          )}
          <button onClick={() => handleOpenForm(null)}>Ny fast utgift</button>
        </div>
      </div>
      {ownerOptions.length > 0 && (
        <div className="owner-filter-panel">
          <div className="owner-filter-panel-header">
            <p className="muted">
              Trykk på et navn for å velge hvilke personer du vil se utgiftene til. Standardvalget fra
              Innstillinger er markert automatisk.
            </p>
            {!hasManualOwnerSelection && defaultOwners.length > 0 && (
              <span className="badge">Standardvisning</span>
            )}
          </div>
          <div className="chip-list">
            {ownerOptions.map((owner) => (
              <button
                type="button"
                key={owner}
                className={`chip chip-button${activeOwners.includes(owner) ? ' chip-active' : ''}`}
                onClick={() => handleToggleOwnerFilter(owner)}
              >
                {owner}
              </button>
            ))}
          </div>
        </div>
      )}
        {error && <p className="error-text">{error}</p>}

      <div className="card-grid">
        <div className="card insight-card glow-lilac">
          <h3>Totale faste kostnader per måned</h3>
          <p className="stat">{formatCurrency(totalPerMonth)}</p>
          <p className="muted">
            {filteredExpenses.length} aktive avtaler
            {manualFilterActive && ` (av ${expenses.length})`}
            {hiddenCategories.length > 0 && (
              <>
                <br />
                Ekskluderer {hiddenCategories.join(', ')} via kategori-filteret.
              </>
            )}
          </p>
        </div>
        <div className="card insight-card glow-mint">
          <h3>Tilgjengelig etter faste kostnader</h3>
          {!netIncomeLoaded && <p className="muted">Henter netto inntekt…</p>}
          {netIncomeLoaded && hasIncomeValue && (
            <>
              <p className="stat" style={{ color: (freeAfterFixed ?? 0) >= 0 ? '#16a34a' : '#dc2626' }}>
                {formatCurrency(freeAfterFixed)}
              </p>
              <p className="muted">
                Basert på {incomeSourceDescription} og {filterDescription}.
                {showingDefaultOwnerIncome && ' (Standardvalg fra innstillinger.)'}
                {hiddenCategories.length > 0 && ' Viser kun valgte kategorier fra grafen.'}
              </p>
            </>
          )}
          {missingIncomeForOwner && (
            <p className="muted">
              Legg inn netto inntekt for {missingIncomeOwners.join(', ')} under Innstillinger.
            </p>
          )}
          {settingsError && <p className="error-text">{settingsError}</p>}
        </div>
        <div className="card insight-card glow-amber">
          <h3>Sum per kategori</h3>
          <div className="pill-list">
            {categoryTotals.length === 0 && <p className="muted">Ingen registrerte utgifter ennå.</p>}
            {categoryTotals.length > 0 && visibleCategoryTotals.length === 0 && (
              <p className="muted">Ingen kategorier er valgt i grafen akkurat nå.</p>
            )}
            {visibleCategoryTotals.map((item) => (
              <div key={item.category} className="pill-row">
                <span>{item.category}</span>
                <strong>{formatCurrency(item.total)}</strong>
              </div>
            ))}
          </div>
        </div>
        <div className="card insight-card glow-rose">
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

      <div className="card insight-card glow-ocean chart-card">
        <div className="section-header" style={{ marginTop: 0 }}>
          <h2>Fordeling per kategori</h2>
          {doughnutData && (
            <span className="badge">
              {visibleCategoryTotals.length === categoryTotals.length
                ? `${categoryTotals.length} kategorier`
                : `${visibleCategoryTotals.length}/${categoryTotals.length} kategorier`}
            </span>
          )}
        </div>
        {doughnutData ? (
          <div className="chart-wrapper">
            <Doughnut
              data={doughnutData}
              options={doughnutOptions}
            />
          </div>
        ) : (
          <p className="muted">Legg inn utgifter for å se grafen.</p>
        )}
      </div>

      <div className="card insight-card glow-sky analysis-card">
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
        <div className="section-actions" style={{ gap: '0.75rem' }}>
          <span>
            {filteredExpenses.length} avtaler
            {manualFilterActive && ` (av ${expenses.length})`}
          </span>
          <label className="muted" htmlFor="category-sort">
            Sorter
          </label>
          <select
            id="category-sort"
            value={categorySort}
            onChange={(event) => setCategorySort(event.target.value)}
          >
            {CATEGORY_SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="category-sections">
        {isLoadingExpenses && (
          <section className="category-section loading-section">
            <div className="category-section-header">
              <div className="skeleton skeleton-title" aria-hidden />
              <div className="category-total">
                <span className="skeleton skeleton-pill" aria-hidden />
              </div>
            </div>
            <div className="category-expense-list">
              {[1, 2, 3].map((placeholder) => (
                <div className="expense-entry skeleton-block" key={placeholder} aria-hidden>
                  <div className="skeleton skeleton-line" />
                  <div className="skeleton skeleton-line short" />
                </div>
              ))}
            </div>
          </section>
        )}
        {!isLoadingExpenses && groupedExpenses.length === 0 && (
          <p className="muted">Ingen registrerte utgifter ennå.</p>
        )}
        {!isLoadingExpenses &&
          groupedExpenses.map((group) => {
            const categoryStyle = getCategoryStyle(group.category);
            return (
              <section className="category-section" key={group.category} style={categoryStyle}>
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
                                    className={`chip chip-button${activeOwners.includes(owner) ? ' chip-active' : ''}`}
                                    key={owner}
                                    onClick={() => handleToggleOwnerFilter(owner)}
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
                      <div className="price-adjustment">
                        <label className="muted" htmlFor={`new-price-${expense.id}`}>
                          Ny pris
                        </label>
                        <div className="inline-form">
                          <input
                            id={`new-price-${expense.id}`}
                            type="number"
                            min="0"
                            step="1"
                            placeholder="Oppgi ny pris"
                            value={priceInputs[expense.id] ?? ''}
                            onChange={(event) => handleNewPriceChange(expense.id, event.target.value)}
                          />
                          <button
                            type="button"
                            onClick={() => handleSubmitNewPrice(expense)}
                            disabled={isUpdatingPriceId === expense.id}
                          >
                            {isUpdatingPriceId === expense.id ? 'Lagrer…' : 'Oppdater pris'}
                          </button>
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => handleResetPriceHistory(expense)}
                            disabled={isResettingPriceId === expense.id}
                          >
                            {isResettingPriceId === expense.id ? 'Resetter…' : 'Tilbakestill historikk'}
                          </button>
                        </div>
                        {priceErrors[expense.id] && <p className="error-text">{priceErrors[expense.id]}</p>}
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
            );
          })}
      </div>

      <div className="card insight-card glow-sand bulk-update-card">
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

      <div className="card insight-card glow-indigo chart-card">
        <div className="section-header" style={{ marginTop: 0 }}>
          <div>
            <h2>Prisendringer for faste utgifter</h2>
            <p className="muted">
              Registrer en «Ny pris» på en utgift for å følge utviklingen over tid. Du kan tilbakestille
              historikken for hver utgift dersom noe ble feil.
            </p>
          </div>
          {priceTrendExpenses.length > 0 && <span className="badge">{priceTrendExpenses.length} utgifter</span>}
        </div>
        {priceTrendChartData ? (
          <div className="chart-wrapper">
            <Line data={priceTrendChartData} options={priceTrendChartOptions} />
          </div>
        ) : (
          <p className="muted">Ingen prisendringer registrert ennå.</p>
        )}
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
        <Modal onClose={handleCloseSimulation}>
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
