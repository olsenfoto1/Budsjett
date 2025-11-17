import { useRef, useState } from 'react';
import { api } from '../api.js';

const DataPage = () => {
  const fileRef = useRef(null);
  const [exportData, setExportData] = useState(null);
  const [status, setStatus] = useState('');

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

  return (
    <div>
      <div className="card">
        <h2>Eksport</h2>
        <p>Last ned hele databasen som JSON for sikkerhetskopi.</p>
        <button onClick={handleExport}>Eksporter nå</button>
        {exportData && <pre style={{ whiteSpace: 'pre-wrap', marginTop: '1rem' }}>{JSON.stringify(exportData, null, 2)}</pre>}
      </div>

      <div className="card" style={{ marginTop: '1rem' }}>
        <h2>Import</h2>
        <p>Importer en tidligere eksport. Dette overskriver eksisterende data.</p>
        <input type="file" ref={fileRef} accept="application/json" />
        <button onClick={handleImport}>Importer</button>
      </div>

      {status && <p style={{ marginTop: '1rem', color: '#2563eb' }}>{status}</p>}
    </div>
  );
};

export default DataPage;
