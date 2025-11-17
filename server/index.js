const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const db = require('./db');

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
  const pages = db.getPages().map((page) => {
    const balance = db
      .getTransactions()
      .filter((tx) => tx.pageId === page.id)
      .reduce((sum, tx) => sum + (tx.type === 'expense' ? -tx.amount : tx.amount), 0);
    return { ...page, balance };
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

app.get('/api/dashboard', (req, res) => {
  const transactions = db.getTransactions();
  const categories = db.getCategories();
  const pages = db.getPages();

  const totalIncome = transactions
    .filter((tx) => tx.type === 'income')
    .reduce((sum, tx) => sum + tx.amount, 0);
  const totalExpense = transactions
    .filter((tx) => tx.type === 'expense')
    .reduce((sum, tx) => sum + tx.amount, 0);

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

  const pageBalances = pages.map((page) => ({
    name: page.name,
    balance: transactions
      .filter((tx) => tx.pageId === page.id)
      .reduce((sum, tx) => sum + (tx.type === 'expense' ? -tx.amount : tx.amount), 0)
  }));

  res.json({
    totalIncome,
    totalExpense,
    net: totalIncome - totalExpense,
    categoryTotals,
    monthly,
    tagTotals,
    pageBalances
  });
});

app.get('/api/export', (req, res) => {
  const state = db.getState();
  const payload = {
    categories: state.categories,
    pages: state.pages,
    transactions: state.transactions,
    counters: state.counters
  };
  res.json(payload);
});

app.post('/api/import', (req, res) => {
  try {
    const { categories = [], pages = [], transactions = [], counters = null } = req.body;
    const payload = {
      categories,
      pages,
      transactions,
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
