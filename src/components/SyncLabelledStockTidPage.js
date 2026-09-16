import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FaSyncAlt, FaCheckCircle, FaExclamationTriangle, FaInfoCircle } from 'react-icons/fa';
import { RiBarcodeFill } from 'react-icons/ri';
import { toast } from 'react-toastify';
import BackToProfileMenu from './common/BackToProfileMenu';
import {
  getSyncLabelledStockTidUrl,
  syncLabelledStockTidFromRfidTable,
} from '../services/syncLabelledStockTidApi';

const PROGRESS_STEPS = [
  { at: 8, label: 'Connecting to live ProductMaster…' },
  { at: 28, label: 'Reading RFIDCode values from labelled stock…' },
  { at: 52, label: 'Matching EPC in tblRFID and tblRFIDdetails…' },
  { at: 74, label: 'Writing TIDNumber onto labelled stock…' },
  { at: 88, label: 'Joining multiple EPC values where needed…' },
  { at: 96, label: 'Finalizing sync summary…' },
];

const getSessionClientCode = () => {
  try {
    const userInfo = JSON.parse(localStorage.getItem('userInfo') || '{}');
    return String(userInfo.ClientCode || userInfo.clientCode || userInfo.clientcode || '').trim();
  } catch {
    return '';
  }
};

const SyncLabelledStockTidPage = () => {
  const [clientCode] = useState(getSessionClientCode);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const timerRef = useRef(null);

  const liveUrl = useMemo(() => getSyncLabelledStockTidUrl(), []);

  useEffect(() => () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
  }, []);

  const startProgress = () => {
    setProgress(4);
    setProgressLabel(PROGRESS_STEPS[0].label);
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => {
      setProgress((prev) => {
        const next = Math.min(prev + (prev < 40 ? 3.2 : prev < 70 ? 1.8 : 0.7), 92);
        const step = [...PROGRESS_STEPS].reverse().find((item) => next >= item.at) || PROGRESS_STEPS[0];
        setProgressLabel(step.label);
        return next;
      });
    }, 450);
  };

  const stopProgress = (value = 0, label = '') => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setProgress(value);
    setProgressLabel(label);
  };

  const runSync = async () => {
    if (!clientCode) {
      setError('Client Code not found in this session. Sign in again and retry.');
      toast.error('Client Code not found in session.');
      return;
    }

    setConfirmOpen(false);
    setLoading(true);
    setError('');
    setResult(null);
    startProgress();

    try {
      const data = await syncLabelledStockTidFromRfidTable(
        clientCode,
        localStorage.getItem('token')
      );
      stopProgress(100, 'Sync completed.');
      setResult(data);
      toast.success(data.message || 'Labelled stock TID numbers updated.');
    } catch (err) {
      const message =
        err?.response?.data?.Message ||
        err?.response?.data?.message ||
        err?.message ||
        'Failed to sync labelled stock TID numbers.';
      stopProgress(0, '');
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const stats = result
    ? [
        { label: 'Checked', value: result.totalChecked, tone: '#2563eb' },
        { label: 'Updated', value: result.updated, tone: '#16a34a' },
        { label: 'Already same', value: result.alreadySame, tone: '#0f766e' },
        { label: 'Not in RFID table', value: result.notFoundInRfidTable, tone: '#b45309' },
        { label: 'RFID mappings', value: result.rfidTableMappings, tone: '#7c3aed' },
      ]
    : [];

  return (
    <div className="sync-tid-page">
      <style>{pageStyles}</style>
      <BackToProfileMenu />

      <header className="sync-tid-hero">
        <span className="sync-tid-icon"><RiBarcodeFill /></span>
        <div>
          <p className="sync-tid-kicker">Live ProductMaster</p>
          <h1>Sync Labelled Stock TID</h1>
          <p>
            Copies EPC values from the RFID tables into labelled stock <strong>TIDNumber</strong> for this client.
          </p>
        </div>
      </header>

      <section className="sync-tid-card">
        <div className="sync-tid-meta">
          <div>
            <span>Client code</span>
            <strong>{clientCode || 'Not signed in'}</strong>
          </div>
          <div>
            <span>Live API</span>
            <strong className="sync-tid-url">{liveUrl}</strong>
          </div>
        </div>

        <div className="sync-tid-map">
          <h3><FaInfoCircle /> What this updates</h3>
          <ul>
            <li>Reads every <code>RFIDCode</code> from labelled stock.</li>
            <li>Looks up <code>tblRFID.BarcodeNumber</code> → <code>TidValue</code>.</li>
            <li>Looks up <code>tblRFIDdetails.RFIDCode</code> → <code>TIDValue</code>.</li>
            <li>Writes the EPC into labelled stock <code>TIDNumber</code>. Multiple EPCs are joined with a comma.</li>
          </ul>
        </div>

        {(loading || progress > 0) && (
          <div className="sync-tid-progress" aria-live="polite">
            <div className="sync-tid-progress-top">
              <span>{progressLabel || 'Ready'}</span>
              <strong>{Math.round(progress)}%</strong>
            </div>
            <div className="sync-tid-track">
              <div className="sync-tid-fill" style={{ width: `${Math.max(progress, loading ? 4 : 0)}%` }} />
            </div>
          </div>
        )}

        {error && (
          <div className="sync-tid-alert sync-tid-alert--error">
            <FaExclamationTriangle />
            <span>{error}</span>
          </div>
        )}

        {result && !loading && (
          <div className="sync-tid-alert sync-tid-alert--ok">
            <FaCheckCircle />
            <span>{result.message}</span>
          </div>
        )}

        <div className="sync-tid-actions">
          <button
            type="button"
            className="sync-tid-run"
            disabled={loading || !clientCode}
            onClick={() => setConfirmOpen(true)}
          >
            <FaSyncAlt className={loading ? 'is-spin' : ''} />
            {loading ? 'Syncing labelled stock…' : 'Sync TID from RFID table'}
          </button>
        </div>
      </section>

      {stats.length > 0 && (
        <section className="sync-tid-stats">
          {stats.map((item) => (
            <article key={item.label} style={{ '--tone': item.tone }}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </article>
          ))}
        </section>
      )}

      {result?.samples?.length > 0 && (
        <section className="sync-tid-table-wrap">
          <h3>Sample updates</h3>
          <div className="sync-tid-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Id</th>
                  <th>Item code</th>
                  <th>RFID code</th>
                  <th>Old TID</th>
                  <th>New TID</th>
                  <th>EPC count</th>
                </tr>
              </thead>
              <tbody>
                {result.samples.map((row, index) => (
                  <tr key={`${row.id || 'row'}-${index}`}>
                    <td>{row.id}</td>
                    <td>{row.itemCode || '—'}</td>
                    <td>{row.rfidCode || '—'}</td>
                    <td>{row.oldTidNumber || '—'}</td>
                    <td className="sync-tid-epc">{row.newTidNumber || '—'}</td>
                    <td>{row.epcCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {confirmOpen && (
        <div className="sync-tid-modal" role="dialog" aria-modal="true">
          <div className="sync-tid-modal-card">
            <h3>Run live TID sync?</h3>
            <p>
              This updates <strong>TIDNumber</strong> on labelled stock for <strong>{clientCode}</strong> using EPC
              values from the live RFID tables. Existing different values will be overwritten.
            </p>
            <div className="sync-tid-modal-actions">
              <button type="button" onClick={() => setConfirmOpen(false)}>Cancel</button>
              <button type="button" className="is-primary" onClick={runSync}>Yes, sync now</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const pageStyles = `
  .sync-tid-page {
    max-width: 1080px;
    margin: 0 auto;
    padding: 8px 8px 32px;
    color: #0f172a;
    font-family: Inter, "Plus Jakarta Sans", system-ui, sans-serif;
  }
  .sync-tid-hero {
    display: flex;
    gap: 16px;
    align-items: flex-start;
    margin: 8px 0 18px;
  }
  .sync-tid-icon {
    width: 52px;
    height: 52px;
    border-radius: 14px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: #ede9fe;
    color: #6d28d9;
    font-size: 24px;
    flex-shrink: 0;
  }
  .sync-tid-kicker {
    margin: 0 0 4px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #7c3aed;
  }
  .sync-tid-hero h1 {
    margin: 0;
    font-size: 28px;
    font-weight: 800;
    letter-spacing: -0.03em;
  }
  .sync-tid-hero p {
    margin: 6px 0 0;
    color: #64748b;
    font-size: 14px;
    line-height: 1.5;
  }
  .sync-tid-card,
  .sync-tid-table-wrap {
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 16px;
    padding: 20px;
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.04);
  }
  .sync-tid-meta {
    display: grid;
    grid-template-columns: 180px 1fr;
    gap: 16px;
    margin-bottom: 16px;
  }
  .sync-tid-meta span {
    display: block;
    font-size: 11px;
    font-weight: 700;
    color: #94a3b8;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .sync-tid-meta strong {
    display: block;
    margin-top: 4px;
    font-size: 14px;
  }
  .sync-tid-url {
    word-break: break-all;
    font-size: 12px !important;
    color: #334155;
    font-weight: 600 !important;
  }
  .sync-tid-map {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 14px 16px;
    margin-bottom: 18px;
  }
  .sync-tid-map h3 {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 8px;
    font-size: 14px;
    color: #334155;
  }
  .sync-tid-map ul {
    margin: 0;
    padding-left: 18px;
    color: #475569;
    font-size: 13px;
    line-height: 1.6;
  }
  .sync-tid-map code {
    background: #e2e8f0;
    border-radius: 4px;
    padding: 1px 5px;
    font-size: 12px;
  }
  .sync-tid-progress {
    margin-bottom: 16px;
  }
  .sync-tid-progress-top {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-size: 13px;
    color: #475569;
    margin-bottom: 8px;
  }
  .sync-tid-track {
    height: 10px;
    border-radius: 999px;
    background: #e2e8f0;
    overflow: hidden;
  }
  .sync-tid-fill {
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, #7c3aed, #2563eb);
    transition: width 0.35s ease;
  }
  .sync-tid-alert {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    border-radius: 12px;
    padding: 12px 14px;
    font-size: 13px;
    margin-bottom: 16px;
  }
  .sync-tid-alert--error {
    background: #fef2f2;
    color: #b91c1c;
    border: 1px solid #fecaca;
  }
  .sync-tid-alert--ok {
    background: #f0fdf4;
    color: #166534;
    border: 1px solid #bbf7d0;
  }
  .sync-tid-run {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    border: none;
    border-radius: 12px;
    padding: 12px 18px;
    background: #6d28d9;
    color: #fff;
    font-weight: 700;
    font-size: 14px;
    cursor: pointer;
  }
  .sync-tid-run:disabled {
    opacity: 0.65;
    cursor: wait;
  }
  .sync-tid-run .is-spin {
    animation: sync-tid-spin 0.8s linear infinite;
  }
  .sync-tid-stats {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 12px;
    margin: 16px 0;
  }
  .sync-tid-stats article {
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 14px;
    padding: 14px;
  }
  .sync-tid-stats span {
    display: block;
    font-size: 12px;
    color: #64748b;
  }
  .sync-tid-stats strong {
    display: block;
    margin-top: 6px;
    font-size: 24px;
    color: var(--tone);
  }
  .sync-tid-table-wrap {
    margin-top: 4px;
  }
  .sync-tid-table-wrap h3 {
    margin: 0 0 12px;
    font-size: 16px;
  }
  .sync-tid-table-scroll {
    overflow-x: auto;
  }
  .sync-tid-table-wrap table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  .sync-tid-table-wrap th,
  .sync-tid-table-wrap td {
    text-align: left;
    padding: 10px 8px;
    border-bottom: 1px solid #e2e8f0;
    vertical-align: top;
  }
  .sync-tid-table-wrap th {
    color: #64748b;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .sync-tid-epc {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 12px;
    word-break: break-all;
  }
  .sync-tid-modal {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 40;
    padding: 20px;
  }
  .sync-tid-modal-card {
    width: min(480px, 100%);
    background: #fff;
    border-radius: 16px;
    padding: 22px;
    box-shadow: 0 20px 40px rgba(15, 23, 42, 0.2);
  }
  .sync-tid-modal-card h3 {
    margin: 0 0 8px;
  }
  .sync-tid-modal-card p {
    margin: 0;
    color: #475569;
    font-size: 14px;
    line-height: 1.5;
  }
  .sync-tid-modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 18px;
  }
  .sync-tid-modal-actions button {
    border: 1px solid #cbd5e1;
    background: #fff;
    border-radius: 10px;
    padding: 8px 12px;
    font-weight: 600;
    cursor: pointer;
  }
  .sync-tid-modal-actions .is-primary {
    background: #6d28d9;
    border-color: #6d28d9;
    color: #fff;
  }
  @keyframes sync-tid-spin {
    to { transform: rotate(360deg); }
  }
  @media (max-width: 900px) {
    .sync-tid-meta,
    .sync-tid-stats {
      grid-template-columns: 1fr;
    }
  }
`;

export default SyncLabelledStockTidPage;
