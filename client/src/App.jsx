import { useEffect, useState } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import DashboardPage from './pages/DashboardPage.jsx';
import SavingsGoalsPage from './pages/SavingsGoalsPage.jsx';
import CategoriesPage from './pages/CategoriesPage.jsx';
import PagesPage from './pages/PagesPage.jsx';
import DataPage from './pages/DataPage.jsx';
import FixedExpensesPage from './pages/FixedExpensesPage.jsx';

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

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('budsjett-theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));

  return (
    <div className="app-container">
      <nav className="navbar">
        <div className="navbar-brand">
          <h1>Familiebudsjett</h1>
          <p>Hold styr på økonomien med ro i sjela</p>
        </div>
        <div className="navbar-actions">
          <div className="nav-links">
            <NavLink to="/" end>
              Oversikt
            </NavLink>
            <NavLink to="/faste-utgifter">Faste utgifter</NavLink>
            <NavLink to="/sparemal">Sparemål</NavLink>
            <NavLink to="/categories">Kategorier</NavLink>
            <NavLink to="/data">Import/Export</NavLink>
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
          <Route path="/data" element={<DataPage />} />
        </Routes>
      </main>
    </div>
  );
};

export default App;
