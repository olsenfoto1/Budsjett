const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
const dataPath = path.join(dataDir, 'store.json');

const DEFAULT_SETTINGS = {
  monthlyNetIncome: 0,
  ownerProfiles: [],
  defaultFixedExpensesOwner: '',
  defaultFixedExpensesOwners: [],
  lockEnabled: false,
  lockSalt: '',
  lockHash: ''
};

const defaultData = {
  categories: [],
  pages: [],
  transactions: [],
  fixedExpenses: [],
  settings: { ...DEFAULT_SETTINGS },
  counters: {
    categories: 0,
    pages: 0,
    transactions: 0,
    fixedExpenses: 0
  }
};

const uniqueOwnerList = (owners = []) =>
  Array.from(
    new Set(
      owners
        .filter((owner) => typeof owner === 'string')
        .map((owner) => owner.trim())
        .filter(Boolean)
    )
  );

class Store {
  constructor() {
    this.state = this.load();
    this.ensureDefaults();
  }

  getState() {
    return this.state;
  }

  load() {
    if (!fs.existsSync(dataPath)) {
      return JSON.parse(JSON.stringify(defaultData));
    }
    try {
      const raw = fs.readFileSync(dataPath, 'utf8');
      return JSON.parse(raw);
    } catch (error) {
      console.error('Klarte ikke å lese lagringsfil, bruker default.', error);
      return JSON.parse(JSON.stringify(defaultData));
    }
  }

  save() {
    fs.writeFileSync(dataPath, JSON.stringify(this.state, null, 2));
  }

  ensureDefaults() {
    if (!this.state.counters) {
      this.state.counters = { ...defaultData.counters };
    }

    if (!this.state.settings) {
      this.state.settings = { ...DEFAULT_SETTINGS };
    } else {
      this.state.settings.monthlyNetIncome = Number(this.state.settings.monthlyNetIncome) || 0;
      this.state.settings.ownerProfiles = this.normalizeOwnerProfiles(this.state.settings.ownerProfiles || []);
      if (!Array.isArray(this.state.settings.defaultFixedExpensesOwners)) {
        this.state.settings.defaultFixedExpensesOwners = [];
      }
      this.state.settings.defaultFixedExpensesOwners = this.normalizeDefaultOwnerList(
        this.state.settings.defaultFixedExpensesOwners
      );
      const legacyDefault =
        typeof this.state.settings.defaultFixedExpensesOwner === 'string'
          ? this.state.settings.defaultFixedExpensesOwner.trim()
          : '';
      if (legacyDefault && !this.state.settings.defaultFixedExpensesOwners.length) {
        this.state.settings.defaultFixedExpensesOwners = [legacyDefault];
      }
      this.state.settings.defaultFixedExpensesOwner =
        this.state.settings.defaultFixedExpensesOwners[0] || '';

      if (typeof this.state.settings.lockEnabled !== 'boolean') {
        this.state.settings.lockEnabled = false;
      }
      if (typeof this.state.settings.lockSalt !== 'string') {
        this.state.settings.lockSalt = '';
      }
      if (typeof this.state.settings.lockHash !== 'string') {
        this.state.settings.lockHash = '';
      }
      if (!this.state.settings.lockEnabled) {
        this.state.settings.lockSalt = '';
        this.state.settings.lockHash = '';
      }
    }

    if (!Array.isArray(this.state.fixedExpenses)) {
      this.state.fixedExpenses = [];
    }

    this.state.fixedExpenses = this.state.fixedExpenses.map((expense, index) =>
      this.normalizeFixedExpense(expense, index + 1)
    );

    const highestFixedId = Math.max(0, ...this.state.fixedExpenses.map((exp) => exp.id || 0));
    this.state.counters.fixedExpenses = Math.max(this.state.counters.fixedExpenses || 0, highestFixedId);

    if (!this.state.categories.length) {
      const defaults = [
        { name: 'Lønn', type: 'income', color: '#22c55e', description: 'Inntekter og lønn' },
        { name: 'Abonnementer', type: 'expense', color: '#6366f1', description: 'Faste abonnementer' },
        { name: 'Lån', type: 'expense', color: '#f97316', description: 'Lån og kreditt' },
        { name: 'Sparing', type: 'expense', color: '#14b8a6', description: 'Sparing og investering' }
      ];
      defaults.forEach((cat) => this.addCategory(cat));
    }
  }

  normalizeFixedExpense(raw = {}, fallbackId = 0) {
    const toOwners = (value) => {
      if (Array.isArray(value)) return value.filter((owner) => !!owner?.trim()).map((owner) => owner.trim());
      if (typeof value === 'string') {
        return value
          .split(',')
          .map((owner) => owner.trim())
          .filter(Boolean);
      }
      return [];
    };

    const now = new Date().toISOString();
    const amount = Number(raw.amountPerMonth ?? raw.beløp_per_mnd ?? raw.amount_per_mnd ?? raw.amount ?? 0) || 0;
    const priceHistory = Array.isArray(raw.priceHistory)
      ? raw.priceHistory
          .map((entry) => ({
            amount: Number(entry?.amount ?? entry?.price ?? entry?.beløp ?? entry?.value),
            changedAt: entry?.changedAt || entry?.date || entry?.timestamp
          }))
          .filter((entry) => Number.isFinite(entry.amount) && entry.changedAt)
          .sort((a, b) => new Date(a.changedAt) - new Date(b.changedAt))
      : [];
    const lastChanged = raw.updatedAt || raw.createdAt || now;
    if (!priceHistory.length) {
      priceHistory.push({ amount, changedAt: lastChanged });
    } else {
      const latest = priceHistory[priceHistory.length - 1];
      if (latest.amount !== amount) {
        priceHistory.push({ amount, changedAt: lastChanged });
      }
    }
    const notice = raw.noticePeriodMonths ?? raw.oppsigelsestid_mnd;
    return {
      id: raw.id ?? fallbackId,
      name: raw.name || raw.navn || 'Uten navn',
      amountPerMonth: amount,
      category: raw.category || raw.kategori || 'Annet',
      owners: toOwners(raw.owners || raw.eier || raw.eiere),
      level: raw.level || raw.nivå || 'Må-ha',
      startDate: raw.startDate || raw.startdato || '',
      bindingEndDate: raw.bindingEndDate || raw.binding_utløper || raw.sluttdato || '',
      noticePeriodMonths:
        notice === null || notice === undefined || notice === '' ? null : Number(notice) || 0,
      note: raw.note || raw.notat || '',
      createdAt: raw.createdAt || now,
      updatedAt: raw.updatedAt || now,
      priceHistory
    };
  }

  normalizeOwnerProfiles(rawProfiles = []) {
    if (!Array.isArray(rawProfiles)) return [];
    const map = new Map();
    rawProfiles.forEach((profile) => {
      if (!profile || typeof profile.name !== 'string') return;
      const name = profile.name.trim();
      if (!name) return;
      const value = Number(profile.monthlyNetIncome);
      const income = Number.isFinite(value) && value >= 0 ? value : 0;
      map.set(name, income);
    });
    return Array.from(map.entries()).map(([name, monthlyNetIncome]) => ({ name, monthlyNetIncome }));
  }

  normalizeDefaultOwnerList(value) {
    const values = Array.isArray(value) ? value : [];
    const seen = new Set();
    values.forEach((item) => {
      if (typeof item !== 'string') return;
      const trimmed = item.trim();
      if (trimmed) {
        seen.add(trimmed);
      }
    });
    return Array.from(seen);
  }

  nextId(key) {
    this.state.counters[key] = (this.state.counters[key] || 0) + 1;
    return this.state.counters[key];
  }

  getCategories() {
    return this.state.categories;
  }

  addCategory(payload) {
    const category = {
      id: payload.id ?? this.nextId('categories'),
      name: payload.name,
      type: payload.type || 'expense',
      color: payload.color || '#4f46e5',
      description: payload.description || ''
    };
    const existingIdx = this.state.categories.findIndex((cat) => cat.id === category.id);
    if (existingIdx >= 0) {
      this.state.categories[existingIdx] = category;
    } else {
      this.state.categories.push(category);
    }
    this.save();
    return category;
  }

  updateCategory(id, payload) {
    const index = this.state.categories.findIndex((cat) => cat.id === Number(id));
    if (index === -1) return null;
    const current = this.state.categories[index];
    const updatedCategory = { ...current, ...payload };
    if (typeof updatedCategory.name === 'string') {
      updatedCategory.name = updatedCategory.name.trim();
    }
    this.state.categories[index] = updatedCategory;

    if (
      payload.name &&
      typeof payload.name === 'string' &&
      payload.name.trim() &&
      payload.name !== current.name
    ) {
      const oldName = current.name;
      const newName = updatedCategory.name;
      const now = new Date().toISOString();
      this.state.fixedExpenses = this.state.fixedExpenses.map((expense) => {
        if ((expense.category || 'Annet') === oldName) {
          return { ...expense, category: newName, updatedAt: now };
        }
        return expense;
      });
    }

    this.save();
    return this.state.categories[index];
  }

  deleteCategory(id) {
    const categoryId = Number(id);
    this.state.transactions = this.state.transactions.map((tx) =>
      tx.categoryId === categoryId ? { ...tx, categoryId: null } : tx
    );
    const originalLength = this.state.categories.length;
    this.state.categories = this.state.categories.filter((cat) => cat.id !== categoryId);
    this.save();
    return originalLength !== this.state.categories.length;
  }

  getPages() {
    return this.state.pages;
  }

  addPage(payload) {
    const page = {
      id: payload.id ?? this.nextId('pages'),
      name: payload.name,
      description: payload.description || '',
      color: payload.color || '#059669',
      metadata: payload.metadata || {}
    };
    const existingIdx = this.state.pages.findIndex((p) => p.id === page.id);
    if (existingIdx >= 0) {
      this.state.pages[existingIdx] = page;
    } else {
      this.state.pages.push(page);
    }
    this.save();
    return page;
  }

  updatePage(id, payload) {
    const index = this.state.pages.findIndex((p) => p.id === Number(id));
    if (index === -1) return null;
    this.state.pages[index] = { ...this.state.pages[index], ...payload };
    this.save();
    return this.state.pages[index];
  }

  deletePage(id) {
    const pageId = Number(id);
    this.state.transactions = this.state.transactions.map((tx) =>
      tx.pageId === pageId ? { ...tx, pageId: null } : tx
    );
    const originalLength = this.state.pages.length;
    this.state.pages = this.state.pages.filter((p) => p.id !== pageId);
    this.save();
    return originalLength !== this.state.pages.length;
  }

  getTransactions() {
    return this.state.transactions;
  }

  addTransaction(payload) {
    const transaction = {
      id: payload.id ?? this.nextId('transactions'),
      title: payload.title,
      amount: Number(payload.amount),
      type: payload.type,
      categoryId: payload.categoryId ?? null,
      pageId: payload.pageId ?? null,
      tags: payload.tags || [],
      occurredOn: payload.occurredOn,
      notes: payload.notes || '',
      metadata: payload.metadata || {}
    };
    const existingIdx = this.state.transactions.findIndex((tx) => tx.id === transaction.id);
    if (existingIdx >= 0) {
      this.state.transactions[existingIdx] = transaction;
    } else {
      this.state.transactions.push(transaction);
    }
    this.save();
    return transaction;
  }

  updateTransaction(id, payload) {
    const index = this.state.transactions.findIndex((tx) => tx.id === Number(id));
    if (index === -1) return null;
    this.state.transactions[index] = {
      ...this.state.transactions[index],
      ...payload,
      amount: Number(payload.amount ?? this.state.transactions[index].amount)
    };
    this.save();
    return this.state.transactions[index];
  }

  deleteTransaction(id) {
    const transactionId = Number(id);
    const originalLength = this.state.transactions.length;
    this.state.transactions = this.state.transactions.filter((tx) => tx.id !== transactionId);
    this.save();
    return originalLength !== this.state.transactions.length;
  }

  clearTransactions() {
    const deleted = this.state.transactions.length;
    this.state.transactions = [];
    this.save();
    return deleted;
  }

  getFixedExpenses() {
    return this.state.fixedExpenses;
  }

  addFixedExpense(payload) {
    const now = new Date().toISOString();
    const expense = {
      id: payload.id ?? this.nextId('fixedExpenses'),
      name: payload.name,
      amountPerMonth: Number(payload.amountPerMonth) || 0,
      category: payload.category || 'Annet',
      owners: Array.isArray(payload.owners)
        ? payload.owners.map((owner) => owner.trim()).filter(Boolean)
        : [],
      level: payload.level || 'Må-ha',
      startDate: payload.startDate || '',
      bindingEndDate: payload.bindingEndDate || '',
      noticePeriodMonths:
        payload.noticePeriodMonths === null || payload.noticePeriodMonths === ''
          ? null
          : Number(payload.noticePeriodMonths) || 0,
      note: payload.note || '',
      createdAt: payload.createdAt || now,
      updatedAt: payload.updatedAt || now,
      priceHistory: Array.isArray(payload.priceHistory) && payload.priceHistory.length
        ? payload.priceHistory
        : [{ amount: Number(payload.amountPerMonth) || 0, changedAt: now }]
    };
    this.state.fixedExpenses.push(expense);
    this.save();
    return expense;
  }

  bulkAddOwnersToFixedExpenses(owners) {
    if (!Array.isArray(owners) || owners.length === 0) {
      return { updated: 0, fixedExpenses: this.state.fixedExpenses };
    }

    const normalizedOwners = owners.map((owner) => owner.trim()).filter(Boolean);
    if (!normalizedOwners.length) {
      return { updated: 0, fixedExpenses: this.state.fixedExpenses };
    }

    let updatedCount = 0;
    const now = new Date().toISOString();
    this.state.fixedExpenses = this.state.fixedExpenses.map((expense) => {
      const existingOwners = Array.isArray(expense.owners)
        ? expense.owners.map((owner) => owner.trim()).filter(Boolean)
        : [];
      const mergedOwners = Array.from(new Set([...existingOwners, ...normalizedOwners]));
      if (mergedOwners.length !== existingOwners.length) {
        updatedCount += 1;
        return { ...expense, owners: mergedOwners, updatedAt: now };
      }
      return expense;
    });

    if (updatedCount > 0) {
      this.save();
    }

    return { updated: updatedCount, fixedExpenses: this.state.fixedExpenses };
  }

  updateFixedExpense(id, payload) {
    const index = this.state.fixedExpenses.findIndex((exp) => exp.id === Number(id));
    if (index === -1) return null;
    const current = this.state.fixedExpenses[index];
    const now = new Date().toISOString();
    const owners =
      payload.owners === undefined
        ? current.owners
        : Array.isArray(payload.owners)
        ? payload.owners.map((owner) => owner.trim()).filter(Boolean)
        : [];
    const nextAmount =
      payload.amountPerMonth !== undefined
        ? Number(payload.amountPerMonth) || 0
        : current.amountPerMonth;
    let priceHistory = Array.isArray(current.priceHistory) ? [...current.priceHistory] : [];
    if (payload.resetPriceHistory) {
      priceHistory = [{ amount: nextAmount, changedAt: now }];
    } else if (!priceHistory.length) {
      priceHistory = [{ amount: nextAmount, changedAt: now }];
    } else {
      const latest = priceHistory[priceHistory.length - 1];
      if (latest.amount !== nextAmount) {
        priceHistory = [...priceHistory, { amount: nextAmount, changedAt: now }];
      }
    }
    const updated = {
      ...current,
      ...payload,
      owners,
      amountPerMonth: nextAmount,
      noticePeriodMonths:
        payload.noticePeriodMonths === undefined
          ? current.noticePeriodMonths
          : payload.noticePeriodMonths === null || payload.noticePeriodMonths === ''
          ? null
          : Number(payload.noticePeriodMonths) || 0,
      updatedAt: now,
      priceHistory
    };
    this.state.fixedExpenses[index] = updated;
    this.save();
    return updated;
  }

  resetFixedExpensePriceHistory(id) {
    const index = this.state.fixedExpenses.findIndex((exp) => exp.id === Number(id));
    if (index === -1) return null;
    const now = new Date().toISOString();
    const expense = this.state.fixedExpenses[index];
    const reset = {
      ...expense,
      priceHistory: [
        {
          amount: Number(expense.amountPerMonth) || 0,
          changedAt: now
        }
      ],
      updatedAt: now
    };
    this.state.fixedExpenses[index] = reset;
    this.save();
    return reset;
  }

  deleteFixedExpense(id) {
    const expenseId = Number(id);
    const originalLength = this.state.fixedExpenses.length;
    this.state.fixedExpenses = this.state.fixedExpenses.filter((exp) => exp.id !== expenseId);
    this.save();
    return originalLength !== this.state.fixedExpenses.length;
  }

  getSettings() {
    if (!this.state.settings) {
      this.state.settings = { ...DEFAULT_SETTINGS };
    }
    if (!Array.isArray(this.state.settings.ownerProfiles)) {
      this.state.settings.ownerProfiles = [];
    }
    if (!Array.isArray(this.state.settings.defaultFixedExpensesOwners)) {
      this.state.settings.defaultFixedExpensesOwners = [];
    }
    this.state.settings.defaultFixedExpensesOwners = this.normalizeDefaultOwnerList(
      this.state.settings.defaultFixedExpensesOwners
    );
    if (typeof this.state.settings.defaultFixedExpensesOwner !== 'string') {
      this.state.settings.defaultFixedExpensesOwner = '';
    }
    if (
      !this.state.settings.defaultFixedExpensesOwners.length &&
      this.state.settings.defaultFixedExpensesOwner.trim()
    ) {
      this.state.settings.defaultFixedExpensesOwners = [
        this.state.settings.defaultFixedExpensesOwner.trim()
      ];
    }
    this.state.settings.defaultFixedExpensesOwner =
      this.state.settings.defaultFixedExpensesOwners[0] || '';
    return this.state.settings;
  }

  updateSettings(payload) {
    const current = this.getSettings();
    const next = {
      ...current,
      monthlyNetIncome:
        Number(payload.monthlyNetIncome ?? current.monthlyNetIncome ?? DEFAULT_SETTINGS.monthlyNetIncome) || 0
    };

    if (payload.ownerProfiles !== undefined) {
      next.ownerProfiles = this.normalizeOwnerProfiles(payload.ownerProfiles);
    } else if (!Array.isArray(next.ownerProfiles)) {
      next.ownerProfiles = [];
    }

    if (payload.defaultFixedExpensesOwners !== undefined) {
      next.defaultFixedExpensesOwners = this.normalizeDefaultOwnerList(
        payload.defaultFixedExpensesOwners
      );
    } else if (!Array.isArray(next.defaultFixedExpensesOwners)) {
      next.defaultFixedExpensesOwners = [];
    }

    if (payload.defaultFixedExpensesOwner !== undefined && payload.defaultFixedExpensesOwners === undefined) {
      if (payload.defaultFixedExpensesOwner === null || payload.defaultFixedExpensesOwner === '') {
        next.defaultFixedExpensesOwners = [];
      } else if (typeof payload.defaultFixedExpensesOwner === 'string') {
        next.defaultFixedExpensesOwners = [payload.defaultFixedExpensesOwner.trim()].filter(Boolean);
      }
    }

    next.defaultFixedExpensesOwner = next.defaultFixedExpensesOwners[0] || '';

    if (payload.lockEnabled !== undefined) {
      next.lockEnabled = Boolean(payload.lockEnabled);
      if (!next.lockEnabled) {
        next.lockSalt = '';
        next.lockHash = '';
      }
    }

    if (payload.lockSalt !== undefined) {
      next.lockSalt = typeof payload.lockSalt === 'string' ? payload.lockSalt : '';
    }

    if (payload.lockHash !== undefined) {
      next.lockHash = typeof payload.lockHash === 'string' ? payload.lockHash : '';
    }

    this.state.settings = next;
    this.save();
    return this.state.settings;
  }

  renameOwner(fromName, toName) {
    const from = typeof fromName === 'string' ? fromName.trim() : '';
    const to = typeof toName === 'string' ? toName.trim() : '';

    if (!from || !to || from === to) {
      return {
        changed: false,
        ownerProfiles: this.state.settings.ownerProfiles,
        defaultFixedExpensesOwners: this.state.settings.defaultFixedExpensesOwners,
        fixedExpenses: this.state.fixedExpenses
      };
    }

    let changed = false;
    const now = new Date().toISOString();

    this.state.fixedExpenses = this.state.fixedExpenses.map((expense) => {
      const owners = Array.isArray(expense.owners)
        ? expense.owners.map((owner) => owner.trim()).filter(Boolean)
        : [];
      if (!owners.includes(from)) return expense;

      const updatedOwners = uniqueOwnerList(owners.map((owner) => (owner === from ? to : owner)));
      const ownersChanged = updatedOwners.join('|') !== owners.join('|');

      if (ownersChanged) {
        changed = true;
        return { ...expense, owners: updatedOwners, updatedAt: now };
      }
      return expense;
    });

    const ownerProfiles = Array.isArray(this.state.settings.ownerProfiles)
      ? this.state.settings.ownerProfiles
      : [];
    const renamedProfilesMap = new Map();
    ownerProfiles.forEach((profile) => {
      if (!profile || typeof profile.name !== 'string') return;
      const name = profile.name === from ? to : profile.name;
      if (!name) return;
      const income = Number(profile.monthlyNetIncome) || 0;
      if (!renamedProfilesMap.has(name)) {
        renamedProfilesMap.set(name, income);
      }
    });
    const nextProfiles = Array.from(renamedProfilesMap.entries()).map(([name, monthlyNetIncome]) => ({
      name,
      monthlyNetIncome
    }));
    if (JSON.stringify(nextProfiles) !== JSON.stringify(ownerProfiles)) {
      changed = true;
      this.state.settings.ownerProfiles = nextProfiles;
    }

    const defaults = uniqueOwnerList(this.state.settings.defaultFixedExpensesOwners || []);
    const renamedDefaults = uniqueOwnerList(defaults.map((owner) => (owner === from ? to : owner)));
    if (renamedDefaults.join('|') !== defaults.join('|')) {
      changed = true;
      this.state.settings.defaultFixedExpensesOwners = renamedDefaults;
      this.state.settings.defaultFixedExpensesOwner = renamedDefaults[0] || '';
    }

    if (changed) {
      this.save();
    }

    return {
      changed,
      ownerProfiles: this.state.settings.ownerProfiles,
      defaultFixedExpensesOwners: this.state.settings.defaultFixedExpensesOwners,
      fixedExpenses: this.state.fixedExpenses
    };
  }

  deleteOwner(name) {
    const target = typeof name === 'string' ? name.trim() : '';

    if (!target) {
      return {
        changed: false,
        ownerProfiles: this.state.settings.ownerProfiles,
        defaultFixedExpensesOwners: this.state.settings.defaultFixedExpensesOwners,
        fixedExpenses: this.state.fixedExpenses
      };
    }

    let changed = false;
    const now = new Date().toISOString();

    this.state.fixedExpenses = this.state.fixedExpenses.map((expense) => {
      const owners = Array.isArray(expense.owners)
        ? expense.owners.map((owner) => owner.trim()).filter(Boolean)
        : [];
      const filtered = owners.filter((owner) => owner !== target);
      if (filtered.length !== owners.length) {
        changed = true;
        return { ...expense, owners: filtered, updatedAt: now };
      }
      return expense;
    });

    const beforeProfiles = Array.isArray(this.state.settings.ownerProfiles)
      ? this.state.settings.ownerProfiles.length
      : 0;
    this.state.settings.ownerProfiles = (this.state.settings.ownerProfiles || []).filter(
      (profile) => profile?.name !== target
    );
    if ((this.state.settings.ownerProfiles?.length || 0) !== beforeProfiles) {
      changed = true;
    }

    const defaultsBefore = Array.isArray(this.state.settings.defaultFixedExpensesOwners)
      ? this.state.settings.defaultFixedExpensesOwners.length
      : 0;
    this.state.settings.defaultFixedExpensesOwners = uniqueOwnerList(
      (this.state.settings.defaultFixedExpensesOwners || []).filter((owner) => owner !== target)
    );
    if (this.state.settings.defaultFixedExpensesOwners.length !== defaultsBefore) {
      changed = true;
      this.state.settings.defaultFixedExpensesOwner =
        this.state.settings.defaultFixedExpensesOwners[0] || '';
    }

    if (changed) {
      this.save();
    }

    return {
      changed,
      ownerProfiles: this.state.settings.ownerProfiles,
      defaultFixedExpensesOwners: this.state.settings.defaultFixedExpensesOwners,
      fixedExpenses: this.state.fixedExpenses
    };
  }

  replaceAll(data) {
    const categories = (data.categories || []).map((cat, index) => ({
      id: cat.id ?? index + 1,
      name: cat.name,
      type: cat.type || 'expense',
      color: cat.color || '#4f46e5',
      description: cat.description || ''
    }));

    const pages = (data.pages || []).map((page, index) => ({
      id: page.id ?? index + 1,
      name: page.name,
      description: page.description || '',
      color: page.color || '#059669',
      metadata: page.metadata || {}
    }));

    const transactions = (data.transactions || []).map((tx, index) => ({
      id: tx.id ?? index + 1,
      title: tx.title,
      amount: Number(tx.amount) || 0,
      type: tx.type || 'expense',
      categoryId: tx.categoryId ?? tx.category_id ?? null,
      pageId: tx.pageId ?? tx.page_id ?? null,
      tags: tx.tags || [],
      occurredOn: tx.occurredOn || tx.occurred_on || new Date().toISOString().slice(0, 10),
      notes: tx.notes || '',
      metadata: tx.metadata || {}
    }));

    const fixedExpensesRaw = data.fixedExpenses || data['faste_utgifter'] || [];
    const fixedExpenses = fixedExpensesRaw.map((expense, index) =>
      this.normalizeFixedExpense(expense, expense.id ?? index + 1)
    );

    const settingsPayload = data.settings || {};
    const defaultOwnersFromPayload = Array.isArray(settingsPayload.defaultFixedExpensesOwners)
      ? this.normalizeDefaultOwnerList(settingsPayload.defaultFixedExpensesOwners)
      : typeof settingsPayload.defaultFixedExpensesOwner === 'string'
      ? this.normalizeDefaultOwnerList([settingsPayload.defaultFixedExpensesOwner])
      : [];

    const settings = {
      monthlyNetIncome: Number(settingsPayload.monthlyNetIncome) || 0,
      ownerProfiles: this.normalizeOwnerProfiles(settingsPayload.ownerProfiles || settingsPayload.ownerprofiles),
      defaultFixedExpensesOwner: defaultOwnersFromPayload[0] || '',
      defaultFixedExpensesOwners: defaultOwnersFromPayload,
      lockEnabled: Boolean(settingsPayload.lockEnabled),
      lockSalt: typeof settingsPayload.lockSalt === 'string' ? settingsPayload.lockSalt : '',
      lockHash: typeof settingsPayload.lockHash === 'string' ? settingsPayload.lockHash : ''
    };

    const counters = data.counters || {
      categories: Math.max(0, ...categories.map((c) => c.id || 0)),
      pages: Math.max(0, ...pages.map((p) => p.id || 0)),
      transactions: Math.max(0, ...transactions.map((t) => t.id || 0)),
      fixedExpenses: Math.max(0, ...fixedExpenses.map((f) => f.id || 0))
    };

    this.state = {
      categories,
      pages,
      transactions,
      fixedExpenses,
      settings,
      counters
    };
    this.save();
  }
}

module.exports = new Store();
