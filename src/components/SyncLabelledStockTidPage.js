import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FaSyncAlt, FaCheckCircle, FaInfoCircle } from 'react-icons/fa';
import { RiBarcodeFill } from 'react-icons/ri';
import { toast } from 'react-toastify';
import BackToProfileMenu from './common/BackToProfileMenu';
import NetworkErrorState from './common/NetworkErrorState';
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
            Copy EPC values from the RFID tables into labelled stock TID numbers for this client.
          </p>
        </div>
      </header>

      <section className="sync-tid-card">
        <span className="sync-tid-card-bar" />
        <div className="sync-tid-meta">
          <div>
            <span>Client code</span>
            <strong>{clientCode || 'Not signed in'}</strong>
          </div>
          <div>
            <span>Live API</span>
            <strong className="sync-tid-url" title={liveUrl}>{liveUrl}</strong>
          </div>
        </div>

        <div className="sync-tid-map">
          <h3><FaInfoCircle /> What this updates</h3>
          <ol>
            <li>
              <span>1</span>
              <div>
                <strong>Read labelled stock</strong>
                <p>Every <em>RFIDCode</em> for this client is collected.</p>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <strong>Match barcode EPC</strong>
                <p><em>tblRFID.BarcodeNumber</em> is matched to <em>TidValue</em>.</p>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <strong>Match RFID details</strong>
                <p><em>tblRFIDdetails.RFIDCode</em> is matched to <em>TIDValue</em>.</p>
              </div>
            </li>
            <li>
              <span>4</span>
              <div>
                <strong>Write TID number</strong>
                <p>The EPC is saved on <em>TIDNumber</em>. More than one EPC is joined with a comma.</p>
              </div>
            </li>
          </ol>
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
          <NetworkErrorState error={error} onRetry={() => setConfirmOpen(true)} variant="inline" />
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
    max-width: 980px;
    margin: 0 auto;
    padding: 4px 4px 40px;
    color: #0f172a;
    font-family: Inter, "Plus Jakarta Sans", system-ui, sans-serif;
  }
  .sync-tid-hero {
    display: flex;
    gap: 14px;
    align-items: flex-start;
    margin: 4px 0 16px;
  }
  .sync-tid-icon {
    width: 48px;
    height: 48px;
    border-radius: 14px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: #ede9fe;
    color: #6d28d9;
    font-size: 22px;
    flex-shrink: 0;
    box-shadow: inset 0 0 0 1px rgba(109, 40, 217, 0.08);
  }
  .sync-tid-kicker {
    margin: 2px 0 4px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #7c3aed;
  }
  .sync-tid-hero h1 {
    margin: 0;
    font-size: clamp(22px, 2.4vw, 28px);
    font-weight: 800;
    letter-spacing: -0.03em;
    line-height: 1.15;
  }
  .sync-tid-hero p {
    margin: 6px 0 0;
    max-width: 640px;
    color: #64748b;
    font-size: 14px;
    line-height: 1.5;
  }
  .sync-tid-card,
  .sync-tid-table-wrap {
    position: relative;
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 16px;
    padding: 18px;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
    overflow: hidden;
  }
  .sync-tid-card-bar {
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    height: 3px;
    background: linear-gradient(90deg, #6d28d9, #93c5fd);
  }
  .sync-tid-meta {
    display: grid;
    grid-template-columns: 180px minmax(0, 1fr);
    gap: 12px;
    margin: 4px 0 16px;
  }
  .sync-tid-meta > div {
    min-width: 0;
    padding: 12px 14px;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    background: #f8fafc;
  }
  .sync-tid-meta span {
    display: block;
    font-size: 10px;
    font-weight: 700;
    color: #94a3b8;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .sync-tid-meta strong {
    display: block;
    margin-top: 6px;
    font-size: 15px;
    letter-spacing: -0.02em;
  }
  .sync-tid-url {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px !important;
    font-weight: 600 !important;
    color: #334155;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  .sync-tid-map {
    border: 1px solid #e5e7eb;
    border-radius: 14px;
    padding: 16px;
    margin-bottom: 16px;
    background: #fff;
  }
  .sync-tid-map h3 {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 12px;
    font-size: 14px;
    font-weight: 800;
    color: #0f172a;
  }
  .sync-tid-map h3 svg { color: #6d28d9; }
  .sync-tid-map ol {
    list-style: none;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin: 0;
    padding: 0;
  }
  .sync-tid-map li {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    min-width: 0;
    padding: 10px;
    border-radius: 12px;
    background: #f8fafc;
  }
  .sync-tid-map li > span {
    width: 22px;
    height: 22px;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    background: #ede9fe;
    color: #6d28d9;
    font-size: 11px;
    font-weight: 800;
  }
  .sync-tid-map li strong {
    display: block;
    font-size: 13px;
    color: #0f172a;
  }
  .sync-tid-map li p {
    margin: 3px 0 0;
    font-size: 12px;
    line-height: 1.45;
    color: #64748b;
  }
  .sync-tid-map em {
    font-style: normal;
    font-weight: 700;
    color: #334155;
  }
  .sync-tid-progress {
    margin-bottom: 16px;
    padding: 12px 14px;
    border-radius: 12px;
    background: #f8fafc;
    border: 1px solid #e5e7eb;
  }
  .sync-tid-progress-top {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-size: 13px;
    color: #475569;
    margin-bottom: 8px;
  }
  .sync-tid-progress-top strong { color: #6d28d9; }
  .sync-tid-track {
    height: 8px;
    border-radius: 999px;
    background: #e2e8f0;
    overflow: hidden;
  }
  .sync-tid-fill {
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, #6d28d9, #2563eb);
    transition: width 0.35s ease;
  }
  .sync-tid-card .app-net-error { margin-bottom: 16px; }
  .sync-tid-alert {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    border-radius: 12px;
    padding: 12px 14px;
    font-size: 13px;
    margin-bottom: 16px;
  }
  .sync-tid-alert--ok {
    background: #f0fdf4;
    color: #166534;
    border: 1px solid #bbf7d0;
  }
  .sync-tid-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding-top: 4px;
  }
  .sync-tid-run {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 40px;
    border: none;
    border-radius: 999px;
    padding: 0 16px;
    background: #6d28d9;
    color: #fff;
    font-weight: 700;
    font-size: 14px;
    cursor: pointer;
    transition: background 0.16s ease, transform 0.16s ease;
  }
  .sync-tid-run:hover:not(:disabled) { background: #5b21b6; }
  .sync-tid-run:disabled {
    opacity: 0.6;
    cursor: not-allowed;
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
    position: relative;
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 14px;
    padding: 14px 14px 12px;
    overflow: hidden;
  }
  .sync-tid-stats article::before {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    height: 3px;
    background: var(--tone);
  }
  .sync-tid-stats span {
    display: block;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #64748b;
  }
  .sync-tid-stats strong {
    display: block;
    margin-top: 8px;
    font-size: 26px;
    letter-spacing: -0.03em;
    color: var(--tone);
  }
  .sync-tid-table-wrap { margin-top: 4px; }
  .sync-tid-table-wrap h3 {
    margin: 0 0 12px;
    font-size: 15px;
    font-weight: 800;
  }
  .sync-tid-table-scroll { overflow-x: auto; }
  .sync-tid-table-wrap table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  .sync-tid-table-wrap th,
  .sync-tid-table-wrap td {
    text-align: left;
    padding: 10px 8px;
    border-bottom: 1px solid #eef2f7;
    vertical-align: top;
  }
  .sync-tid-table-wrap th {
    color: #64748b;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    background: #f8fafc;
  }
  .sync-tid-table-wrap tbody tr:hover td { background: #fafafa; }
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
    z-index: 80;
    padding: 20px;
  }
  .sync-tid-modal-card {
    width: min(440px, 100%);
    background: #fff;
    border-radius: 16px;
    padding: 22px;
    box-shadow: 0 20px 40px rgba(15, 23, 42, 0.2);
  }
  .sync-tid-modal-card h3 {
    margin: 0 0 8px;
    font-size: 18px;
    letter-spacing: -0.02em;
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
    height: 36px;
    border: 1px solid #e5e7eb;
    background: #fff;
    border-radius: 999px;
    padding: 0 14px;
    font-weight: 700;
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
    .sync-tid-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
  @media (max-width: 720px) {
    .sync-tid-meta,
    .sync-tid-map ol,
    .sync-tid-stats { grid-template-columns: 1fr; }
    .sync-tid-actions { align-items: stretch; }
    .sync-tid-run { width: 100%; justify-content: center; }
    .sync-tid-hero h1 { font-size: 22px; }
    .sync-tid-modal-actions { flex-wrap: wrap; }
    .sync-tid-modal-actions button { flex: 1; }
  }
`;

export default SyncLabelledStockTidPage;
