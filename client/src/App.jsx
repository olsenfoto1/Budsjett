import { useCallback, useEffect, useMemo, useState } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import { api } from './api.js';
import DashboardPage from './pages/DashboardPage.jsx';
import SavingsGoalsPage from './pages/SavingsGoalsPage.jsx';
import CategoriesPage from './pages/CategoriesPage.jsx';
import PagesPage from './pages/PagesPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import FixedExpensesPage from './pages/FixedExpensesPage.jsx';
import TransactionDetailPage from './pages/TransactionDetailPage.jsx';
import TransactionSearch from './components/TransactionSearch.jsx';

const getInitialTheme = () => {
  if (typeof window === 'undefined') return 'light';
  const stored = localStorage.getItem('budsjett-theme');
  if (stored === 'light' || stored === 'dark') return stored;
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
};

const App = () => {
  const [theme, setTheme] = useState(getInitialTheme);
  const [installPromptEvent, setInstallPromptEvent] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [lockState, setLockState] = useState({ loading: true, enabled: false, unlocked: true });
  const [lockError, setLockError] = useState('');
  const [lockPassword, setLockPassword] = useState('');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('budsjett-theme', theme);
  }, [theme]);

  const refreshLockStatus = useCallback(async () => {
    try {
      const status = await api.getLockStatus();
      setLockState({
        loading: false,
        enabled: Boolean(status.enabled),
        unlocked: Boolean(status.unlocked)
      });
      setLockError('');
    } catch (err) {
      setLockState({ loading: false, enabled: true, unlocked: false });
      setLockError('Kunne ikke hente låsestatus: ' + err.message);
    }
  }, []);

  const standaloneMediaQuery = useMemo(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return null;
    return window.matchMedia('(display-mode: standalone)');
  }, []);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPromptEvent(event);
    };

    const handleAppInstalled = () => {
      setInstallPromptEvent(null);
      setIsInstalled(true);
    };

    const checkStandalone = () => {
      const isStandalone =
        Boolean(window.navigator.standalone) || (standaloneMediaQuery && standaloneMediaQuery.matches);
      setIsInstalled(isStandalone);
    };

    checkStandalone();

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    if (standaloneMediaQuery) {
      standaloneMediaQuery.addEventListener('change', checkStandalone);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);

      if (standaloneMediaQuery) {
        standaloneMediaQuery.removeEventListener('change', checkStandalone);
      }
    };
  }, [standaloneMediaQuery]);

  useEffect(() => {
    refreshLockStatus();
  }, [refreshLockStatus]);

  const handleInstallClick = async () => {
    if (!installPromptEvent) return;
    installPromptEvent.prompt();
    const { outcome } = await installPromptEvent.userChoice;
    if (outcome === 'accepted') {
      setInstallPromptEvent(null);
      setIsInstalled(true);
    }
  };

  const toggleTheme = () => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));

  const handleUnlock = async (event) => {
    event.preventDefault();
    setLockError('');
    try {
      await api.unlock(lockPassword);
      setLockPassword('');
      await refreshLockStatus();
    } catch (err) {
      setLockError(err.message || 'Kunne ikke låse opp.');
    }
  };

  if (lockState.loading) {
    return (
      <div className="lock-screen">
        <div className="lock-card">
          <h1>Familiebudsjett</h1>
          <p className="muted">Laster…</p>
        </div>
      </div>
    );
  }

  if (lockState.enabled && !lockState.unlocked) {
    return (
      <div className="lock-screen">
        <div className="lock-card">
          <h1>Familiebudsjett</h1>
          <p className="muted">Siden er låst. Oppgi passordet for å gå videre.</p>
          <form className="lock-form" onSubmit={handleUnlock}>
            <label htmlFor="lock-password">Passord</label>
            <input
              id="lock-password"
              type="password"
              autoFocus
              placeholder="Skriv inn passordet"
              value={lockPassword}
              onChange={(e) => setLockPassword(e.target.value)}
            />
            <button type="submit" disabled={!lockPassword.trim()}>
              Lås opp siden
            </button>
          </form>
          {lockError && <p className="error-text" style={{ marginTop: '0.75rem' }}>{lockError}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <nav className="navbar">
        <div className="navbar-brand">
          <h1>Familiebudsjett</h1>
          <p>Hold styr på økonomien med ro i sjela</p>
        </div>
        <div className="navbar-actions">
          {!isInstalled && installPromptEvent && (
            <button type="button" className="install-button" onClick={handleInstallClick}>
              📲 Installer appen
            </button>
          )}
          <TransactionSearch />
          <div className="nav-links">
            <NavLink to="/" end>
              Oversikt
            </NavLink>
            <NavLink to="/faste-utgifter">Faste utgifter</NavLink>
            <NavLink to="/sparemal">Sparemål</NavLink>
            <NavLink to="/categories">Kategorier</NavLink>
            <NavLink to="/innstillinger">Innstillinger</NavLink>
          </div>
          <button type="button" className="theme-toggle" onClick={toggleTheme}>
            {theme === 'light' ? '🌙 Mørk modus' : '☀️ Lys modus'}
          </button>
        </div>
      </nav>
      <main>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/faste-utgifter" element={<FixedExpensesPage />} />
          <Route path="/sparemal" element={<SavingsGoalsPage />} />
          <Route path="/categories" element={<CategoriesPage />} />
          <Route path="/pages" element={<PagesPage />} />
          <Route path="/innstillinger" element={<SettingsPage />} />
          <Route path="/transaksjon/:id" element={<TransactionDetailPage />} />
        </Routes>
      </main>
    </div>
  );
};

export default App;
