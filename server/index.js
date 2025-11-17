const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const db = require('./db');

const FIXED_EXPENSE_LEVELS = ['Må-ha', 'Kjekt å ha', 'Luksus'];

const app = express();
const PORT = process.env.PORT || 4173;

app.use(cors());
app.use(express.json({ limit: '5mb' }));

const enrichTransaction = (tx) => {
  const categories = db.getCategories();
  const pages = db.getPages();
  const category = categories.find((c) => c.id === tx.categoryId);
  const page = pages.find((p) => p.id === tx.pageId);
  return {
    ...tx,
    categoryName: category?.name,
    pageName: page?.name
  };
};

const normalizeOwnersInput = (owners) => {
  if (!owners) return [];
  if (Array.isArray(owners)) {
    return owners.map((owner) => String(owner).trim()).filter(Boolean);
  }
  if (typeof owners === 'string') {
    return owners
      .split(',')
      .map((owner) => owner.trim())
      .filter(Boolean);
  }
  return [];
};

app.get('/api/categories', (req, res) => {
  res.json(db.getCategories());
});

app.post('/api/categories', (req, res) => {
  const { name, type = 'expense', color = '#4f46e5', description = '' } = req.body;
  if (!name) return res.status(400).json({ error: 'Kategori-navn er påkrevd.' });
  const category = db.addCategory({ name, type, color, description });
  res.status(201).json(category);
});

app.put('/api/categories/:id', (req, res) => {
  const { id } = req.params;
  const updated = db.updateCategory(id, req.body);
  if (!updated) return res.status(404).json({ error: 'Kategori ikke funnet' });
  res.json(updated);
});

app.delete('/api/categories/:id', (req, res) => {
  const { id } = req.params;
  const removed = db.deleteCategory(id);
  res.json({ deleted: removed });
});

app.get('/api/pages', (req, res) => {
  const transactions = db.getTransactions();
  const pages = db.getPages().map((page) => {
    const totals = transactions
      .filter((tx) => tx.pageId === page.id)
      .reduce(
        (acc, tx) => {
          if (tx.type === 'income') {
            acc.totalIncome += tx.amount;
            acc.balance += tx.amount;
          } else {
            acc.totalExpense += tx.amount;
            acc.balance -= tx.amount;
          }
          return acc;
        },
        { totalIncome: 0, totalExpense: 0, balance: 0 }
      );
    return { ...page, ...totals };
  });
  res.json(pages);
});

app.post('/api/pages', (req, res) => {
  const { name, description = '', color = '#059669', metadata = {} } = req.body;
  if (!name) return res.status(400).json({ error: 'Navn er påkrevd.' });
  const page = db.addPage({ name, description, color, metadata });
  res.status(201).json(page);
});

app.put('/api/pages/:id', (req, res) => {
  const { id } = req.params;
  const updated = db.updatePage(id, req.body);
  if (!updated) return res.status(404).json({ error: 'Side ikke funnet' });
  res.json(updated);
});

app.delete('/api/pages/:id', (req, res) => {
  const { id } = req.params;
  const removed = db.deletePage(id);
  res.json({ deleted: removed });
});

app.get('/api/transactions', (req, res) => {
  const { type, categoryId, tag, pageId, search, sortBy = 'occurredOn', order = 'DESC' } = req.query;
  let transactions = [...db.getTransactions()];

  if (type) transactions = transactions.filter((tx) => tx.type === type);
  if (categoryId) transactions = transactions.filter((tx) => String(tx.categoryId) === String(categoryId));
  if (pageId) transactions = transactions.filter((tx) => String(tx.pageId) === String(pageId));
  if (search) {
    const q = search.toLowerCase();
    transactions = transactions.filter(
      (tx) => tx.title.toLowerCase().includes(q) || tx.notes.toLowerCase().includes(q)
    );
  }
  if (tag) {
    transactions = transactions.filter((tx) => (tx.tags || []).some((t) => t.includes(tag)));
  }

  const sortFields = {
    occurredOn: (a, b) => new Date(a.occurredOn) - new Date(b.occurredOn),
    amount: (a, b) => a.amount - b.amount,
    title: (a, b) => a.title.localeCompare(b.title)
  };
  const sorter = sortFields[sortBy] || sortFields.occurredOn;
  transactions.sort(sorter);
  if (order.toUpperCase() === 'DESC') transactions.reverse();

  res.json(transactions.map(enrichTransaction));
});

app.post('/api/transactions', (req, res) => {
  const {
    title,
    amount,
    type,
    categoryId = null,
    pageId = null,
    tags = [],
    occurredOn,
    notes = '',
    metadata = {}
  } = req.body;
  if (!title || !amount || !type || !occurredOn) {
    return res.status(400).json({ error: 'Tittel, beløp, type og dato er påkrevd.' });
  }
  const transaction = db.addTransaction({
    title,
    amount,
    type,
    categoryId: categoryId ? Number(categoryId) : null,
    pageId: pageId ? Number(pageId) : null,
    tags,
    occurredOn,
    notes,
    metadata
  });
  res.status(201).json(enrichTransaction(transaction));
});

app.put('/api/transactions/:id', (req, res) => {
  const { id } = req.params;
  const updated = db.updateTransaction(id, {
    ...req.body,
    categoryId: req.body.categoryId ? Number(req.body.categoryId) : null,
    pageId: req.body.pageId ? Number(req.body.pageId) : null
  });
  if (!updated) return res.status(404).json({ error: 'Transaksjon ikke funnet' });
  res.json(enrichTransaction(updated));
});

app.delete('/api/transactions/:id', (req, res) => {
  const { id } = req.params;
  const removed = db.deleteTransaction(id);
  res.json({ deleted: removed });
});

app.delete('/api/transactions', (req, res) => {
  const deleted = db.clearTransactions();
  res.json({ deleted });
});

app.get('/api/faste-utgifter', (req, res) => {
  res.json(db.getFixedExpenses());
});

app.post('/api/faste-utgifter', (req, res) => {
  const {
    name,
    amountPerMonth,
    category = 'Annet',
    owners = [],
    level = 'Må-ha',
    startDate = '',
    bindingEndDate = '',
    noticePeriodMonths = null,
    note = ''
  } = req.body;

  if (!name) return res.status(400).json({ error: 'Navn er påkrevd.' });
  if (amountPerMonth === undefined || Number.isNaN(Number(amountPerMonth))) {
    return res.status(400).json({ error: 'Beløp per måned må være et tall.' });
  }
  if (!FIXED_EXPENSE_LEVELS.includes(level)) {
    return res.status(400).json({ error: 'Ugyldig nivå.' });
  }
  const noticeValue =
    noticePeriodMonths === null || noticePeriodMonths === ''
      ? null
      : Number(noticePeriodMonths);
  if (noticeValue !== null && Number.isNaN(noticeValue)) {
    return res.status(400).json({ error: 'Oppsigelsestid må være et tall eller tom.' });
  }

  const expense = db.addFixedExpense({
    name,
    amountPerMonth,
    category: typeof category === 'string' && category.trim() ? category.trim() : 'Annet',
    owners: normalizeOwnersInput(owners),
    level,
    startDate,
    bindingEndDate,
    noticePeriodMonths: noticeValue,
    note
  });
  res.status(201).json(expense);
});

app.put('/api/faste-utgifter/:id', (req, res) => {
  const { id } = req.params;
  const { category, level, noticePeriodMonths, owners } = req.body;
  if (level && !FIXED_EXPENSE_LEVELS.includes(level)) {
    return res.status(400).json({ error: 'Ugyldig nivå.' });
  }
  const update = { ...req.body };
  if (category !== undefined) {
    update.category = typeof category === 'string' && category.trim() ? category.trim() : 'Annet';
  }
  if (req.body.amountPerMonth !== undefined && Number.isNaN(Number(req.body.amountPerMonth))) {
    return res.status(400).json({ error: 'Beløp per måned må være et tall.' });
  }
  if (noticePeriodMonths !== undefined) {
    if (noticePeriodMonths === null || noticePeriodMonths === '') {
      update.noticePeriodMonths = null;
    } else if (Number.isNaN(Number(noticePeriodMonths))) {
      return res.status(400).json({ error: 'Oppsigelsestid må være et tall.' });
    }
  }
  if (owners !== undefined) {
    update.owners = normalizeOwnersInput(owners);
  }
  const updated = db.updateFixedExpense(id, update);
  if (!updated) return res.status(404).json({ error: 'Fast utgift ikke funnet' });
  res.json(updated);
});

app.delete('/api/faste-utgifter/:id', (req, res) => {
  const { id } = req.params;
  const deleted = db.deleteFixedExpense(id);
  res.json({ deleted });
});

app.get('/api/settings', (req, res) => {
  res.json(db.getSettings());
});

app.put('/api/settings', (req, res) => {
  const { monthlyNetIncome = 0 } = req.body;
  const value = Number(monthlyNetIncome);
  if (!Number.isFinite(value) || value < 0) {
    return res.status(400).json({ error: 'Netto inntekt må være et ikke-negativt tall.' });
  }
  const updated = db.updateSettings({ monthlyNetIncome: value });
  res.json(updated);
});

app.get('/api/dashboard', (req, res) => {
  const transactions = db.getTransactions();
  const categories = db.getCategories();
  const pages = db.getPages();
  const fixedExpenses = db.getFixedExpenses();
  const settings = db.getSettings();

  const totalIncome = transactions
    .filter((tx) => tx.type === 'income')
    .reduce((sum, tx) => sum + tx.amount, 0);
  const totalExpense = transactions
    .filter((tx) => tx.type === 'expense')
    .reduce((sum, tx) => sum + tx.amount, 0);

  const fixedExpenseTotal = fixedExpenses.reduce((sum, expense) => sum + (expense.amountPerMonth || 0), 0);

  const fixedCategoryTotalsMap = {};
  fixedExpenses.forEach((expense) => {
    const key = expense.category || 'Annet';
    if (!fixedCategoryTotalsMap[key]) fixedCategoryTotalsMap[key] = 0;
    fixedCategoryTotalsMap[key] += expense.amountPerMonth || 0;
  });
  const fixedExpenseCategoryTotals = Object.entries(fixedCategoryTotalsMap)
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total);

  const fixedLevelTotalsMap = {};
  fixedExpenses.forEach((expense) => {
    const key = expense.level || 'Må-ha';
    if (!fixedLevelTotalsMap[key]) fixedLevelTotalsMap[key] = 0;
    fixedLevelTotalsMap[key] += expense.amountPerMonth || 0;
  });
  const fixedExpenseLevelTotals = Object.entries(fixedLevelTotalsMap)
    .map(([level, total]) => ({ level, total }))
    .sort((a, b) => b.total - a.total);

  const now = Date.now();
  const ninetyDays = 90 * 24 * 60 * 60 * 1000;
  const bindingExpirations = fixedExpenses
    .filter((expense) => expense.bindingEndDate)
    .map((expense) => {
      const bindingTime = new Date(expense.bindingEndDate).getTime();
      const daysLeft = Math.ceil((bindingTime - now) / (1000 * 60 * 60 * 24));
      return {
        id: expense.id,
        name: expense.name,
        bindingEndDate: expense.bindingEndDate,
        category: expense.category,
        amountPerMonth: expense.amountPerMonth,
        daysLeft
      };
    })
    .filter((item) => item.daysLeft >= 0 && item.daysLeft <= 90)
    .sort((a, b) => new Date(a.bindingEndDate) - new Date(b.bindingEndDate));

  const monthlyNetIncome = Number(settings.monthlyNetIncome) || 0;
  const freeAfterFixed = monthlyNetIncome - fixedExpenseTotal;

  const categoryTotals = categories.map((category) => ({
    ...category,
    total: transactions
      .filter((tx) => tx.categoryId === category.id && tx.type === 'expense')
      .reduce((sum, tx) => sum + tx.amount, 0)
  }));

  const monthlyMap = {};
  transactions.forEach((tx) => {
    const period = tx.occurredOn.slice(0, 7);
    if (!monthlyMap[period]) monthlyMap[period] = { period, income: 0, expenses: 0 };
    if (tx.type === 'income') monthlyMap[period].income += tx.amount;
    else monthlyMap[period].expenses += tx.amount;
  });
  const monthly = Object.values(monthlyMap).sort((a, b) => a.period.localeCompare(b.period));

  const tagTotals = {};
  transactions.forEach((tx) => {
    (tx.tags || []).forEach((tag) => {
      if (!tagTotals[tag]) tagTotals[tag] = 0;
      tagTotals[tag] += tx.type === 'expense' ? -tx.amount : tx.amount;
    });
  });

  const pageBalances = pages.map((page) => {
    const totals = transactions
      .filter((tx) => tx.pageId === page.id)
      .reduce(
        (acc, tx) => {
          if (tx.type === 'income') {
            acc.totalIncome += tx.amount;
            acc.balance += tx.amount;
          } else {
            acc.totalExpense += tx.amount;
            acc.balance -= tx.amount;
          }
          return acc;
        },
        { balance: 0, totalIncome: 0, totalExpense: 0 }
      );
    return { name: page.name, ...totals };
  });

  res.json({
    totalIncome,
    totalExpense,
    net: totalIncome - totalExpense,
    categoryTotals,
    monthly,
    tagTotals,
    pageBalances,
    fixedExpenseTotal,
    fixedExpenseCategoryTotals,
    fixedExpenseLevelTotals,
    monthlyNetIncome,
    freeAfterFixed,
    bindingExpirations,
    fixedExpensesCount: fixedExpenses.length
  });
});

app.get('/api/export', (req, res) => {
  const state = db.getState();
  const payload = {
    categories: state.categories,
    pages: state.pages,
    transactions: state.transactions,
    fixedExpenses: state.fixedExpenses || [],
    settings: state.settings || {},
    counters: state.counters
  };
  res.json(payload);
});

app.post('/api/import', (req, res) => {
  try {
    const { categories = [], pages = [], transactions = [], fixedExpenses = [], settings = {}, counters = null } = req.body;
    const payload = {
      categories,
      pages,
      transactions,
      fixedExpenses,
      settings,
      counters: counters || undefined
    };
    db.replaceAll(payload);
    if (typeof db.ensureDefaults === 'function') {
      db.ensureDefaults();
    }
    res.json({ status: 'ok' });
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: 'Import feilet', details: error.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

const clientDir = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDir)) {
  app.use(express.static(clientDir));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDir, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Budsjett-server kjører på port ${PORT}`);
});
