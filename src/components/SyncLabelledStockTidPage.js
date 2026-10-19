import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FaSyncAlt, FaCheckCircle, FaInfoCircle, FaArrowLeft } from 'react-icons/fa';
import { toast } from 'react-toastify';
import PageHeader from './common/PageHeader';
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
        { label: 'Checked', value: result.totalChecked, tone: '#334155' },
        { label: 'Updated', value: result.updated, tone: '#0f766e' },
        { label: 'Already same', value: result.alreadySame, tone: '#0f766e' },
        { label: 'Not in RFID table', value: result.notFoundInRfidTable, tone: '#c2410c' },
        { label: 'RFID mappings', value: result.rfidTableMappings, tone: '#334155' },
      ]
    : [];

  return (
    <div className="sync-tid-page" style={{ fontFamily: 'var(--font-family)', padding: 0, background: '#fff', minHeight: '100%' }}>
      <style>{pageStyles}</style>

      <div className="page-top">
        <div className="page-top-inner">
          <PageHeader
            title="Sync Labelled Stock TID"
            subtitle="Live ProductMaster · copy EPC values from the RFID tables onto labelled stock TID numbers."
            barStyle={{ padding: 0, margin: 0, gap: 10, borderBottom: 'none' }}
            actions={(
              <>
                <span className="page-lot">
                  Client
                  <strong>{clientCode || '—'}</strong>
                </span>
                <Link to="/profile-menu" className="page-chip" style={{ textDecoration: 'none' }}>
                  <FaArrowLeft /> Back
                </Link>
              </>
            )}
          />
          <div className="page-toolbar">
            <span className="sync-tid-api" title={liveUrl}>
              <span>Live API</span>
              <strong>{liveUrl}</strong>
            </span>
            <div className="page-toolbar-actions">
              <button
                type="button"
                className="page-chip is-on"
                disabled={loading || !clientCode}
                onClick={() => setConfirmOpen(true)}
              >
                <FaSyncAlt className={loading ? 'is-spin' : ''} />
                {loading ? 'Syncing…' : 'Sync TID from RFID table'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <section className="sync-tid-map">
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
      </section>

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
  .sync-tid-page { color: #0f172a; }
  .sync-tid-api {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    flex: 1 1 240px;
    height: 28px;
    padding: 0 11px;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    background: #fff;
    color: #64748b;
    font-size: 11px;
    font-weight: 600;
  }
  .sync-tid-api strong {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: #0f172a;
    font-size: 11px;
    font-weight: 700;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  .sync-tid-page .page-chip .is-spin { animation: sync-tid-spin 0.8s linear infinite; }
  .sync-tid-map,
  .sync-tid-progress,
  .sync-tid-table-wrap {
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(15, 23, 42, 0.06);
  }
  .sync-tid-map { padding: 14px; margin-bottom: 12px; }
  .sync-tid-map h3 {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 12px;
    font-size: 13px;
    font-weight: 800;
    color: #0f172a;
  }
  .sync-tid-map h3 svg { color: #0f766e; }
  .sync-tid-map ol {
    list-style: none;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin: 0;
    padding: 0;
  }
  .sync-tid-map li {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    min-width: 0;
    padding: 10px 12px;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    background: #fff;
  }
  .sync-tid-map li > span {
    width: 22px;
    height: 22px;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    background: #f0fdfa;
    color: #0f766e;
    font-size: 11px;
    font-weight: 800;
  }
  .sync-tid-map li strong {
    display: block;
    font-size: 12px;
    color: #0f172a;
  }
  .sync-tid-map li p {
    margin: 3px 0 0;
    font-size: 11px;
    line-height: 1.45;
    color: #64748b;
  }
  .sync-tid-map em {
    font-style: normal;
    font-weight: 700;
    color: #334155;
  }
  .sync-tid-progress { margin-bottom: 12px; padding: 12px 14px; }
  .sync-tid-progress-top {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-size: 12px;
    font-weight: 600;
    color: #475569;
    margin-bottom: 8px;
  }
  .sync-tid-progress-top strong { color: #0f766e; }
  .sync-tid-track {
    height: 6px;
    border-radius: 999px;
    background: #e2e8f0;
    overflow: hidden;
  }
  .sync-tid-fill {
    height: 100%;
    border-radius: inherit;
    background: #0f766e;
    transition: width 0.35s ease;
  }
  .sync-tid-page .app-net-error { margin-bottom: 12px; }
  .sync-tid-alert {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    border-radius: 12px;
    padding: 12px 14px;
    font-size: 12px;
    font-weight: 600;
    margin-bottom: 12px;
  }
  .sync-tid-alert--ok {
    background: #f0fdfa;
    color: #0f766e;
    border: 1px solid #99f6e4;
  }
  .sync-tid-stats {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 8px;
    margin-bottom: 12px;
  }
  .sync-tid-stats article {
    position: relative;
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 12px 14px;
    box-shadow: 0 2px 8px rgba(15, 23, 42, 0.04);
    overflow: hidden;
  }
  .sync-tid-stats article::before {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    height: 2px;
    background: var(--tone);
  }
  .sync-tid-stats span {
    display: block;
    font-size: 11px;
    font-weight: 700;
    color: #64748b;
  }
  .sync-tid-stats strong {
    display: block;
    margin-top: 6px;
    font-size: 22px;
    letter-spacing: -0.03em;
    color: var(--tone);
    font-variant-numeric: tabular-nums;
  }
  .sync-tid-table-wrap { padding: 14px; }
  .sync-tid-table-wrap h3 {
    margin: 0 0 12px;
    font-size: 13px;
    font-weight: 800;
    color: #0f172a;
  }
  .sync-tid-table-scroll { overflow-x: auto; }
  .sync-tid-table-wrap table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }
  .sync-tid-table-wrap th,
  .sync-tid-table-wrap td {
    text-align: left;
    padding: 10px 8px;
    border-bottom: 1px solid #eef2f7;
    vertical-align: top;
    white-space: nowrap;
  }
  .sync-tid-table-wrap th {
    color: #475569;
    font-size: 11px;
    font-weight: 700;
    background: #f8fafc;
  }
  .sync-tid-table-wrap tbody tr:hover td { background: #f8fafc; }
  .sync-tid-epc {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 11px;
    white-space: normal;
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
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 18px;
    box-shadow: 0 20px 40px rgba(15, 23, 42, 0.16);
  }
  .sync-tid-modal-card h3 {
    margin: 0 0 8px;
    font-size: 15px;
    font-weight: 800;
    color: #0f172a;
  }
  .sync-tid-modal-card p {
    margin: 0;
    color: #475569;
    font-size: 13px;
    line-height: 1.5;
  }
  .sync-tid-modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 16px;
  }
  .sync-tid-modal-actions button {
    height: 32px;
    border: 1px solid #e2e8f0;
    background: #fff;
    color: #334155;
    border-radius: 6px;
    padding: 0 14px;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
  }
  .sync-tid-modal-actions .is-primary {
    background: #0f766e;
    border-color: #0f766e;
    color: #fff;
  }
  @keyframes sync-tid-spin {
    to { transform: rotate(360deg); }
  }
  @media (max-width: 900px) {
    .sync-tid-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
  @media (max-width: 720px) {
    .sync-tid-api { flex: 1 1 100%; }
    .sync-tid-map ol { grid-template-columns: 1fr; }
    .sync-tid-modal-actions { flex-wrap: wrap; }
    .sync-tid-modal-actions button { flex: 1; }
  }
  @media (max-width: 560px) {
    .sync-tid-page .page-toolbar-actions .page-chip { flex: 1 1 100%; }
    .sync-tid-stats { grid-template-columns: 1fr 1fr; }
  }
`;

export default SyncLabelledStockTidPage;
