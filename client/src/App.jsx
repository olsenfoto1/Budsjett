import { NavLink, Route, Routes } from 'react-router-dom';
import DashboardPage from './pages/DashboardPage.jsx';
import TransactionsPage from './pages/TransactionsPage.jsx';
import CategoriesPage from './pages/CategoriesPage.jsx';
import PagesPage from './pages/PagesPage.jsx';
import DataPage from './pages/DataPage.jsx';

const App = () => (
  <div className="app-container">
    <nav className="navbar">
      <h1>Familiebudsjett</h1>
      <div className="nav-links">
        <NavLink to="/" end>
          Oversikt
        </NavLink>
        <NavLink to="/transactions">Transaksjoner</NavLink>
        <NavLink to="/categories">Kategorier</NavLink>
        <NavLink to="/pages">Sider</NavLink>
        <NavLink to="/data">Import/Export</NavLink>
      </div>
    </nav>
    <main>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/transactions" element={<TransactionsPage />} />
        <Route path="/categories" element={<CategoriesPage />} />
        <Route path="/pages" element={<PagesPage />} />
        <Route path="/data" element={<DataPage />} />
      </Routes>
    </main>
  </div>
);

export default App;
