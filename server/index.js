const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { nanoid } = require('nanoid');
const db = require('./db');

const FIXED_EXPENSE_LEVELS = ['Må-ha', 'Kjekt å ha', 'Luksus'];

const app = express();
const PORT = process.env.PORT || 4173;
const LOCK_COOKIE_NAME = 'budsjett_lock';
const LOCK_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const activeLockTokens = new Map();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '5mb' }));

const hashLockPassword = (password, salt) =>
  crypto.scryptSync(String(password), String(salt), 64).toString('hex');

const sanitizeSettings = (settings) => {
  const { lockHash, lockSalt, ...rest } = settings;
  const lockEnabled = Boolean(settings.lockEnabled && settings.lockHash && settings.lockSalt);
  return { ...rest, lockEnabled };
};

const isLockEnabled = () => {
  const settings = db.getSettings();
  return Boolean(settings.lockEnabled && settings.lockHash && settings.lockSalt);
};

const verifyLockPassword = (password) => {
  if (!password) return false;
  const settings = db.getSettings();
  if (!settings.lockHash || !settings.lockSalt) return false;
  try {
    const hashed = hashLockPassword(password, settings.lockSalt);
    return crypto.timingSafeEqual(Buffer.from(hashed, 'hex'), Buffer.from(settings.lockHash, 'hex'));
  } catch (err) {
    return false;
  }
};

const getCookies = (req) => {
  const header = req.headers.cookie;
  if (!header) return {};
  return header.split(';').reduce((acc, pair) => {
    const [key, value] = pair.split('=').map((part) => part && part.trim());
    if (key) acc[key] = decodeURIComponent(value || '');
    return acc;
  }, {});
};

const readLockToken = (req) => {
  const cookies = getCookies(req);
  return req.headers['x-budsjett-lock'] || cookies[LOCK_COOKIE_NAME] || '';
};

const isValidLockToken = (token) => {
  if (!token) return false;
  const expires = activeLockTokens.get(token);
  if (!expires) return false;
  if (Date.now() > expires) {
    activeLockTokens.delete(token);
    return false;
  }
  return true;
};

const issueLockToken = (res) => {
  const token = nanoid(32);
  const expires = Date.now() + LOCK_TOKEN_TTL_MS;
  activeLockTokens.set(token, expires);
  res.cookie(LOCK_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: LOCK_TOKEN_TTL_MS
  });
  return token;
};

const invalidateLockTokens = () => {
  activeLockTokens.clear();
};

app.use((req, res, next) => {
  if (!req.path.startsWith('/api')) return next();
  if (!isLockEnabled()) return next();
  if (req.path.startsWith('/api/lock')) return next();
  const token = readLockToken(req);
  if (isValidLockToken(token)) return next();
  return res.status(401).json({ error: 'Siden er låst. Oppgi passord.' });
});

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

const normalizeName = (value) => (typeof value === 'string' ? value.trim() : '');

app.get('/api/lock/status', (req, res) => {
  const enabled = isLockEnabled();
  const unlocked = !enabled || isValidLockToken(readLockToken(req));
  res.json({ enabled, unlocked });
});

app.post('/api/lock/unlock', (req, res) => {
  const { password } = req.body || {};
  if (!isLockEnabled()) {
    return res.status(400).json({ error: 'Låsen er ikke aktivert.' });
  }
  if (!verifyLockPassword(password)) {
    return res.status(401).json({ error: 'Feil passord.' });
  }
  issueLockToken(res);
  res.json({ unlocked: true });
});

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
    account = '',
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
    account: typeof account === 'string' ? account.trim() : '',
    level,
    startDate,
    bindingEndDate,
    noticePeriodMonths: noticeValue,
    note
  });
  res.status(201).json(expense);
});

app.post('/api/faste-utgifter/bulk-owners', (req, res) => {
  const owners = normalizeOwnersInput(req.body.owners ?? req.body.owner ?? '');
  if (!owners.length) {
    return res.status(400).json({ error: 'Minst én eier må oppgis.' });
  }
  const result = db.bulkAddOwnersToFixedExpenses(owners);
  res.json(result);
});

app.put('/api/faste-utgifter/:id', (req, res) => {
  const { id } = req.params;
  const { category, level, noticePeriodMonths, owners, account } = req.body;
  if (level && !FIXED_EXPENSE_LEVELS.includes(level)) {
    return res.status(400).json({ error: 'Ugyldig nivå.' });
  }
  const update = { ...req.body };
  if (category !== undefined) {
    update.category = typeof category === 'string' && category.trim() ? category.trim() : 'Annet';
  }
  if (account !== undefined) {
    update.account = typeof account === 'string' ? account.trim() : '';
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

app.post('/api/faste-utgifter/:id/reset-price-history', (req, res) => {
  const { id } = req.params;
  const updated = db.resetFixedExpensePriceHistory(id);
  if (!updated) return res.status(404).json({ error: 'Fast utgift ikke funnet' });
  res.json(updated);
});

app.delete('/api/faste-utgifter/:id', (req, res) => {
  const { id } = req.params;
  const deleted = db.deleteFixedExpense(id);
  res.json({ deleted });
});

app.get('/api/settings', (req, res) => {
  const settings = sanitizeSettings(db.getSettings());
  res.json(settings);
});

app.put('/api/settings', (req, res) => {
  const {
    monthlyNetIncome,
    ownerProfiles,
    defaultFixedExpensesOwner,
    defaultFixedExpensesOwners,
    bankAccounts,
    bankModeEnabled,
    lockPassword,
    lockEnabled,
    lockCurrentPassword
  } = req.body || {};
  const update = {};
  const currentlyLocked = isLockEnabled();
  let shouldInvalidateLockSessions = false;
  const currentSettings = db.getSettings();
  const currentBankAccounts = Array.isArray(currentSettings.bankAccounts)
    ? currentSettings.bankAccounts
    : [];

  if (monthlyNetIncome !== undefined) {
    const value = Number(monthlyNetIncome);
    if (!Number.isFinite(value) || value < 0) {
      return res.status(400).json({ error: 'Netto inntekt må være et ikke-negativt tall.' });
    }
    update.monthlyNetIncome = value;
  }

  if (ownerProfiles !== undefined) {
    if (!Array.isArray(ownerProfiles)) {
      return res.status(400).json({ error: 'Personer må sendes som en liste.' });
    }
    const validAccounts = new Set(
      Array.isArray(bankAccounts)
        ? bankAccounts
            .filter((name) => typeof name === 'string')
            .map((name) => name.trim())
            .filter(Boolean)
        : currentBankAccounts
    );
    const sanitizedProfiles = [];
    for (const profile of ownerProfiles) {
      if (!profile || typeof profile.name !== 'string') continue;
      const name = profile.name.trim();
      if (!name) continue;
      const income = Number(profile.monthlyNetIncome);
      if (!Number.isFinite(income) || income < 0) {
        return res
          .status(400)
          .json({ error: 'Netto inntekt for hver person må være et ikke-negativt tall.' });
      }
      const sharedContribution = Number(profile.sharedContribution ?? profile.sharedContributionPerMonth ?? 0);
      if (!Number.isFinite(sharedContribution) || sharedContribution < 0) {
        return res
          .status(400)
          .json({ error: 'Bidrag til felleskonto må være et ikke-negativt tall.' });
      }
      const bankContributions = {};
      if (profile && typeof profile.bankContributions === 'object') {
        Object.entries(profile.bankContributions).forEach(([account, value]) => {
          if (typeof account !== 'string') return;
          const trimmed = account.trim();
          const numeric = Number(value);
          if (!trimmed || !Number.isFinite(numeric) || numeric < 0) return;
          if (validAccounts.size === 0 || validAccounts.has(trimmed)) {
            bankContributions[trimmed] = numeric;
          }
        });
      }
      const totalBankContribution = Object.values(bankContributions).reduce(
        (sum, value) => sum + (Number.isFinite(value) ? Number(value) : 0),
        0
      );
      sanitizedProfiles.push({
        name,
        monthlyNetIncome: income,
        sharedContribution: totalBankContribution > 0 ? totalBankContribution : sharedContribution,
        bankContributions
      });
    }
    update.ownerProfiles = sanitizedProfiles;
  }

  if (defaultFixedExpensesOwners !== undefined) {
    if (!Array.isArray(defaultFixedExpensesOwners)) {
      return res
        .status(400)
        .json({ error: 'Standardvisning må være en liste med navn.' });
    }
    const sanitized = Array.from(
      new Set(
        defaultFixedExpensesOwners
          .filter((name) => typeof name === 'string')
          .map((name) => name.trim())
          .filter(Boolean)
      )
    );
    update.defaultFixedExpensesOwners = sanitized;
  }

  if (defaultFixedExpensesOwner !== undefined && defaultFixedExpensesOwners === undefined) {
    if (defaultFixedExpensesOwner === null || defaultFixedExpensesOwner === '') {
      update.defaultFixedExpensesOwners = [];
    } else if (typeof defaultFixedExpensesOwner === 'string') {
      update.defaultFixedExpensesOwners = [defaultFixedExpensesOwner.trim()];
    } else {
      return res
        .status(400)
        .json({ error: 'Standardvisning må være et navn eller tom verdi.' });
    }
  }

  if (bankModeEnabled !== undefined) {
    update.bankModeEnabled = Boolean(bankModeEnabled);
  }

  if (bankAccounts !== undefined) {
    if (!Array.isArray(bankAccounts)) {
      return res.status(400).json({ error: 'Bankkontoer må sendes som en liste.' });
    }
    const sanitizedAccounts = Array.from(
      new Set(
        bankAccounts
          .filter((name) => typeof name === 'string')
          .map((name) => name.trim())
          .filter(Boolean)
      )
    );
    update.bankAccounts = sanitizedAccounts;
  }

  if (lockPassword !== undefined) {
    if (typeof lockPassword !== 'string' || lockPassword.trim().length < 6) {
      return res.status(400).json({ error: 'Passordet må være minst 6 tegn langt.' });
    }
    if (currentlyLocked && !verifyLockPassword(lockCurrentPassword || '')) {
      return res.status(401).json({ error: 'Feil nåværende passord.' });
    }
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = hashLockPassword(lockPassword.trim(), salt);
    update.lockEnabled = true;
    update.lockSalt = salt;
    update.lockHash = hash;
    shouldInvalidateLockSessions = true;
  }

  if (lockEnabled === false) {
    if (currentlyLocked && !verifyLockPassword(lockCurrentPassword || '')) {
      return res.status(401).json({ error: 'Feil nåværende passord.' });
    }
    update.lockEnabled = false;
    update.lockSalt = '';
    update.lockHash = '';
    shouldInvalidateLockSessions = true;
  } else if (lockEnabled === true && lockPassword === undefined && !currentlyLocked) {
    return res.status(400).json({ error: 'Velg et passord for å aktivere låsen.' });
  } else if (lockEnabled === true && lockPassword === undefined && currentlyLocked) {
    update.lockEnabled = true;
  }

  const updated = db.updateSettings(update);
  const sanitizedSettings = sanitizeSettings(updated);
  if (shouldInvalidateLockSessions) {
    invalidateLockTokens();
    if (sanitizedSettings.lockEnabled) {
      issueLockToken(res);
    } else {
      res.clearCookie(LOCK_COOKIE_NAME);
    }
  }
  res.json(sanitizedSettings);
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

  const ownerProfiles = settings.ownerProfiles || [];
  const ownerIncomeMap = ownerProfiles.reduce((map, profile) => {
    if (profile?.name) {
      const income = Number(profile.monthlyNetIncome);
      if (Number.isFinite(income)) {
        map.set(profile.name, income);
      }
    }
    return map;
  }, new Map());
  const ownerContributionMap = ownerProfiles.reduce((map, profile) => {
    if (profile?.name) {
      const contribution = Number(profile.sharedContribution);
      if (Number.isFinite(contribution)) {
        map.set(profile.name, contribution);
      }
    }
    return map;
  }, new Map());
  const defaultOwners = Array.isArray(settings.defaultFixedExpensesOwners)
    ? settings.defaultFixedExpensesOwners.filter(Boolean)
    : [];
  const bankModeEnabled = Boolean(settings.bankModeEnabled);
  const participatingOwners = defaultOwners.length
    ? defaultOwners
    : Array.from(new Set(ownerProfiles.map((profile) => profile.name).filter(Boolean)));
  const filteredFixedExpenses = defaultOwners.length
    ? fixedExpenses.filter((expense) =>
        (expense.owners || []).some((owner) => defaultOwners.includes(owner))
      )
    : fixedExpenses;
  const effectiveFixedExpenseTotal = filteredFixedExpenses.reduce(
    (sum, expense) => sum + (expense.amountPerMonth || 0),
    0
  );

  const categoryColorMap = categories.reduce((map, category) => {
    map[category.name] = category.color;
    return map;
  }, {});

  const fixedCategoryTotalsMap = {};
  filteredFixedExpenses.forEach((expense) => {
    const key = expense.category || 'Annet';
    if (!fixedCategoryTotalsMap[key]) fixedCategoryTotalsMap[key] = 0;
    fixedCategoryTotalsMap[key] += expense.amountPerMonth || 0;
  });
  const fixedExpenseCategoryTotals = Object.entries(fixedCategoryTotalsMap)
    .map(([category, total]) => ({
      category,
      total,
      color: categoryColorMap[category] || '#94a3b8'
    }))
    .sort((a, b) => b.total - a.total);

  const fixedLevelTotalsMap = {};
  filteredFixedExpenses.forEach((expense) => {
    const key = expense.level || 'Må-ha';
    if (!fixedLevelTotalsMap[key]) fixedLevelTotalsMap[key] = 0;
    fixedLevelTotalsMap[key] += expense.amountPerMonth || 0;
  });
  const fixedExpenseLevelTotals = Object.entries(fixedLevelTotalsMap)
    .map(([level, total]) => ({ level, total }))
    .sort((a, b) => b.total - a.total);

  const now = Date.now();
  const ninetyDays = 90 * 24 * 60 * 60 * 1000;
  const bindingExpirations = filteredFixedExpenses
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

  const fixedExpensePriceHistory = filteredFixedExpenses
    .map((expense) => ({
      id: expense.id,
      name: expense.name,
      category: expense.category,
      color: categoryColorMap[expense.category] || '#94a3b8',
      priceHistory: (expense.priceHistory || [])
        .map((entry) => ({
          amount: Number(entry.amount) || 0,
          changedAt: entry.changedAt
        }))
        .filter((entry) => entry.changedAt)
        .sort((a, b) => new Date(a.changedAt) - new Date(b.changedAt))
    }))
    .filter((item) => item.priceHistory.length > 1);

  const monthlyNetIncome = Number(settings.monthlyNetIncome) || 0;
  const ownersHaveCompleteIncome = defaultOwners.every((owner) => ownerIncomeMap.has(owner));
  const ownerIncome = defaultOwners.reduce(
    (sum, owner) => sum + (ownerIncomeMap.get(owner) || 0),
    0
  );
  const bankModeOwnerStats = participatingOwners.map((owner) => {
    const monthlyNetIncome = ownerIncomeMap.get(owner) || 0;
    const sharedContribution = ownerContributionMap.get(owner) || 0;
    return {
      name: owner,
      monthlyNetIncome,
      sharedContribution,
      remainingPersonal: monthlyNetIncome - sharedContribution
    };
  });
  const bankModeTotalIncome = bankModeOwnerStats.reduce(
    (sum, owner) => sum + (owner.monthlyNetIncome || 0),
    0
  );
  const bankModeTotalContribution = bankModeOwnerStats.reduce(
    (sum, owner) => sum + (owner.sharedContribution || 0),
    0
  );
  const activeMonthlyNetIncome = bankModeEnabled
    ? bankModeTotalContribution
    : defaultOwners.length && ownersHaveCompleteIncome
    ? ownerIncome
    : monthlyNetIncome;
  const freeAfterFixed = activeMonthlyNetIncome - effectiveFixedExpenseTotal;
  const bankModeFreeAfterFixed = bankModeTotalContribution - effectiveFixedExpenseTotal;
  const bankModeRemainingPersonal = bankModeOwnerStats.reduce(
    (sum, owner) => sum + (owner.remainingPersonal || 0),
    0
  );

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
    activeMonthlyNetIncome,
    freeAfterFixed,
    bankModeSummary: {
      enabled: bankModeEnabled,
      totalIncome: bankModeTotalIncome,
      totalContribution: bankModeTotalContribution,
      freeAfterFixed: bankModeFreeAfterFixed,
      remainingPersonal: bankModeRemainingPersonal,
      owners: bankModeOwnerStats
    },
    effectiveFixedExpenseTotal,
    bindingExpirations,
    fixedExpensesCount: fixedExpenses.length,
    fixedExpensePriceHistory
  });
});

app.post('/api/owners/rename', (req, res) => {
  const from = normalizeName(req.body.from ?? req.body.oldName);
  const to = normalizeName(req.body.to ?? req.body.newName);

  if (!from || !to) {
    return res.status(400).json({ error: 'Både gammelt og nytt navn må fylles ut.' });
  }
  if (from === to) {
    return res.status(400).json({ error: 'Navnet er uendret.' });
  }

  const result = db.renameOwner(from, to);
  if (!result.changed) {
    return res.status(404).json({ error: 'Fant ikke personen du ville oppdatere.' });
  }

  res.json(result);
});

app.post('/api/owners/delete', (req, res) => {
  const name = normalizeName(req.body.name ?? req.body.owner);
  if (!name) {
    return res.status(400).json({ error: 'Navn må fylles ut for å fjerne en person.' });
  }

  const result = db.deleteOwner(name);
  if (!result.changed) {
    return res.status(404).json({ error: 'Fant ingen person med dette navnet.' });
  }

  res.json(result);
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
