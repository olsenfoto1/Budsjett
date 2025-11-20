import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { formatCurrency, formatDate } from '../utils/format.js';

const ExpenseSearch = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    if (!debouncedSearch) {
      setResults([]);
      setError('');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    api
      .getTransactions({ search: debouncedSearch, type: 'expense', sortBy: 'occurredOn', order: 'DESC' })
      .then((data) => setResults(Array.isArray(data) ? data.slice(0, 6) : []))
      .catch((err) => setError(err.message || 'Kunne ikke søke etter utgifter.'))
      .finally(() => setLoading(false));
  }, [debouncedSearch]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const resetSearch = () => {
    setSearchTerm('');
    setDebouncedSearch('');
    setResults([]);
    setError('');
    setOpen(false);
  };

  return (
    <div className="navbar-search" ref={containerRef}>
      <div className={`navbar-search-input ${open ? 'is-active' : ''}`}>
        <span className="search-icon" aria-hidden="true">
          🔎
        </span>
        <input
          type="search"
          aria-label="Søk etter utgifter"
          placeholder="Søk i utgifter..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onFocus={() => setOpen(true)}
        />
        {searchTerm && (
          <button type="button" className="ghost-button compact" onClick={resetSearch} aria-label="Nullstill søket">
            ×
          </button>
        )}
      </div>

      {open && (
        <div className="navbar-search-results" role="list" aria-live="polite">
          {!debouncedSearch && <p className="muted">Søk etter utgifter fra hvor som helst.</p>}
          {debouncedSearch && loading && <p className="muted">Søker etter utgifter…</p>}
          {debouncedSearch && error && <p className="error-text">{error}</p>}
          {debouncedSearch && !loading && !error && results.length === 0 && (
            <p className="muted">Fant ingen utgifter som matcher «{debouncedSearch}».</p>
          )}

          {results.length > 0 && (
            <div className="suggestion-list">
              {results.map((tx) => (
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
          )}
        </div>
      )}
    </div>
  );
};

export default ExpenseSearch;
