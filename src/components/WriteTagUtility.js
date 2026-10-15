import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FaArrowLeft,
  FaBarcode,
  FaCheck,
  FaLink,
  FaPen,
  FaPlay,
  FaSearch,
  FaStop,
  FaTrash,
} from 'react-icons/fa';
import { toast } from 'react-toastify';
import '../styles/WriteTagUtility.css';
import { connectTrayReaders, TRAY_CONNECTION_MODE_OPTIONS, TRAY_CONNECTION_MODES } from '../services/trayBridgeConnect';
import { getTrayReaderConfig, parsePowerAttDb10 } from '../services/trayReaderConfig';
import { getTrayTagIdentity } from '../utils/trayTagParse';

const textToHex = (value) => Array.from(new TextEncoder().encode(String(value || '')))
  .map((byte) => byte.toString(16).padStart(2, '0'))
  .join('')
  .toUpperCase();

const padHexWords = (hex) => {
  const clean = String(hex || '').replace(/[^0-9a-f]/gi, '').toUpperCase();
  return clean.length % 4 === 0 ? clean : `${clean}${'0'.repeat(4 - (clean.length % 4))}`;
};

const looksLikeHex = (value) => {
  const clean = String(value || '').replace(/\s+/g, '');
  return clean.length >= 4 && clean.length % 2 === 0 && /^[0-9a-f]+$/i.test(clean) && /[a-f]/i.test(clean);
};

const qrScanToHex = (value) => {
  const text = String(value || '').trim();
  if (!text) return '';
  const hex = looksLikeHex(text) ? text.replace(/\s+/g, '').toUpperCase() : textToHex(text);
  return trimHexPadding(hex);
};

const hexWords = (hex) => Math.min(32, Math.max(1, padHexWords(hex).length / 4));

const trimHexPadding = (hex) => String(hex || '').replace(/[^0-9a-f]/gi, '').toUpperCase().replace(/(00)+$/, '');

const hexToText = (hex) => {
  const clean = String(hex || '').replace(/[^0-9a-f]/gi, '').toUpperCase();
  if (clean.length < 2) return '';
  let text = '';
  for (let i = 0; i + 1 < clean.length; i += 2) {
    const code = Number.parseInt(clean.slice(i, i + 2), 16);
    if (!Number.isFinite(code) || code < 32 || code > 126) break;
    text += String.fromCharCode(code);
  }
  return text;
};

const textValueHex = (value) => {
  const text = String(value || '').trim();
  if (!text) return '';
  return trimHexPadding(qrScanToHex(text));
};

const realHexcode = (hex) => {
  const clean = String(hex || '').replace(/[^0-9a-f]/gi, '').toUpperCase();
  if (!clean) return '';
  const text = hexToText(clean);
  const exact = text ? textToHex(text) : '';
  if (exact && clean.startsWith(exact) && clean.length > exact.length) return exact;
  return clean;
};

const hexMatches = (written, read) => {
  const left = trimHexPadding(written);
  const right = trimHexPadding(read);
  if (!left || !right) return false;
  return right === left || right.startsWith(left) || left.startsWith(right);
};

const buildEpcWriteHex = (hex) => {
  let hexcode = padHexWords(hex);
  if (hexcode.length > 120) hexcode = hexcode.slice(0, 120);
  const words = hexcode.length / 4;
  const pc = ((words & 0x1F) << 11).toString(16).padStart(4, '0').toUpperCase();
  return { hexcode, payload: `${pc}${hexcode}`, wordPtr: 1, newEpc: hexcode };
};

const parseMemLine = (line) => {
  const text = String(line || '').trim();
  const start = text.toUpperCase().indexOf('MEM ');
  if (start < 0) return null;
  const body = text.slice(start + 4);
  const fields = {};
  body.split(/\s+/).forEach((token) => {
    const eq = token.indexOf('=');
    if (eq <= 0) return;
    fields[token.slice(0, eq).toLowerCase()] = token.slice(eq + 1);
  });
  if (!fields.token) return null;
  return fields;
};

const WriteTagUtility = () => {
  const navigate = useNavigate();
  const readerConfig = useMemo(() => getTrayReaderConfig(), []);
  const [connectionMode, setConnectionMode] = useState(readerConfig.connectionMode);
  const [comPrimary, setComPrimary] = useState(readerConfig.comPrimary);
  const [comSecondary, setComSecondary] = useState(readerConfig.comSecondary);
  const [baudRate, setBaudRate] = useState(readerConfig.baudRate);
  const [connected, setConnected] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState('');
  const [rows, setRows] = useState([]);
  const [accessPwd] = useState('00000000');
  const historyRef = useRef([]);
  const waitersRef = useRef(new Map());
  const scanningRef = useRef(false);
  const hasBridge = typeof window !== 'undefined' && !!window.electronAPI?.rfidBridgeCommand;

  const runCommand = useCallback(async (command) => {
    if (!hasBridge) throw new Error('RFID bridge is available in the desktop app only.');
    return window.electronAPI.rfidBridgeCommand(command);
  }, [hasBridge]);

  useEffect(() => {
    if (!hasBridge) return undefined;
    window.electronAPI.rfidBridgeEnsure?.().catch(() => {});
    const offLine = window.electronAPI.onRfidBridgeLine?.((line) => {
      const text = String(line || '');
      historyRef.current.push(text);
      if (historyRef.current.length > 400) historyRef.current.shift();
      const mem = parseMemLine(text);
      if (mem?.token && waitersRef.current.has(mem.token)) {
        const resolve = waitersRef.current.get(mem.token);
        waitersRef.current.delete(mem.token);
        resolve(mem);
      }
    });
    const offTag = window.electronAPI.onRfidBridgeTag?.((tag) => {
      if (!scanningRef.current) return;
      const epc = String(tag?.epc || getTrayTagIdentity(tag) || '').replace(/[^0-9a-f]/gi, '').toUpperCase();
      if (!epc) return;
      scanningRef.current = false;
      setScanning(false);
      runCommand('stop').catch(() => {});
      setRows((prev) => {
        const shown = realHexcode(epc);
        const qrText = hexToText(shown);
        const same = (row) => row.filterEpc === epc || row.epc === epc || row.epc === shown;
        if (prev.some(same)) {
          return prev.map((row) => (same(row) ? {
            ...row,
            epc: shown,
            filterEpc: epc,
            reads: row.reads + 1,
            qrText,
            qrHex: shown,
            readHex: shown,
            status: 'Scanned',
            tone: 'ok',
            matched: true,
          } : row));
        }
        return [...prev, {
          id: `${epc}-${Date.now()}`,
          epc: shown,
          filterEpc: epc,
          qrScan: '',
          qrText,
          qrHex: shown,
          readHex: shown,
          reads: 1,
          status: 'Scanned',
          tone: 'ok',
          matched: true,
        }];
      });
    });
    return () => {
      if (typeof offLine === 'function') offLine();
      if (typeof offTag === 'function') offTag();
    };
  }, [hasBridge]);

  const waitForMem = (token, timeoutMs = 8000) => new Promise((resolve) => {
    const timer = setTimeout(() => {
      waitersRef.current.delete(token);
      resolve(null);
    }, timeoutMs);
    waitersRef.current.set(token, (mem) => {
      clearTimeout(timer);
      resolve(mem);
    });
  });

  const connect = async () => {
    setBusy('connect');
    try {
      const result = await connectTrayReaders({
        runCommand,
        lineHistory: historyRef.current,
        connectionMode,
        comPrimary,
        comSecondary,
        baudRate,
        powerAttDb10: readerConfig.powerAttDb10,
        parsePowerAttDb10,
        getDeviceCount: () => 0,
        quick: true,
      });
      setConnected(result.effectiveDeviceCount > 0);
      if (result.effectiveDeviceCount > 0) toast.success(result.message);
      else toast.error(result.message);
    } catch (err) {
      toast.error(err?.message || 'Connect failed.');
    } finally {
      setBusy('');
    }
  };

  const startScan = async () => {
    scanningRef.current = true;
    setScanning(true);
    setBusy('scan');
    try {
      await runCommand('start');
      if (!scanningRef.current) await runCommand('stop');
    } catch (err) {
      scanningRef.current = false;
      setScanning(false);
      toast.error(err?.message || 'Could not start scan.');
    } finally {
      setBusy('');
    }
  };

  const stopScan = async () => {
    scanningRef.current = false;
    setScanning(false);
    setBusy('stop');
    try {
      await runCommand('stop');
    } catch (err) {
      toast.error(err?.message || 'Could not stop scan.');
    } finally {
      setBusy('');
    }
  };

  const updateRow = (id, patch) => {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const readTagHex = async (epc, pwd, words, timeoutMs = 1600) => {
    const token = `t${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
    const pending = waitForMem(token, timeoutMs);
    await runCommand(`read-mem ${token} ${epc} epc 2 ${words} ${pwd}`);
    return pending;
  };

  const runMemory = async (row, action) => {
    const pwd = String(accessPwd || '').replace(/[^0-9a-f]/gi, '');
    if (pwd.length !== 8) {
      toast.error('Access password must be 8 hex characters. Default is 00000000.');
      return;
    }
    const rawHex = String(row.qrHex || '').replace(/[^0-9a-f]/gi, '').toUpperCase();
    if (action === 'write' && !rawHex) {
      toast.error('Enter a hexcode. Write stores only that hexcode.');
      return;
    }
    const wasScanning = scanningRef.current;
    scanningRef.current = false;
    setScanning(false);
    setBusy(row.id);
    if (wasScanning) await runCommand('stop').catch(() => {});
    const writePlan = action === 'write' ? buildEpcWriteHex(rawHex) : null;
    updateRow(row.id, {
      ...(writePlan ? { qrHex: writePlan.hexcode } : {}),
      matched: false,
      status: action === 'write' ? 'Writing…' : 'Reading…',
      tone: 'busy',
    });
    try {
      if (action === 'read') {
        const knownText = hexToText(row.epc) || String(row.qrText || '').trim();
        if (knownText) {
          updateRow(row.id, { qrText: knownText, status: 'Reading…', tone: 'busy' });
        }
        const words = Math.min(6, Math.max(2, hexWords(row.filterEpc || row.epc)));
        const mem = await readTagHex(row.filterEpc || row.epc, pwd, words, 1600);
        const ok = mem?.ok === '1';
        const readFull = String((ok ? mem.data : row.filterEpc || row.epc) || '').replace(/[^0-9a-f]/gi, '').toUpperCase();
        const readHex = realHexcode(readFull);
        const nextText = hexToText(readHex) || knownText;
        updateRow(row.id, {
          epc: readHex || row.epc,
          filterEpc: readFull || row.filterEpc || row.epc,
          qrText: nextText,
          qrHex: readHex || row.qrHex,
          readHex,
          matched: true,
          status: ok ? 'Scanned' : 'Showing last tag value',
          tone: 'ok',
        });
        if (ok) toast.success(nextText ? `Tag read: ${nextText}` : 'Tag read.');
        else toast.error('Could not re-read the tag. Showing the last scanned value.');
        return;
      }

      const { hexcode, payload, wordPtr, newEpc } = writePlan;
      const token = `w${Date.now().toString(36)}`;
      const pending = waitForMem(token, 1800);
      await runCommand(`write-mem ${token} ${row.filterEpc || row.epc} epc ${wordPtr} ${payload} ${pwd}`);
      const written = await pending;
      if (written?.ok !== '1') {
        updateRow(row.id, {
          qrHex: hexcode,
          matched: false,
          status: (written?.message || `Write failed (${written?.code || 'timeout'})`).replace(/_/g, ' '),
          tone: 'bad',
        });
        toast.error('Write failed. Keep only this tag on the tray.');
        return;
      }
      updateRow(row.id, {
        epc: newEpc,
        filterEpc: row.filterEpc || newEpc,
        qrHex: hexcode,
        qrText: hexToText(hexcode),
        readHex: hexcode,
        matched: true,
        status: 'Written',
        tone: 'ok',
      });
      toast.success('Hexcode written.');
    } catch (err) {
      updateRow(row.id, { matched: false, status: err?.message || 'Command failed', tone: 'bad' });
      toast.error(err?.message || 'Command failed.');
    } finally {
      setBusy('');
    }
  };

  const isUsb = connectionMode === TRAY_CONNECTION_MODES.usb;

  return (
    <div className="write-tag-page">
      <section className="write-tag-top">
        <div className="write-tag-top-main">
          <button type="button" className="write-tag-back" onClick={() => navigate('/rfid-utility')}>
            <FaArrowLeft /> RFID Utility
          </button>
          <div className="write-tag-title">
            <h1>Write Tag</h1>
            <p>Read one tag, scan the QR, then write. The row turns green when the tag matches the hexcode.</p>
          </div>
          <div className="write-tag-steps">
            <span><b>1</b> Read tag</span>
            <span><b>2</b> Scan QR</span>
            <span><b>3</b> Write</span>
          </div>
        </div>
        <div className="write-tag-top-bar">
          <label>
            Mode
            <select value={connectionMode} onChange={(e) => setConnectionMode(e.target.value)}>
              {TRAY_CONNECTION_MODE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </label>
          {!isUsb ? (
            <>
              <label>
                COM 1
                <input value={comPrimary} onChange={(e) => setComPrimary(e.target.value)} />
              </label>
              <label>
                COM 2
                <input value={comSecondary} onChange={(e) => setComSecondary(e.target.value)} />
              </label>
              <label>
                Baud
                <input value={baudRate} onChange={(e) => setBaudRate(e.target.value)} />
              </label>
            </>
          ) : null}
          <div className={`write-tag-live ${scanning ? 'is-reading' : connected ? 'is-on' : ''}`}>
            {scanning ? 'Reading' : connected ? 'Connected' : 'Not connected'}
          </div>
          <div className="write-tag-actions">
            <button type="button" className="is-navy" onClick={connect} disabled={!hasBridge || !!busy}>
              <FaLink /> {busy === 'connect' ? 'Connecting…' : connected ? 'Reconnect' : 'Connect'}
            </button>
            <button type="button" className="is-green" onClick={startScan} disabled={!hasBridge || !!busy || scanning}>
              <FaPlay /> {scanning ? 'Reading…' : 'Read tags'}
            </button>
            <button type="button" className="is-amber" onClick={stopScan} disabled={!hasBridge || !scanning}>
              <FaStop /> Stop
            </button>
            <button type="button" className="is-ghost" onClick={() => setRows([])} disabled={!!busy}>
              <FaTrash /> Clear
            </button>
          </div>
        </div>
      </section>

      {!hasBridge ? (
        <div className="write-tag-banner">Open this page in the desktop app so the RFID tray bridge can read and write tags.</div>
      ) : null}

      <section className="write-tag-table-wrap">
        <div className="write-tag-table-head">
          <div>
            <span className="write-tag-table-mark"><FaBarcode /></span>
            <div>
              <strong>Scanned tags</strong>
              <small>{rows.length} on the tray</small>
            </div>
          </div>
          <em className={scanning ? 'is-reading' : connected ? 'is-on' : ''}>
            {scanning ? 'Reading' : connected ? 'Connected' : 'Not connected'}
          </em>
        </div>
        {rows.length === 0 ? (
          <div className="write-tag-empty">
            <span className="write-tag-empty-icon" aria-hidden="true"><FaBarcode /></span>
            <strong>No tag on the tray yet</strong>
            <p>Connect the reader, read one tag, then scan the QR and write the hexcode.</p>
            <div className="write-tag-empty-steps">
              <span><b>1</b> Connect</span>
              <span><b>2</b> Read tag</span>
              <span><b>3</b> Write hexcode</span>
            </div>
          </div>
        ) : (
        <div className="write-tag-scroll">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>EPC</th>
                <th>QR scan</th>
                <th>QR text</th>
                <th>QR Hexcode</th>
                <th>Write</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.id} className={row.tone === 'ok' || row.matched ? 'is-match' : ''}>
                  <td className="write-tag-index"><span>{index + 1}</span></td>
                  <td>
                    <code>{realHexcode(row.epc)}</code>
                  </td>
                  <td>
                    <label className="write-tag-field">
                    <input
                      value={row.qrScan}
                      placeholder="Scan or type QR"
                      onChange={(e) => {
                        const qrScan = e.target.value;
                        const qrText = qrScan.trim();
                        updateRow(row.id, {
                          qrScan,
                          qrText,
                          qrHex: textValueHex(qrText),
                          matched: false,
                          tone: 'idle',
                          status: 'Ready to write',
                        });
                      }}
                    />
                    </label>
                  </td>
                  <td>
                    <label className="write-tag-field">
                      <input
                        className="is-text"
                        value={row.qrText ?? hexToText(row.epc)}
                        placeholder="Hex as text"
                        onChange={(e) => {
                          const qrText = e.target.value;
                          updateRow(row.id, {
                            qrText,
                            qrHex: textValueHex(qrText.trim()),
                            matched: false,
                            tone: 'idle',
                            status: 'Ready to write',
                          });
                        }}
                      />
                    </label>
                  </td>
                  <td>
                    <label className="write-tag-field">
                    <input
                      className="is-hex"
                      value={row.qrHex}
                      placeholder="Hex written to the tag"
                      onChange={(e) => {
                        const nextHex = String(e.target.value || '').replace(/[^0-9a-f]/gi, '').toUpperCase();
                        updateRow(row.id, {
                          qrHex: nextHex,
                          qrText: hexToText(nextHex),
                          matched: false,
                          tone: 'idle',
                          status: 'Ready',
                        });
                      }}
                    />
                    </label>
                  </td>
                  <td>
                    <div className="write-tag-row-actions">
                      <button type="button" onClick={() => runMemory(row, 'read')} disabled={!!busy}>
                        <FaSearch /> Read
                      </button>
                      <button type="button" className="is-write" onClick={() => runMemory(row, 'write')} disabled={!!busy}>
                        <FaPen /> Write
                      </button>
                      <span className={`write-tag-status tone-${row.tone}`}>
                        {row.tone === 'ok' ? <FaCheck /> : null}
                        {row.status}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </section>
    </div>
  );
};

export default WriteTagUtility;
