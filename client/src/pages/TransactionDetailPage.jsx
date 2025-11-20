import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { formatCurrency, formatDate } from '../utils/format.js';

const TransactionDetailPage = () => {
  const { id } = useParams();
  const [transaction, setTransaction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let isCancelled = false;

    const fetchTransaction = async () => {
      setLoading(true);
      setError('');
      try {
        const allTransactions = await api.getTransactions({ order: 'DESC', sortBy: 'occurredOn' });
        if (isCancelled) return;
        const match = allTransactions.find((tx) => String(tx.id) === String(id));
        if (!match) {
          setError('Fant ikke transaksjonen.');
          setTransaction(null);
        } else {
          setTransaction(match);
        }
      } catch (err) {
        if (!isCancelled) {
          setError(err.message || 'Kunne ikke hente transaksjon.');
          setTransaction(null);
        }
      } finally {
        if (!isCancelled) setLoading(false);
      }
    };

    fetchTransaction();

    return () => {
      isCancelled = true;
    };
  }, [id]);

  const metadataEntries = useMemo(() => {
    if (!transaction?.metadata) return [];
    return Object.entries(transaction.metadata);
  }, [transaction]);

  return (
    <div className="transaction-detail-page">
      <div className="page-header">
        <div>
          <p className="muted">Transaksjon</p>
          <h1>{transaction ? transaction.title : 'Detaljer'}</h1>
        </div>
        <Link to="/" className="back-link">
          ← Tilbake til oversikt
        </Link>
      </div>

      {loading && <p className="muted">Laster transaksjon...</p>}
      {error && !loading && <p className="error-text">{error}</p>}

      {!loading && !error && transaction && (
        <div className="transaction-card">
          <div className="transaction-main">
            <div>
              <p className="muted">Beløp</p>
              <p className="value" data-type={transaction.type}>
                {formatCurrency(transaction.amount)}
              </p>
            </div>
            <div>
              <p className="muted">Dato</p>
              <p className="value">{formatDate(transaction.occurredOn)}</p>
            </div>
            <div>
              <p className="muted">Kategori / side</p>
              <p className="value">{transaction.categoryName || transaction.pageName || 'Ikke valgt'}</p>
            </div>
            <div>
              <p className="muted">Type</p>
              <p className="value">{transaction.type === 'income' ? 'Inntekt' : 'Utgift'}</p>
            </div>
          </div>

          {transaction.notes && (
            <div className="transaction-notes">
              <p className="muted">Notat</p>
              <p>{transaction.notes}</p>
            </div>
          )}

          {metadataEntries.length > 0 && (
            <div className="transaction-metadata">
              <p className="muted">Metadata</p>
              <ul>
                {metadataEntries.map(([key, value]) => (
                  <li key={key}>
                    <span className="meta-key">{key}</span>
                    <span className="meta-value">{String(value)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TransactionDetailPage;
