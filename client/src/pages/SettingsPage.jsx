import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';

const SettingsPage = () => {
  const fileRef = useRef(null);
  const [exportData, setExportData] = useState(null);
  const [status, setStatus] = useState('');
  const [ownerInputs, setOwnerInputs] = useState({});
  const [ownersFromExpenses, setOwnersFromExpenses] = useState([]);
  const [ownersLoading, setOwnersLoading] = useState(false);
  const [ownerStatus, setOwnerStatus] = useState('');
  const [ownerError, setOwnerError] = useState('');
  const [newOwnerName, setNewOwnerName] = useState('');
  const [isSavingOwners, setIsSavingOwners] = useState(false);
  const [defaultOwners, setDefaultOwners] = useState([]);
  const [defaultOwnerStatus, setDefaultOwnerStatus] = useState('');
  const [defaultOwnerError, setDefaultOwnerError] = useState('');
  const [isUpdatingDefaultOwner, setIsUpdatingDefaultOwner] = useState(false);
  const [editingOwner, setEditingOwner] = useState('');
  const [editedOwnerName, setEditedOwnerName] = useState('');
  const [ownerActionLoading, setOwnerActionLoading] = useState('');
  const [lockEnabled, setLockEnabled] = useState(false);
  const [lockStatus, setLockStatus] = useState('');
  const [lockError, setLockError] = useState('');
  const [newLockPassword, setNewLockPassword] = useState('');
  const [confirmLockPassword, setConfirmLockPassword] = useState('');
  const [currentLockPassword, setCurrentLockPassword] = useState('');
  const [isUpdatingLock, setIsUpdatingLock] = useState(false);
  const [cacheStatus, setCacheStatus] = useState('');
  const [isClearingCache, setIsClearingCache] = useState(false);
  const [bankModeEnabled, setBankModeEnabled] = useState(false);
  const [bankModeStatus, setBankModeStatus] = useState('');
  const [bankModeError, setBankModeError] = useState('');
  const [isUpdatingBankMode, setIsUpdatingBankMode] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const fetchSettings = async () => {
      try {
        const data = await api.getSettings();
        if (!isMounted) return;
        const normalized = {};
        (data.ownerProfiles || []).forEach((profile) => {
          if (profile?.name) {
            normalized[profile.name] = {
              income: String(profile.monthlyNetIncome ?? ''),
              shared: String(profile.sharedContribution ?? '')
            };
          }
        });
        setOwnerInputs(normalized);
        const defaults = Array.isArray(data.defaultFixedExpensesOwners)
          ? data.defaultFixedExpensesOwners
          : typeof data.defaultFixedExpensesOwner === 'string' && data.defaultFixedExpensesOwner.trim()
          ? [data.defaultFixedExpensesOwner.trim()]
          : [];
        setDefaultOwners(defaults);
        setLockEnabled(Boolean(data.lockEnabled));
        setBankModeEnabled(Boolean(data.bankModeEnabled));
      } catch (err) {
        if (!isMounted) return;
        setOwnerError('Kunne ikke hente personer: ' + err.message);
      }
    };
    fetchSettings();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    const fetchOwners = async () => {
      setOwnersLoading(true);
      try {
        const fixedExpenses = await api.getFixedExpenses();
        if (!isMounted) return;
        const owners = Array.from(
          new Set(
            fixedExpenses
              .flatMap((expense) => (Array.isArray(expense.owners) ? expense.owners : []))
              .filter(Boolean)
          )
        ).sort((a, b) => a.localeCompare(b, 'no'));
        setOwnersFromExpenses(owners);
      } catch (err) {
        if (!isMounted) return;
        setOwnerError((prev) => prev || 'Kunne ikke hente eiere: ' + err.message);
      } finally {
        if (isMounted) {
          setOwnersLoading(false);
        }
      }
    };
    fetchOwners();
    return () => {
      isMounted = false;
    };
  }, []);

  const ownerNames = useMemo(() => {
    const names = new Set();
    ownersFromExpenses.forEach((name) => {
      if (name?.trim()) names.add(name);
    });
    Object.keys(ownerInputs).forEach((name) => {
      if (name?.trim()) names.add(name);
    });
    defaultOwners.forEach((name) => {
      if (name?.trim()) names.add(name.trim());
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b, 'no'));
  }, [ownersFromExpenses, ownerInputs, defaultOwners]);

  const syncOwnersFromPayload = (payload = {}) => {
    if (Array.isArray(payload.ownerProfiles)) {
      const refreshed = {};
      payload.ownerProfiles.forEach((profile) => {
        if (profile?.name) {
          refreshed[profile.name] = {
            income: String(profile.monthlyNetIncome ?? ''),
            shared: String(profile.sharedContribution ?? '')
          };
        }
      });
      setOwnerInputs(refreshed);
    }

    if (Array.isArray(payload.defaultFixedExpensesOwners)) {
      setDefaultOwners(payload.defaultFixedExpensesOwners);
    }

    if (Array.isArray(payload.fixedExpenses)) {
      const owners = Array.from(
        new Set(
          payload.fixedExpenses
            .flatMap((expense) => (Array.isArray(expense.owners) ? expense.owners : []))
            .filter(Boolean)
        )
      ).sort((a, b) => a.localeCompare(b, 'no'));
      setOwnersFromExpenses(owners);
    }
  };

  const handleOwnerIncomeChange = (name, value) => {
    setOwnerInputs((current) => ({
      ...current,
      [name]: { ...(current[name] || {}), income: value }
    }));
  };

  const handleOwnerSharedChange = (name, value) => {
    setOwnerInputs((current) => ({
      ...current,
      [name]: { ...(current[name] || {}), shared: value }
    }));
  };

  const handleAddOwner = (event) => {
    event.preventDefault();
    setOwnerStatus('');
    setOwnerError('');
    const trimmed = newOwnerName.trim();
    if (!trimmed) {
      setOwnerError('Skriv inn et navn.');
      return;
    }
    setOwnerInputs((current) => {
      if (Object.prototype.hasOwnProperty.call(current, trimmed)) {
        return current;
      }
      return { ...current, [trimmed]: { income: '', shared: '' } };
    });
    setNewOwnerName('');
  };

  const handleSaveOwners = async () => {
    setOwnerStatus('');
    setOwnerError('');
    setIsSavingOwners(true);
    try {
      const payload = Object.entries(ownerInputs)
        .filter(([name]) => name.trim())
        .filter(([, value]) => {
          const income = value?.income;
          const shared = value?.shared;
          const hasIncome =
            income !== '' && income !== null && income !== undefined && String(income).trim() !== '';
          const hasShared =
            shared !== '' && shared !== null && shared !== undefined && String(shared).trim() !== '';
          return hasIncome || hasShared;
        })
        .map(([name, value]) => {
          const trimmedName = name.trim();
          const numericIncome = Number(value?.income ?? value);
          if (!Number.isFinite(numericIncome) || numericIncome < 0) {
            throw new Error(`Beløpet for ${trimmedName} må være et ikke-negativt tall.`);
          }
          const numericShared = Number(value?.shared ?? 0);
          if (!Number.isFinite(numericShared) || numericShared < 0) {
            throw new Error(`Bidraget for ${trimmedName} må være et ikke-negativt tall.`);
          }
          return { name: trimmedName, monthlyNetIncome: numericIncome, sharedContribution: numericShared };
        });
      const updated = await api.updateSettings({ ownerProfiles: payload });
      syncOwnersFromPayload(updated);
      setOwnerStatus('Lagret personlige inntekter.');
    } catch (err) {
      setOwnerError(err.message || 'Kunne ikke lagre inntekter.');
    } finally {
      setIsSavingOwners(false);
    }
  };

  const handleStartRenameOwner = (name) => {
    setOwnerStatus('');
    setOwnerError('');
    setEditingOwner(name);
    setEditedOwnerName(name);
  };

  const handleConfirmRenameOwner = async () => {
    setOwnerStatus('');
    setOwnerError('');
    const trimmed = editedOwnerName.trim();

    if (!editingOwner) return;
    if (!trimmed) {
      setOwnerError('Skriv inn et nytt navn.');
      return;
    }
    if (trimmed === editingOwner) {
      setOwnerError('Navnet er uendret.');
      return;
    }
    const nameExists = ownerNames.some(
      (owner) => owner !== editingOwner && owner.toLowerCase() === trimmed.toLowerCase()
    );
    if (nameExists) {
      setOwnerError('Det finnes allerede en person med dette navnet.');
      return;
    }

    setOwnerActionLoading(editingOwner);
    try {
      const result = await api.renameOwner(editingOwner, trimmed);
      syncOwnersFromPayload(result);
      setOwnerStatus(`Navn endret til ${trimmed}.`);
      setEditingOwner('');
      setEditedOwnerName('');
    } catch (err) {
      setOwnerError(err.message || 'Kunne ikke endre navn.');
    } finally {
      setOwnerActionLoading('');
    }
  };

  const handleDeleteOwner = async (name) => {
    setOwnerStatus('');
    setOwnerError('');
    if (!window.confirm(`Fjerne ${name}? Dette oppdaterer også faste utgifter.`)) return;

    setOwnerActionLoading(name);
    try {
      const result = await api.deleteOwner(name);
      syncOwnersFromPayload(result);
      setOwnerStatus(`${name} er fjernet.`);
      if (editingOwner === name) {
        setEditingOwner('');
        setEditedOwnerName('');
      }
    } catch (err) {
      setOwnerError(err.message || 'Kunne ikke fjerne personen.');
    } finally {
      setOwnerActionLoading('');
    }
  };

  const handleUpdateDefaultOwners = async (owners) => {
    setDefaultOwnerStatus('');
    setDefaultOwnerError('');
    setIsUpdatingDefaultOwner(true);
    try {
      const sanitized = Array.from(
        new Set(
          (owners || [])
            .filter((name) => typeof name === 'string')
            .map((name) => name.trim())
            .filter(Boolean)
        )
      );
      const payload = { defaultFixedExpensesOwners: sanitized };
      const updated = await api.updateSettings(payload);
      const next = Array.isArray(updated.defaultFixedExpensesOwners)
        ? updated.defaultFixedExpensesOwners
        : [];
      setDefaultOwners(next);
      if (next.length === 0) {
        setDefaultOwnerStatus('Standardvisning fjernet.');
      } else if (next.length === 1) {
        setDefaultOwnerStatus(`${next[0]} er satt som standard for Faste utgifter.`);
      } else {
        setDefaultOwnerStatus(
          `${next.join(', ')} er satt som standard for Faste utgifter.`
        );
      }
    } catch (err) {
      setDefaultOwnerError(err.message || 'Kunne ikke oppdatere standardvisningen.');
    } finally {
      setIsUpdatingDefaultOwner(false);
    }
  };

  const handleSaveLock = async () => {
    setLockStatus('');
    setLockError('');
    const trimmedPassword = newLockPassword.trim();
    const trimmedConfirm = confirmLockPassword.trim();
    if (!trimmedPassword) {
      setLockError('Velg et passord for å aktivere eller oppdatere låsen.');
      return;
    }
    if (trimmedPassword !== trimmedConfirm) {
      setLockError('Passordene må være like.');
      return;
    }
    setIsUpdatingLock(true);
    try {
      const updated = await api.updateSettings({
        lockEnabled: true,
        lockPassword: trimmedPassword,
        lockCurrentPassword: currentLockPassword || undefined
      });
      setLockEnabled(Boolean(updated.lockEnabled));
      setLockStatus('Lås oppdatert. Bruk dette passordet når du deler appen.');
      setNewLockPassword('');
      setConfirmLockPassword('');
    } catch (err) {
      setLockError(err.message || 'Kunne ikke lagre passord.');
    } finally {
      setIsUpdatingLock(false);
    }
  };

  const handleDisableLock = async () => {
    setLockStatus('');
    setLockError('');
    if (!currentLockPassword.trim()) {
      setLockError('Skriv inn nåværende passord for å slå av låsen.');
      return;
    }
    setIsUpdatingLock(true);
    try {
      const updated = await api.updateSettings({
        lockEnabled: false,
        lockCurrentPassword: currentLockPassword
      });
      setLockEnabled(Boolean(updated.lockEnabled));
      setLockStatus('Lås er deaktivert.');
    } catch (err) {
      setLockError(err.message || 'Kunne ikke skru av låsen.');
    } finally {
      setIsUpdatingLock(false);
    }
  };

  const toggleDefaultOwnerSelection = async (name) => {
    const trimmed = name?.trim();
    if (!trimmed) return;
    const exists = defaultOwners.includes(trimmed);
    const next = exists
      ? defaultOwners.filter((owner) => owner !== trimmed)
      : [...defaultOwners, trimmed];
    await handleUpdateDefaultOwners(next);
  };

  const handleToggleBankMode = async () => {
    setBankModeStatus('');
    setBankModeError('');
    setIsUpdatingBankMode(true);
    try {
      const updated = await api.updateSettings({ bankModeEnabled: !bankModeEnabled });
      setBankModeEnabled(Boolean(updated.bankModeEnabled));
      setBankModeStatus(
        updated.bankModeEnabled
          ? 'Bank-modus er aktivert. Angi bidrag på hver person nedenfor.'
          : 'Bank-modus er slått av.'
      );
    } catch (err) {
      setBankModeError(err.message || 'Kunne ikke oppdatere bank-modus.');
    } finally {
      setIsUpdatingBankMode(false);
    }
  };

  const handleExport = async () => {
    try {
      const data = await api.exportData();
      setExportData(data);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `budsjett-backup-${new Date().toISOString()}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setStatus('Eksport fullført. Fil lastet ned.');
    } catch (err) {
      setStatus(err.message);
    }
  };

  const handleImport = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setStatus('Velg en fil først.');
      return;
    }
    const text = await file.text();
    try {
      const json = JSON.parse(text);
      await api.importData(json);
      setStatus('Import fullført! Last siden på nytt for å se endringene.');
    } catch (err) {
      setStatus('Import feilet: ' + err.message);
    }
  };

  const handleClearCache = async () => {
    setCacheStatus('');
    setIsClearingCache(true);
    try {
      if ('serviceWorker' in navigator && navigator.serviceWorker.getRegistrations) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));
      }

      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map((name) => caches.delete(name)));
      }

      setCacheStatus('Cache er slettet. Last siden på nytt for å hente siste versjon.');
    } catch (err) {
      setCacheStatus('Kunne ikke slette cache: ' + err.message);
    } finally {
      setIsClearingCache(false);
    }
  };

  return (
    <div className="settings-page">
      <div className="section-header">
        <h2>Innstillinger</h2>
        <p className="muted">Administrer sikkerhetskopier, importer data og oppdater personoppsettet på ett sted.</p>
      </div>
      <div className="card-grid settings-stack">
        <section className="card settings-card">
          <div className="settings-card-header">
            <div>
              <p className="eyebrow">Datahåndtering</p>
              <h3>Eksport og import</h3>
              <p className="muted">Ta sikkerhetskopi eller gjenopprett budsjettet ditt uten å forlate siden.</p>
            </div>
            {status && <p className="settings-status-inline">{status}</p>}
          </div>
          <div className="settings-subgrid">
            <div className="settings-tile">
              <div>
                <h4>Sikkerhetskopi</h4>
                <p className="muted">Last ned hele databasen som JSON.</p>
              </div>
              <div className="settings-actions">
                <button onClick={handleExport}>Eksporter nå</button>
              </div>
              {exportData && (
                <pre className="export-preview">{JSON.stringify(exportData, null, 2)}</pre>
              )}
            </div>
            <div className="settings-tile">
              <div>
                <h4>Import</h4>
                <p className="muted">Importer en tidligere eksport. Dette overskriver eksisterende data.</p>
              </div>
              <div className="settings-actions">
                <input type="file" ref={fileRef} accept="application/json" />
                <button onClick={handleImport}>Importer</button>
              </div>
            </div>
            <div className="settings-tile">
              <div>
                <h4>Rydd PWA-cache</h4>
                <p className="muted">
                  Fjern mellomlagret innhold og tjenestearbeidere for å hente siste versjon av appen.
                </p>
              </div>
              <div className="settings-actions">
                <button onClick={handleClearCache} disabled={isClearingCache}>
                  {isClearingCache ? 'Rydder…' : 'Tøm cache'}
                </button>
              </div>
              {cacheStatus && (
                <p className={`muted ${cacheStatus.startsWith('Kunne') ? 'error-text' : ''}`}>
                  {cacheStatus}
                </p>
              )}
            </div>
          </div>
        </section>

        <section className="card settings-card">
          <div className="settings-card-header">
            <div>
              <p className="eyebrow">Tilgang</p>
              <h3>Beskytt siden med passord</h3>
              <p className="muted">
                Aktiver en sidelås når appen er publisert, slik at kun de med passordet kan åpne den.
              </p>
            </div>
            {lockStatus && <p className="settings-status-inline success">{lockStatus}</p>}
            {lockError && <p className="settings-status-inline error-text">{lockError}</p>}
          </div>
          <div className="settings-subgrid">
            <div className="settings-tile">
              <div>
                <h4>Status</h4>
                <p className="muted">{lockEnabled ? 'Låsen er aktivert.' : 'Låsen er ikke aktivert.'}</p>
              </div>
              <div className="settings-actions">
                <span className={`badge ${lockEnabled ? 'success' : ''}`}>
                  {lockEnabled ? 'På' : 'Av'}
                </span>
              </div>
            </div>
            <div className="settings-tile">
              <div>
                <h4>Administrer passord</h4>
                <p className="muted">
                  Oppgi nåværende passord for å endre eller deaktivere låsen. Velg et nytt passord for å
                  aktivere eller bytte til et annet.
                </p>
              </div>
              <div className="settings-actions" style={{ gap: '0.5rem', width: '100%' }}>
                <label className="muted" htmlFor="current-lock-password">
                  Nåværende passord
                </label>
                <input
                  id="current-lock-password"
                  type="password"
                  placeholder="Skriv nåværende passord"
                  value={currentLockPassword}
                  onChange={(e) => setCurrentLockPassword(e.target.value)}
                />
                <label className="muted" htmlFor="new-lock-password">
                  Nytt passord
                </label>
                <input
                  id="new-lock-password"
                  type="password"
                  placeholder="Lag et sterkt passord"
                  value={newLockPassword}
                  onChange={(e) => setNewLockPassword(e.target.value)}
                />
                <label className="muted" htmlFor="confirm-lock-password">
                  Bekreft nytt passord
                </label>
                <input
                  id="confirm-lock-password"
                  type="password"
                  placeholder="Gjenta passordet"
                  value={confirmLockPassword}
                  onChange={(e) => setConfirmLockPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={handleSaveLock}
                  disabled={isUpdatingLock}
                  style={{ width: '100%' }}
                >
                  {isUpdatingLock ? 'Lagrer…' : lockEnabled ? 'Oppdater passord' : 'Aktiver lås'}
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={handleDisableLock}
                  disabled={isUpdatingLock || !lockEnabled}
                  style={{ width: '100%' }}
                >
                  Skru av lås
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="card owner-income-card settings-card">
          <div className="settings-card-header">
            <div>
              <p className="eyebrow">Personoppsett</p>
              <h3>Personer og netto inntekt</h3>
              <p className="muted">Navn fra faste utgifter dukker opp automatisk. Legg inn beløp per måned per person.</p>
            </div>
            <div className="settings-status-cluster">
              {ownerStatus && <p className="settings-status-inline success">{ownerStatus}</p>}
              {ownerError && <p className="settings-status-inline error-text">{ownerError}</p>}
            </div>
          </div>

          <div className="bank-mode-toggle">
            <div>
              <p className="eyebrow">Bank-modus</p>
              <h4>Felles regningskonto</h4>
              <p className="muted">
                Aktiver for å fordele lønn og hvor mye hver person legger inn på felleskontoen per måned.
              </p>
              {(bankModeStatus || bankModeError) && (
                <p className={bankModeError ? 'error-text' : 'success-text'}>
                  {bankModeError || bankModeStatus}
                </p>
              )}
            </div>
            <div className="bank-mode-actions">
              <span className="badge neutral">{bankModeEnabled ? 'På' : 'Av'}</span>
              <button type="button" onClick={handleToggleBankMode} disabled={isUpdatingBankMode}>
                {isUpdatingBankMode
                  ? 'Oppdaterer…'
                  : bankModeEnabled
                  ? 'Slå av bank-modus'
                  : 'Aktiver bank-modus'}
              </button>
            </div>
          </div>

          {ownersLoading && <p className="muted">Laster personer…</p>}
          {!ownersLoading && ownerNames.length === 0 && (
            <div className="empty-owner-state">
              <p className="muted">Ingen personer funnet ennå. Legg til en ny person nedenfor.</p>
              <p className="muted">Du kan definere både inntekt og hvilke personer som skal være standard.</p>
            </div>
          )}

          {ownerNames.length > 0 && (
            <div className="owner-setup-grid">
              <div className="owner-panel">
                <div className="owner-panel-header">
                  <div>
                    <p className="eyebrow">Netto per måned</p>
                    <h4>Inntekt per person</h4>
                    <p className="muted">Gi hver person et beløp i NOK for å få et realistisk budsjett.</p>
                  </div>
                  <span className="stat-chip">{ownerNames.length} personer</span>
                </div>
                <div className="owner-income-tiles">
                  {ownerNames.map((name) => {
                    const isEditing = editingOwner === name;
                    return (
                      <div key={name} className="owner-income-tile">
                        <div className="owner-avatar" aria-hidden>
                          {name.charAt(0).toUpperCase()}
                        </div>
                        <div className="owner-income-meta">
                          <label className="muted" htmlFor={`owner-name-${name}`}>
                            Navn
                          </label>
                          {isEditing ? (
                            <input
                              id={`owner-name-${name}`}
                              value={editedOwnerName}
                              onChange={(e) => setEditedOwnerName(e.target.value)}
                              placeholder="Nytt navn"
                            />
                          ) : (
                            <p className="owner-name">{name}</p>
                          )}
                          <p className="muted owner-income-hint">Beløp og navn brukes på hele siden.</p>
                        </div>
                        <div className="owner-income-input">
                          <label className="muted" htmlFor={`owner-income-${name}`}>
                            Netto
                          </label>
                          <div className="currency-input">
                            <span className="currency-prefix">kr</span>
                            <input
                              id={`owner-income-${name}`}
                              type="number"
                              min="0"
                              placeholder="0"
                              value={ownerInputs[name]?.income ?? ownerInputs[name] ?? ''}
                              onChange={(e) => handleOwnerIncomeChange(name, e.target.value)}
                            />
                          </div>
                        </div>
                        {bankModeEnabled && (
                          <div className="owner-income-input">
                            <label className="muted" htmlFor={`owner-shared-${name}`}>
                              Til felleskonto
                            </label>
                            <div className="currency-input">
                              <span className="currency-prefix">kr</span>
                              <input
                                id={`owner-shared-${name}`}
                                type="number"
                                min="0"
                                placeholder="0"
                                value={ownerInputs[name]?.shared ?? ''}
                                onChange={(e) => handleOwnerSharedChange(name, e.target.value)}
                              />
                            </div>
                            <p className="muted owner-income-hint">
                              Trekkes fra personlig lønn og legges i fellespotten.
                            </p>
                          </div>
                        )}
                        <div className="owner-action-buttons">
                          {isEditing ? (
                            <>
                              <button
                                type="button"
                                className="secondary"
                                onClick={handleConfirmRenameOwner}
                                disabled={ownerActionLoading === name}
                              >
                                Lagre navn
                              </button>
                              <button
                                type="button"
                                className="ghost"
                                onClick={() => {
                                  setEditingOwner('');
                                  setEditedOwnerName('');
                                }}
                                disabled={ownerActionLoading === name}
                              >
                                Avbryt
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="ghost"
                                onClick={() => handleStartRenameOwner(name)}
                                disabled={Boolean(ownerActionLoading)}
                              >
                                Endre navn
                              </button>
                              <button
                                type="button"
                                className="ghost danger-text"
                                onClick={() => handleDeleteOwner(name)}
                                disabled={ownerActionLoading === name}
                              >
                                Fjern
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="owner-panel">
                <div className="owner-panel-header">
                  <div>
                    <p className="eyebrow">Standardvalg</p>
                    <h4>Tagger til faste utgifter</h4>
                    <p className="muted">Velg hvilke personer som skal være forhåndsvalgt når du legger inn utgifter.</p>
                  </div>
                  {defaultOwners.length > 0 && <span className="stat-chip success">{defaultOwners.length} valgt</span>}
                </div>
                <div className="owner-default-chips">
                  {ownerNames.map((name) => {
                    const isSelected = defaultOwners.includes(name);
                    return (
                      <button
                        key={`${name}-default`}
                        type="button"
                        className={`owner-chip ${isSelected ? 'selected' : ''}`}
                        onClick={() => toggleDefaultOwnerSelection(name)}
                        disabled={isUpdatingDefaultOwner}
                      >
                        <span className="owner-chip-initial" aria-hidden>
                          {name.charAt(0).toUpperCase()}
                        </span>
                        <span className="owner-chip-name">{name}</span>
                        <span className="owner-chip-status">{isSelected ? 'Standard' : 'Tilgjengelig'}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="owner-default-footer">
                  {defaultOwners.length > 0 && (
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => handleUpdateDefaultOwners([])}
                      disabled={isUpdatingDefaultOwner}
                    >
                      Fjern alle standardvalg
                    </button>
                  )}
                  {defaultOwnerStatus && (
                    <p className="muted success-text">{defaultOwnerStatus}</p>
                  )}
                  {defaultOwnerError && <p className="error-text">{defaultOwnerError}</p>}
                </div>
              </div>
            </div>
          )}

          <div className="owner-actions">
            <form className="inline-form" onSubmit={handleAddOwner}>
              <label htmlFor="new-owner-input">Legg til person</label>
              <input
                id="new-owner-input"
                placeholder="F.eks. Ola"
                value={newOwnerName}
                onChange={(e) => setNewOwnerName(e.target.value)}
              />
              <button type="submit">Legg til</button>
            </form>
            <button
              type="button"
              onClick={handleSaveOwners}
              disabled={isSavingOwners}
              className="save-owner-button"
            >
              {isSavingOwners ? 'Lagrer…' : 'Lagre personlige inntekter'}
            </button>
          </div>
        </section>
      </div>

    </div>
  );
};

export default SettingsPage;
