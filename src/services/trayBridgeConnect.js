import { buildTrayStockLookupPayload, expandEpcLookupKeys } from '../utils/epcLookup';

/** Connection modes supported by rfid-bridge (Program.cs). */
export const TRAY_CONNECTION_MODES = Object.freeze({
  serial: 'serial',
  usb: 'usb',
});

export const TRAY_CONNECTION_MODE_OPTIONS = Object.freeze([
  { value: TRAY_CONNECTION_MODES.serial, label: 'COM / Serial (dual reader)' },
  { value: TRAY_CONNECTION_MODES.usb, label: 'USB (direct)' },
]);

export const normalizeComNumber = (value) => String(value || '').trim().replace(/^COM/i, '');

export const parseComNumber = (value) => {
  const normalized = normalizeComNumber(value);
  const parsed = Number.parseInt(normalized, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

export const parseBaudRate = (value) => {
  const parsed = Number.parseInt(String(value || '').trim(), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

/**
 * Bridge connect command sequence before set-power / start.
 * @param {{ connectionMode?: string, comPrimary?: string, comSecondary?: string, baudRate?: string }} config
 * @returns {{ commands: string[], mode: string, errors: string[] }}
 */
export const buildTrayConnectCommands = (config = {}) => {
  const mode = String(config.connectionMode || TRAY_CONNECTION_MODES.serial).toLowerCase();
  const errors = [];

  if (mode === TRAY_CONNECTION_MODES.usb) {
    return {
      mode: TRAY_CONNECTION_MODES.usb,
      commands: ['stop', 'disconnect', 'connect-usb'],
      errors,
    };
  }

  const primaryCom = parseComNumber(config.comPrimary);
  const secondaryCom = parseComNumber(config.comSecondary);
  const baud = parseBaudRate(config.baudRate) || 115200;

  if (!primaryCom) errors.push('Invalid primary COM port. Use number only (example: 7).');
  if (!secondaryCom) errors.push('Invalid secondary COM port. Use number only (example: 8).');

  if (errors.length) {
    return { mode: TRAY_CONNECTION_MODES.serial, commands: [], errors };
  }

  return {
    mode: TRAY_CONNECTION_MODES.serial,
    commands: [
      'stop',
      'disconnect',
      `connect-serial ${primaryCom} ${baud}`,
      `connect-serial ${secondaryCom} ${baud}`,
    ],
    errors,
  };
};

export const evaluateSerialConnectAttempt = (lines, comNumber) => {
  const text = (lines || []).join('\n').toLowerCase();
  const successNeedle = `connected via serial com${comNumber}`.toLowerCase();
  if (text.includes(successNeedle)) {
    return { ok: true, message: `COM${comNumber} connected.` };
  }
  if (text.includes('invalid com number')) {
    return { ok: false, message: `COM${comNumber} invalid. Use number only (example: ${comNumber}).` };
  }
  if (text.includes('serial connect failed')) {
    return { ok: false, message: `COM${comNumber} connection failed. Check cable, driver, and port.` };
  }
  if (text.includes('unable to load dll') && text.includes('uhfapi.dll')) {
    return { ok: false, message: 'RFID SDK DLL missing (UHFAPI.dll).' };
  }
  return { ok: null, message: `No explicit response for COM${comNumber} yet.` };
};

export const evaluateUsbConnectAttempt = (lines) => {
  const text = (lines || []).join('\n').toLowerCase();
  if (text.includes('connected via usb')) {
    return { ok: true, message: 'USB connected.' };
  }
  if (text.includes('usb connect failed')) {
    return { ok: false, message: 'USB connection failed. Check USB cable, driver, and libusb-1.0.dll.' };
  }
  if (text.includes('unable to load dll') && text.includes('uhfapi.dll')) {
    return { ok: false, message: 'RFID SDK DLL missing (UHFAPI.dll).' };
  }
  return { ok: null, message: 'No explicit USB connect response yet.' };
};

export const waitMs = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const waitForBridgeResponse = async (lineHistory, startIndex, timeoutMs = 1400) => {
  const history = Array.isArray(lineHistory) ? lineHistory : [];
  const startedAt = Date.now();
  let lastCount = startIndex;
  while (Date.now() - startedAt < timeoutMs) {
    const currentCount = history.length;
    if (currentCount > lastCount) {
      await waitMs(60);
      return history.slice(startIndex);
    }
    lastCount = currentCount;
    await waitMs(80);
  }
  return history.slice(startIndex);
};

const isConnectCommandSettled = (lines, cmd) => {
  const text = (lines || []).join('\n').toLowerCase();
  if (cmd === 'connect-usb') {
    return text.includes('connected via usb')
      || text.includes('usb connect failed')
      || /connected devices detected by sdk:\s*\d+/.test(text);
  }
  if (cmd.startsWith('connect-serial')) {
    const comNum = parseComNumber(cmd.split(' ')[1]);
    if (!comNum) {
      return text.includes('serial connect failed') || text.includes('invalid com number');
    }
    return text.includes(`connected via serial com${comNum}`)
      || text.includes('serial connect failed')
      || text.includes('invalid com number');
  }
  return (lines || []).length > 0;
};

/** Wait until bridge emits a real connect result (not just the echoed IPC CMD line). */
export const waitForConnectBridgeResponse = async (lineHistory, startIndex, cmd, timeoutMs = 2200, settleMs = 100) => {
  const history = Array.isArray(lineHistory) ? lineHistory : [];
  const startedAt = Date.now();
  const pollMs = settleMs < 50 ? 25 : 80;
  while (Date.now() - startedAt < timeoutMs) {
    const lines = history.slice(startIndex);
    if (lines.length > 0 && isConnectCommandSettled(lines, cmd)) {
      if (settleMs > 0) await waitMs(settleMs);
      return history.slice(startIndex);
    }
    await waitMs(pollMs);
  }
  return history.slice(startIndex);
};

const parseSdkDeviceCountFromHistory = (history) => {
  const list = Array.isArray(history) ? history : [];
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const match = String(list[i] || '').match(/connected devices detected by sdk:\s*(\d+)/i);
    if (match) return Number.parseInt(match[1], 10) || 0;
  }
  return 0;
};

const resolveEffectiveDeviceCount = async (getDeviceCount, history, timeoutMs = 2000, pollMs = 100) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const count = Math.max(getDeviceCount(), parseSdkDeviceCountFromHistory(history));
    if (count > 0) return count;
    await waitMs(pollMs);
  }
  return Math.max(getDeviceCount(), parseSdkDeviceCountFromHistory(history));
};

/** EPC/TID strings from tray scan modal rows (string or { epc, rfidCode }). */
export const normalizeTrayScanIdentities = (scanned) => Array.from(new Set(
  (Array.isArray(scanned) ? scanned : [])
    .map((item) => {
      if (typeof item === 'string') return String(item || '').trim().toUpperCase();
      return String(item?.epc || item?.EPC || item?.tid || item?.TID || '').trim().toUpperCase();
    })
    .filter(Boolean)
));

/** Expand scanned EPC/TID values to all lookup variants (padding + ASCII decode). */
export const expandTrayScanLookupKeys = (scanned) => buildTrayStockLookupPayload(scanned).epcKeys;

/**
 * Full reader connect sequence used by RFID Tray Connect and tray scan popups.
 * @returns {Promise<{ effectiveDeviceCount: number, mode: string, message: string }>}
 */
export const connectTrayReaders = async ({
  runCommand,
  lineHistory,
  connectionMode,
  comPrimary,
  comSecondary,
  baudRate,
  powerAttDb10,
  parsePowerAttDb10,
  getDeviceCount = () => 0,
  quick = false,
}) => {
  const { commands, errors, mode } = buildTrayConnectCommands({
    connectionMode,
    comPrimary,
    comSecondary,
    baudRate,
  });
  if (errors.length) {
    return { effectiveDeviceCount: 0, mode, message: errors.join(' ') };
  }

  const history = Array.isArray(lineHistory) ? lineHistory : [];

  try {
    await runCommand('stop');
  } catch (_) {
    /* ignore */
  }
  try {
    await runCommand('disconnect');
  } catch (_) {
    /* ignore */
  }

  let usbAttempt = { ok: null, message: '' };
  let primaryAttempt = { ok: null, message: '' };
  let secondaryAttempt = { ok: null, message: '' };

  for (let i = 0; i < commands.length; i += 1) {
    const cmd = commands[i];
    if (cmd === 'stop' || cmd === 'disconnect') continue;
    const start = history.length;
    await runCommand(cmd);
    const lines = await waitForConnectBridgeResponse(
      history,
      start,
      cmd,
      quick ? 900 : (mode === TRAY_CONNECTION_MODES.usb ? 2800 : 1800),
      quick ? 20 : 100
    );
    if (cmd === 'connect-usb') {
      usbAttempt = evaluateUsbConnectAttempt(lines);
    } else if (cmd.startsWith('connect-serial')) {
      const comNum = parseComNumber(cmd.split(' ')[1]);
      const attempt = evaluateSerialConnectAttempt(lines, comNum);
      if (primaryAttempt.ok === null && primaryAttempt.message === '') {
        primaryAttempt = attempt;
      } else {
        secondaryAttempt = attempt;
      }
    }
  }

  if (!quick) {
    await runCommand('devices');
    await runCommand('status');
  }

  let effectiveDeviceCount = await resolveEffectiveDeviceCount(getDeviceCount, history, quick ? 350 : 2200, quick ? 40 : 100);
  if (mode === TRAY_CONNECTION_MODES.usb && effectiveDeviceCount === 0 && usbAttempt.ok === true) {
    effectiveDeviceCount = 1;
  }

  const parsedPower = parsePowerAttDb10(powerAttDb10);
  if (parsedPower !== null && effectiveDeviceCount > 0) {
    try {
      await runCommand(`set-power ${parsedPower}`);
    } catch (_) {
      /* optional */
    }
  } else if (effectiveDeviceCount > 0) {
    try {
      await runCommand('set-power 0');
    } catch (_) {
      /* optional */
    }
  }

  if (effectiveDeviceCount > 0) {
    return {
      effectiveDeviceCount,
      mode,
      message: effectiveDeviceCount > 1
        ? `${effectiveDeviceCount} reader(s) connected.`
        : 'Reader connected.',
    };
  }

  if (mode === TRAY_CONNECTION_MODES.usb) {
    if (usbAttempt.ok === false) {
      return { effectiveDeviceCount: 0, mode, message: usbAttempt.message };
    }
    if (usbAttempt.ok === true || effectiveDeviceCount > 0) {
      const count = Math.max(effectiveDeviceCount, 1);
      return {
        effectiveDeviceCount: count,
        mode,
        message: count > 1 ? `${count} reader(s) connected.` : 'USB connected.',
      };
    }
    return {
      effectiveDeviceCount: 0,
      mode,
      message: 'No USB readers detected. Check cable, driver, and libusb-1.0.dll.',
    };
  }

  const failedAttempts = [primaryAttempt, secondaryAttempt].filter((item) => item.ok === false);
  if (failedAttempts.length) {
    return {
      effectiveDeviceCount: 0,
      mode,
      message: failedAttempts.map((item) => item.message).join(' '),
    };
  }

  return {
    effectiveDeviceCount: 0,
    mode,
    message: 'No readers detected. Verify COM ports, power, and driver.',
  };
};
