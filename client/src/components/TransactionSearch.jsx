import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { formatCurrency, formatDate } from '../utils/format.js';

const DEBOUNCE_DELAY = 300;

const TransactionSearch = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);

  const showDropdown = useMemo(() => isOpen && (loading || error || query.trim()), [error, isOpen, loading, query]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setLoading(false);
      setError('');
      setHighlightedIndex(-1);
      return undefined;
    }

    const handle = setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const data = await api.getTransactions({ search: query.trim(), order: 'DESC', sortBy: 'occurredOn' });
        setResults(data);
      } catch (err) {
        setResults([]);
        setError(err.message || 'Kunne ikke hente forslag.');
      } finally {
        setLoading(false);
        setIsOpen(true);
        setHighlightedIndex(0);
      }
    }, DEBOUNCE_DELAY);

    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target) &&
        inputRef.current &&
        !inputRef.current.contains(event.target)
      ) {
        setIsOpen(false);
        setHighlightedIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleKeyDown = (event) => {
    if (!showDropdown) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!results.length) return;
      setHighlightedIndex((prev) => {
        const nextIndex = prev + 1;
        if (nextIndex >= results.length) return Math.max(0, results.length - 1);
        return nextIndex;
      });
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!results.length) return;
      setHighlightedIndex((prev) => {
        const nextIndex = prev - 1;
        if (nextIndex < 0) return results.length > 0 ? results.length - 1 : -1;
        return nextIndex;
      });
    }
    if (event.key === 'Enter' && highlightedIndex >= 0 && results[highlightedIndex]) {
      event.preventDefault();
      navigate(`/transaksjon/${results[highlightedIndex].id}`);
      setIsOpen(false);
    }
    if (event.key === 'Escape') {
      setIsOpen(false);
      setHighlightedIndex(-1);
    }
  };

  const activeLabel = (transaction) => transaction.categoryName || transaction.pageName || 'Ingen kategori';

  return (
    <div className="transaction-search">
      <div className="search-control">
        <input
          ref={inputRef}
          type="search"
          placeholder="Søk etter transaksjoner..."
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
        />
        {loading && <span className="spinner" aria-label="Laster" />}
      </div>

      {showDropdown && (
        <div className="search-dropdown" ref={dropdownRef}>
          {error && <p className="error-text">{error}</p>}
          {!error && query.trim() && results.length === 0 && !loading && <p className="muted">Ingen treff</p>}
          {!error && (loading || results.length > 0) && (
            <ul>
              {loading && (
                <li className="muted" role="status">
                  Laster forslag...
                </li>
              )}
              {!loading &&
                results.map((transaction, index) => (
                  <li key={transaction.id} className={highlightedIndex === index ? 'highlighted' : ''}>
                    <Link to={`/transaksjon/${transaction.id}`} onClick={() => setIsOpen(false)}>
                      <div className="suggestion-header">
                        <span className="title">{transaction.title}</span>
                        <span className="amount" data-type={transaction.type}>
                          {formatCurrency(transaction.amount)}
                        </span>
                      </div>
                      <div className="meta">
                        <span>{formatDate(transaction.occurredOn)}</span>
                        <span className="dot" aria-hidden>
                          •
                        </span>
                        <span className="muted">{activeLabel(transaction)}</span>
                      </div>
                    </Link>
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

export default TransactionSearch;
