import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FaArrowLeft,
  FaDownload,
  FaLink,
  FaMagic,
  FaPen,
  FaPlay,
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

const buildEpcWriteHex = (hex) => {
  let hexcode = padHexWords(hex);
  if (hexcode.length > 120) hexcode = hexcode.slice(0, 120);
  const words = hexcode.length / 4;
  const pc = ((words & 0x1F) << 11).toString(16).padStart(4, '0').toUpperCase();
  return { hexcode, payload: `${pc}${hexcode}`, wordPtr: 1, newEpc: hexcode };
};

const PAGE_SIZE = 20;

const shownEpc = (value) => realHexcode(value);

const shownCode = (row) => {
  const saved = String(row?.code || '').trim();
  if (saved && !looksLikeHex(saved)) return saved;
  const epc = shownEpc(row?.epc || row?.hexcode || row?.rfid);
  return hexToText(epc) || saved || epc;
};

const explainWriteError = (result, err) => {
  const raw = String(result?.message || err?.message || '').replace(/_/g, ' ').trim();
  const code = String(result?.code ?? '');
  if (/not connected/i.test(raw)) return 'The tray is not connected. Press Reconnect, then scan the QR again.';
  if (/could not start/i.test(raw)) return 'The reader did not start. Press Reconnect, then try again.';
  if (/no tag/i.test(raw)) return 'No tag was found. Place one tag flat on the tray and press Enter.';
  if (code === '-1') return 'This tag could not be written. Keep only one tag flat on the tray, then press Enter again.';
  if (!result) return 'The reader took too long to answer. Leave one tag on the tray and press Enter again.';
  if (raw) return 'The tag was not written. Keep only one tag flat on the tray, then press Enter again.';
  return 'The write did not finish. Leave one tag on the tray and press Enter again.';
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const epcFilterHex = (hex) => {
  const clean = String(hex || '').replace(/[^0-9a-f]/gi, '').toUpperCase();
  if (!clean) return '';
  const shown = realHexcode(clean).replace(/(00)+$/, '');
  const even = shown.length % 2 === 0 ? shown : shown.slice(0, -1);
  return even.length >= 4 ? padHexWords(even) : padHexWords(clean);
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
  const [booting, setBooting] = useState(typeof window !== 'undefined' && !!window.electronAPI?.rfidBridgeCommand);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState('');
  const [current, setCurrent] = useState(null);
  const [qrScan, setQrScan] = useState('');
  const [hexcode, setHexcode] = useState('');
  const [stationStatus, setStationStatus] = useState('The tray stays connected. Scan a QR and press Enter to write it onto the tag.');
  const [written, setWritten] = useState([]);
  const [page, setPage] = useState(1);
  const [trayTags, setTrayTags] = useState([]);
  const [accessPwd] = useState('00000000');
  const historyRef = useRef([]);
  const waitersRef = useRef(new Map());
  const scanningRef = useRef(false);
  const currentRef = useRef(null);
  const writeLock = useRef(false);
  const qrRef = useRef(null);
  const captureRef = useRef(null);
  const collectRef = useRef(false);
  const trayTagsRef = useRef(new Map());
  const readTimer = useRef(null);
  const connectPromise = useRef(null);
  const connectedRef = useRef(false);
  const bridgeDownAt = useRef(0);
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
      if (/Bridge exited/i.test(text)) {
        const now = Date.now();
        if (now - bridgeDownAt.current < 5000) return;
        bridgeDownAt.current = now;
        connectedRef.current = false;
        setConnected(false);
        setBooting(true);
        connectRef.current?.({ silent: true });
      }
    });
    const offTag = window.electronAPI.onRfidBridgeTag?.((tag) => {
      if (!scanningRef.current) return;
      const epc = String(tag?.epc || getTrayTagIdentity(tag) || '').replace(/[^0-9a-f]/gi, '').toUpperCase();
      if (!epc) return;
      const shown = realHexcode(epc);
      const next = { epc: shown, filterEpc: epc, code: hexToText(shown) || shown };
      if (collectRef.current) {
        if (!trayTagsRef.current.has(shown)) {
          trayTagsRef.current.set(shown, { id: shown, ...next });
          setTrayTags(Array.from(trayTagsRef.current.values()));
        }
        return;
      }
      const capture = captureRef.current;
      scanningRef.current = false;
      setScanning(false);
      runCommand('stop').catch(() => {});
      if (capture) {
        captureRef.current = null;
        capture(next);
        return;
      }
      currentRef.current = next;
      setCurrent(next);
      setStationStatus('Tag read. Present tags are listed below in green.');
      requestAnimationFrame(() => qrRef.current?.focus());
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

  const connect = useCallback(async ({ silent = false, mode, primary, secondary, baud } = {}) => {
    if (connectPromise.current) {
      const pending = connectPromise.current;
      return pending.then(() => connectRef.current?.({ silent, mode, primary, secondary, baud }));
    }
    const run = (async () => {
      setBusy('connect');
      try {
        const result = await connectTrayReaders({
          runCommand,
          lineHistory: historyRef.current,
          connectionMode: mode || connectionMode,
          comPrimary: primary || comPrimary,
          comSecondary: secondary || comSecondary,
          baudRate: baud || baudRate,
          powerAttDb10: readerConfig.powerAttDb10,
          parsePowerAttDb10,
          getDeviceCount: () => 0,
          quick: true,
        });
        const ok = result.effectiveDeviceCount > 0;
        connectedRef.current = ok;
        setConnected(ok);
        if (ok) {
          setStationStatus('Tray connected. Scan a QR and press Enter to write.');
          if (!silent) toast.success(result.message);
        } else {
          toast.error(result.message || 'Could not connect the tray.');
          setStationStatus('Tray is not connected. Check the reader, then press Reconnect.');
        }
        return ok;
      } catch (err) {
        connectedRef.current = false;
        setConnected(false);
        toast.error(err?.message || 'Connect failed.');
        setStationStatus('Tray is not connected. Check the reader, then press Reconnect.');
        return false;
      } finally {
        setBusy('');
        setBooting(false);
      }
    })();
    connectPromise.current = run;
    try {
      return await run;
    } finally {
      if (connectPromise.current === run) connectPromise.current = null;
    }
  }, [runCommand, connectionMode, comPrimary, comSecondary, baudRate, readerConfig.powerAttDb10]);

  const connectRef = useRef(connect);
  connectRef.current = connect;

  useEffect(() => {
    if (!hasBridge) return undefined;
    connectRef.current({ silent: true });
    return undefined;
  }, [hasBridge]);

  const finishRead = async () => {
    if (readTimer.current) {
      clearTimeout(readTimer.current);
      readTimer.current = null;
    }
    collectRef.current = false;
    scanningRef.current = false;
    setScanning(false);
    await runCommand('stop').catch(() => {});
    const matched = written.filter((row) => trayTagsRef.current.has(shownEpc(row.epc || row.hexcode || row.rfid))).length;
    setStationStatus(trayTagsRef.current.size
      ? `${matched} of ${written.length} written ${written.length === 1 ? 'tag is' : 'tags are'} on the tray.`
      : 'No tags on the tray. Lay the tags flat and press Read tag.');
    setBusy('');
  };
  const finishReadRef = useRef(finishRead);
  finishReadRef.current = finishRead;

  const startScan = async () => {
    if (readTimer.current) return;
    setBusy('scan');
    trayTagsRef.current = new Map();
    setTrayTags([]);
    collectRef.current = true;
    scanningRef.current = true;
    setScanning(true);
    setStationStatus('Reading every tag on the tray…');
    try {
      if (!connectedRef.current) {
        const ok = await connectRef.current({ silent: true });
        if (!ok) {
          collectRef.current = false;
          scanningRef.current = false;
          setScanning(false);
          setBusy('');
          return;
        }
      }
      setBusy('scan');
      trayTagsRef.current = new Map();
      setTrayTags([]);
      await runCommand('stop').catch(() => {});
      await runCommand('start');
      readTimer.current = setTimeout(() => finishReadRef.current(), 1100);
    } catch (err) {
      collectRef.current = false;
      scanningRef.current = false;
      setScanning(false);
      setBusy('');
      const reason = 'The reader did not start. Press Reconnect, then try again.';
      setStationStatus(reason);
      toast.error(reason);
    }
  };

  const stopScan = async () => {
    setBusy('stop');
    await finishReadRef.current();
  };

  const applyGeneratedHex = (source) => {
    const next = textValueHex(source);
    setHexcode(next);
    return next;
  };

  const findTagOnReader = () => new Promise((resolve) => {
    const timer = setTimeout(() => {
      captureRef.current = null;
      resolve(null);
    }, 900);
    captureRef.current = (tag) => {
      clearTimeout(timer);
      resolve(tag);
    };
  });

  const captureTag = async () => {
    collectRef.current = false;
    if (readTimer.current) {
      clearTimeout(readTimer.current);
      readTimer.current = null;
    }
    scanningRef.current = false;
    setScanning(false);
    await runCommand('stop').catch(() => {});
    scanningRef.current = true;
    setScanning(true);
    const found = findTagOnReader();
    try {
      await runCommand('start');
    } catch (err) {
      scanningRef.current = false;
      setScanning(false);
      captureRef.current = null;
      throw err;
    }
    const tag = await found;
    scanningRef.current = false;
    setScanning(false);
    await runCommand('stop').catch(() => {});
    await sleep(40);
    return tag;
  };

  const sendWrite = async (filter, plan, pwd) => {
    const token = `w${Date.now().toString(36)}${Math.floor(Math.random() * 36).toString(36)}`;
    const pending = waitForMem(token, 5000);
    await runCommand(`write-mem ${token} ${filter} epc ${plan.wordPtr} ${plan.payload} ${pwd}`);
    return pending;
  };

  const sameHex = (left, right) => {
    const a = realHexcode(left);
    const b = realHexcode(right);
    return Boolean(a) && a === b;
  };

  const readTray = async (ms) => {
    if (readTimer.current) {
      clearTimeout(readTimer.current);
      readTimer.current = null;
    }
    trayTagsRef.current = new Map();
    setTrayTags([]);
    collectRef.current = true;
    scanningRef.current = true;
    setScanning(true);
    await runCommand('stop').catch(() => {});
    await sleep(40);
    await runCommand('start');
    await sleep(ms);
    collectRef.current = false;
    scanningRef.current = false;
    setScanning(false);
    await runCommand('stop').catch(() => {});
    return Array.from(trayTagsRef.current.values());
  };

  const writeCurrent = async (hexOverride, codeOverride) => {
    if (writeLock.current) return;
    const pwd = String(accessPwd || '').replace(/[^0-9a-f]/gi, '');
    const scanned = String(codeOverride ?? qrRef.current?.value ?? qrScan ?? '').trim();
    const rawHex = String(hexOverride ?? hexcode ?? '').replace(/[^0-9a-f]/gi, '').toUpperCase()
      || textValueHex(scanned);
    if (!rawHex) {
      setStationStatus('Scan a QR or enter a hexcode.');
      qrRef.current?.focus();
      return;
    }
    if (pwd.length !== 8) {
      toast.error('Access password must be 8 hex characters. Default is 00000000.');
      return;
    }
    writeLock.current = true;
    setHexcode(rawHex);
    try {
      if (!connectedRef.current) {
        setStationStatus('Connecting the tray…');
        const ok = await connectRef.current({ silent: true });
        if (!ok) return;
      }
      setBusy('write');
      setStationStatus('Writing the tag…');
      const tag = await captureTag();
      if (!tag?.filterEpc) {
        const reason = 'No tag was found. Place one tag flat on the tray and press Enter.';
        setStationStatus(reason);
        toast.error(reason);
        return;
      }
      currentRef.current = tag;
      setCurrent(tag);
      const plan = buildEpcWriteHex(rawHex);
      const exact = String(tag.filterEpc || '').replace(/[^0-9a-f]/gi, '').toUpperCase();
      const trimmed = epcFilterHex(tag.epc || exact);
      let result = await sendWrite(exact || trimmed, plan, pwd);
      if (result?.ok !== '1' && trimmed && trimmed !== exact) {
        result = await sendWrite(trimmed, plan, pwd);
      }
      if (result?.ok !== '1') {
        const reason = explainWriteError(result);
        setStationStatus(reason);
        toast.error(reason);
        return;
      }
      setStationStatus(`Checking hexcode ${plan.newEpc} on the tag…`);
      const seen = await readTray(1200);
      const epcOnTag = seen.some((item) => sameHex(item.epc, plan.newEpc) || sameHex(item.filterEpc, plan.newEpc));
      if (!epcOnTag) {
        const reason = `Hexcode ${plan.newEpc} was not found on the tag. Keep one tag on the tray and press Enter again.`;
        setStationStatus(reason);
        toast.error(reason);
        return;
      }
      const epc = shownEpc(plan.newEpc);
      const code = (scanned && !looksLikeHex(scanned) ? scanned : '') || hexToText(epc) || epc;
      setWritten((prev) => {
        const next = [...prev, {
          id: `${epc}-${Date.now()}-${prev.length + 1}`,
          code,
          rfid: code,
          epc,
          hexcode: epc,
        }];
        return next;
      });
      setPage(Math.max(1, Math.ceil((written.length + 1) / PAGE_SIZE)));
      setQrScan('');
      setHexcode('');
      currentRef.current = null;
      setCurrent(null);
      setStationStatus(`Written. Hexcode ${epc} is on the tag. Scan the next QR and press Enter.`);
      requestAnimationFrame(() => qrRef.current?.focus());
    } catch (err) {
      const reason = explainWriteError(null, err);
      setStationStatus(reason);
      toast.error(reason);
    } finally {
      writeLock.current = false;
      setBusy('');
    }
  };

  const onStationKeyDown = (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const liveQr = qrRef.current?.value || qrScan;
    const fromQr = textValueHex(liveQr);
    const fromHex = String(hexcode || '').replace(/[^0-9a-f]/gi, '').toUpperCase();
    const next = event.currentTarget.classList.contains('is-hex') ? (fromHex || fromQr) : (fromQr || fromHex);
    if (fromQr) setHexcode(fromQr);
    writeCurrent(next, liveQr);
  };

  const exportWritten = () => {
    const lines = ['RFID code,EPC', ...written.map((row) => `${shownCode(row)},${shownEpc(row.epc || row.hexcode || row.rfid)}`)];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `written-tags-${written.length}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const presentEpcs = new Set(trayTags.map((tag) => shownEpc(tag.epc)));
  const displayRows = [];
  const seenEpcs = new Set();
  written.forEach((row) => {
    const epc = shownEpc(row.epc || row.hexcode || row.rfid);
    if (epc) seenEpcs.add(epc);
    displayRows.push({ ...row, ok: Boolean(epc) && presentEpcs.has(epc) });
  });
  trayTags.forEach((tag) => {
    const epc = shownEpc(tag.epc);
    if (!epc || seenEpcs.has(epc)) return;
    seenEpcs.add(epc);
    displayRows.push({
      id: `tray-${tag.id}`,
      code: tag.code,
      rfid: tag.code,
      epc,
      hexcode: epc,
      ok: true,
    });
  });
  const pageCount = Math.max(1, Math.ceil(displayRows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const pageRows = displayRows.slice(pageStart, pageStart + PAGE_SIZE);
  const pairs = [];
  for (let index = 0; index < pageRows.length; index += 2) {
    pairs.push({
      left: pageRows[index],
      right: pageRows[index + 1] || null,
      leftNo: pageStart + index + 1,
      rightNo: pageRows[index + 1] ? pageStart + index + 2 : null,
    });
  }
  const currentCode = current?.epc ? (hexToText(shownEpc(current.epc)) || current.epc) : '';

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
            <p>The tray stays connected. Scan a QR and press Enter to write that value onto the tag.</p>
          </div>
          <div className="write-tag-head-side">
            <label>
              Mode
              <select
                value={connectionMode}
                onChange={(e) => {
                  const next = e.target.value;
                  setConnectionMode(next);
                  connectRef.current({ silent: true, mode: next });
                }}
              >
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
            <div className={`write-tag-live ${scanning ? 'is-reading' : connected ? 'is-on' : booting ? 'is-reading' : ''}`}>
              {scanning ? 'Reading' : connected ? 'Connected' : booting ? 'Connecting' : 'Not connected'}
            </div>
            <button type="button" className="write-tag-connect" onClick={() => connect()} disabled={!hasBridge || !!busy}>
              <FaLink /> {busy === 'connect' ? 'Connecting…' : connected ? 'Reconnect' : 'Connect'}
            </button>
          </div>
        </div>
      </section>

      {!hasBridge ? (
        <div className="write-tag-banner">Open this page in the desktop app so the RFID tray bridge can read and write tags.</div>
      ) : null}

      <section className="write-tag-station">
        <div className="write-tag-station-row">
          <label className="write-tag-grow">
            QR scan
            <input
              ref={qrRef}
              value={qrScan}
              placeholder="Scan QR, then press Enter"
              autoFocus
              onChange={(e) => {
                const value = e.target.value;
                setQrScan(value);
                setHexcode(textValueHex(value));
              }}
              onKeyDown={onStationKeyDown}
            />
          </label>
          <label className="write-tag-grow">
            EPC
            <input
              className="is-hex"
              value={hexcode}
              placeholder="EPC hex from the QR"
              onChange={(e) => setHexcode(String(e.target.value || '').replace(/[^0-9a-f]/gi, '').toUpperCase())}
              onKeyDown={onStationKeyDown}
            />
          </label>
          <div className="write-tag-station-actions">
            <button type="button" className="is-ghost" onClick={() => applyGeneratedHex(qrScan)} disabled={!!busy}>
              <FaMagic /> Generate
            </button>
            <button type="button" className="is-green" onClick={startScan} disabled={!hasBridge || !!busy || scanning}>
              <FaPlay /> {scanning ? 'Reading…' : 'Read tag'}
            </button>
            {scanning ? (
              <button type="button" className="is-amber" onClick={stopScan} disabled={!hasBridge}>
                <FaStop /> Stop
              </button>
            ) : null}
            <button type="button" className="is-navy" onClick={() => writeCurrent(undefined, qrScan)} disabled={!!busy || !(hexcode || qrScan)}>
              <FaPen /> {busy === 'write' ? 'Writing…' : 'Write'}
            </button>
          </div>
        </div>
        <div className="write-tag-station-meta">
          <span>Current RFID</span>
          <strong>{currentCode || (connected ? 'Ready' : 'Waiting for tray')}</strong>
          <em>{stationStatus}</em>
        </div>
      </section>

      <section className="write-tag-table-wrap">
        <div className="write-tag-table-head">
          <div className="write-tag-table-title">
            <strong>Written tags</strong>
            <em className={displayRows.length ? 'is-on' : ''}>{displayRows.length.toLocaleString()} {displayRows.length === 1 ? 'tag' : 'tags'}</em>
          </div>
          <div className="write-tag-log-actions">
            <button type="button" className="is-ghost" onClick={exportWritten} disabled={!written.length}>
              <FaDownload /> Export all RFID and EPC
            </button>
            <button type="button" className="is-ghost" onClick={() => { setWritten([]); setTrayTags([]); trayTagsRef.current = new Map(); setPage(1); }} disabled={!displayRows.length || !!busy}>
              <FaTrash /> Clear
            </button>
          </div>
        </div>
        <div className="write-tag-log-head">
          <span>#</span>
          <span>RFID code</span>
          <span>EPC</span>
          <span className="is-right">#</span>
          <span className="is-right">RFID code</span>
          <span className="is-right">EPC</span>
        </div>
        {displayRows.length === 0 ? (
          <div className="write-tag-empty">
            <strong>No written tags yet</strong>
            <p>Place one tag on the tray, scan the QR, and press Enter. A read by itself is not added here.</p>
          </div>
        ) : (
          <>
            <div className="write-tag-log-body">
              {pairs.map((pair) => {
                const leftEpc = shownEpc(pair.left.epc || pair.left.hexcode || pair.left.rfid);
                const rightEpc = pair.right ? shownEpc(pair.right.epc || pair.right.hexcode || pair.right.rfid) : '';
                const leftOk = pair.left.ok;
                const rightOk = Boolean(pair.right?.ok);
                return (
                  <div key={pair.left.id} className="write-tag-log-row">
                    <span>{pair.leftNo}</span>
                    <strong>{shownCode(pair.left)}</strong>
                    <code>{leftEpc ? <span>{leftEpc}</span> : null}{leftOk ? <em className="write-tag-ok">OK</em> : null}</code>
                    <span className="is-right">{pair.rightNo || ''}</span>
                    <strong className="is-right">{pair.right ? shownCode(pair.right) : ''}</strong>
                    <code className="is-right">{rightEpc ? <span>{rightEpc}</span> : null}{rightOk ? <em className="write-tag-ok">OK</em> : null}</code>
                  </div>
                );
              })}
            </div>
            <div className="write-tag-pager">
              <span>{pageStart + 1}–{pageStart + pageRows.length} of {displayRows.length.toLocaleString()}</span>
              <div>
                <button type="button" onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))} disabled={safePage <= 1}>
                  Previous
                </button>
                <strong>Page {safePage} of {pageCount}</strong>
                <button type="button" onClick={() => setPage((currentPage) => Math.min(pageCount, currentPage + 1))} disabled={safePage >= pageCount}>
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
};

export default WriteTagUtility;
