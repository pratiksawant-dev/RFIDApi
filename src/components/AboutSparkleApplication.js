import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LuArrowLeft,
  LuArrowRight,
  LuCircleAlert,
  LuCircleCheck,
  LuClock,
  LuCloudDownload,
  LuDownload,
  LuHardDrive,
  LuMonitor,
  LuRefreshCw,
  LuRocket
} from 'react-icons/lu';
import '../styles/AboutSparkleApplication.css';

const HEADLINES = {
  idle: 'Check for updates',
  checking: 'Checking for updates',
  available: 'Updates are available',
  downloading: 'Downloading updates',
  ready: 'Updates are ready to install',
  current: "You're up to date",
  error: "We couldn't check for updates"
};

const formatChecked = () => new Date().toLocaleString(undefined, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit'
});

const UpdateGlyph = ({ phase }) => {
  const spinning = phase === 'checking' || phase === 'downloading';
  const Icon = phase === 'current' || phase === 'ready'
    ? LuCircleCheck
    : phase === 'available'
      ? LuCloudDownload
      : phase === 'error'
        ? LuCircleAlert
        : LuRefreshCw;
  return (
    <div className={`win-glyph is-${phase}`} aria-hidden="true">
      <Icon className={spinning ? 'is-spin' : 'is-pop'} />
    </div>
  );
};

const AboutSparkleApplication = () => {
  const navigate = useNavigate();
  const [version, setVersion] = React.useState('N/A');
  const [latestVersion, setLatestVersion] = React.useState('');
  const [status, setStatus] = React.useState('Sparkle RFID Dashboard will look for a newer desktop release.');
  const [progress, setProgress] = React.useState(0);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [phase, setPhase] = React.useState('idle');
  const [busy, setBusy] = React.useState(false);
  const [lastChecked, setLastChecked] = React.useState('');

  const hasDesktopApi = typeof window !== 'undefined' && !!window.electronAPI?.appGetVersion;
  const showUpgrade = phase === 'available' || phase === 'downloading' || phase === 'ready';
  const shownLatest = latestVersion || '—';

  React.useEffect(() => {
    if (!hasDesktopApi) return;
    window.electronAPI.appGetVersion()
      .then((result) => {
        const appVersion = String(result?.version || '').trim();
        setVersion(appVersion || 'N/A');
      })
      .catch(() => setVersion('N/A'));
  }, [hasDesktopApi]);

  React.useEffect(() => {
    if (!window.electronAPI?.onAppUpdaterStatus) return undefined;
    const unsub = window.electronAPI.onAppUpdaterStatus((event) => {
      if (!event?.type) return;
      if (event.type === 'update-available') {
        setLatestVersion(event?.version || '');
        setStatus(event?.message || 'A newer version is available.');
        setProgress(8);
        setPhase('available');
        setModalOpen(true);
      } else if (event.type === 'download-started') {
        setStatus(event?.message || 'Downloading update...');
        setProgress((prev) => Math.max(prev, 12));
        setPhase('downloading');
      } else if (event.type === 'download-progress') {
        setStatus('Downloading the installer...');
        setProgress(Number(event?.progress || 0));
        setPhase('downloading');
      } else if (event.type === 'update-downloaded') {
        setLatestVersion(event?.version || '');
        setStatus(event?.message || 'Download finished. Install to switch to the new version.');
        setProgress(100);
        setPhase('ready');
        setModalOpen(true);
      } else if (event.type === 'update-not-available') {
        setStatus('This desktop app is already on the newest release.');
        setProgress(100);
        setPhase('current');
        setLastChecked(formatChecked());
        setModalOpen(true);
      } else if (event.type === 'error') {
        setStatus(event?.message || 'Update operation failed.');
        setProgress(0);
        setPhase('error');
        setModalOpen(true);
      }
    });
    return () => unsub?.();
  }, []);

  const handleCheck = async () => {
    if (!window.electronAPI?.appCheckForUpdates || busy) return;
    setBusy(true);
    setStatus('Looking for updates...');
    setProgress(8);
    setPhase('checking');
    setModalOpen(true);
    try {
      const result = await window.electronAPI.appCheckForUpdates();
      setLastChecked(formatChecked());
      if (!result?.ok) {
        setStatus(
          result?.reason === 'skipped'
            ? (result?.details || 'Auto-update is disabled in development mode.')
            : result?.reason === 'not-configured'
              ? (result?.details || 'Updater feed URL is not configured for this build.')
              : (result?.reason || 'Unable to check updates right now.')
        );
        setProgress(0);
        setPhase('error');
        return;
      }
      if (result?.updateAvailable) {
        setLatestVersion(result?.latestVersion || '');
        setStatus(`Version ${result?.latestVersion} is available. Download it, then install.`);
        setProgress(12);
        setPhase('available');
      } else {
        setLatestVersion(result?.latestVersion || result?.currentVersion || '');
        setStatus(`Installed v${result?.currentVersion || version} matches the server.`);
        setProgress(100);
        setPhase('current');
      }
    } catch (error) {
      setStatus(error?.message || 'Unable to check updates right now.');
      setProgress(0);
      setPhase('error');
    } finally {
      setBusy(false);
    }
  };

  const handleDownload = async () => {
    if (!window.electronAPI?.appStartUpdateDownload || busy || phase !== 'available') return;
    setBusy(true);
    setPhase('downloading');
    setStatus('Starting the download...');
    try {
      const result = await window.electronAPI.appStartUpdateDownload();
      if (!result?.ok) {
        setStatus(result?.reason || result?.details || 'Failed to start download.');
        setPhase('error');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleInstall = async () => {
    if (!window.electronAPI?.appInstallDownloadedUpdate || busy || phase !== 'ready') return;
    setBusy(true);
    setStatus('Closing the app and installing the new version...');
    try {
      const result = await window.electronAPI.appInstallDownloadedUpdate();
      if (result && result.ok === false) {
        setStatus(result.reason || result.details || 'Install could not start.');
        setPhase('error');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="win-update-page">
      <div className="win-title-row">
        <button type="button" className="win-back" onClick={() => navigate('/rfid-utility')} aria-label="Back to RFID Utility Center">
          <LuArrowLeft />
        </button>
        <div>
          <h1>Sparkle Update</h1>
          <p>Download and install the latest Sparkle RFID Dashboard.</p>
        </div>
      </div>

      <div className="win-update-panel">
      <section className="win-update-hero" aria-live="polite">
        <UpdateGlyph phase={phase} />
        <div className="win-update-copy" key={phase}>
          <h2>{HEADLINES[phase] || HEADLINES.idle}</h2>
          <p>{status}</p>
          <p className="win-checked">
            <LuClock />
            {lastChecked ? `Last checked: ${lastChecked}` : 'Last checked: not yet'}
          </p>
          {(phase === 'checking' || phase === 'downloading' || phase === 'ready') && (
            <div className="win-progress">
              <div className="win-progress-fill" style={{ width: `${Math.max(8, Math.min(100, progress))}%` }} />
            </div>
          )}
          <div className="win-actions">
            <button type="button" className={`win-btn${phase === 'available' || phase === 'ready' ? '' : ' win-btn-primary'}`} onClick={handleCheck} disabled={!hasDesktopApi || busy}>
              <LuRefreshCw className={phase === 'checking' ? 'is-spin' : ''} />
              {busy && phase === 'checking' ? 'Checking...' : 'Check for updates'}
            </button>
            {phase === 'available' && (
              <button type="button" className="win-btn win-btn-primary" onClick={handleDownload} disabled={busy}>
                <LuDownload /> Download update
              </button>
            )}
            {phase === 'ready' && (
              <button type="button" className="win-btn win-btn-primary" onClick={handleInstall} disabled={busy}>
                <LuRocket /> Install and restart
              </button>
            )}
          </div>
        </div>
      </section>

      <div className="win-list">
        <div className="win-row">
          <span className="win-row-icon"><LuMonitor /></span>
          <div>
            <strong>Installed version</strong>
            <span>v{version} on this PC</span>
          </div>
        </div>
        <div className="win-row">
          <span className="win-row-icon"><LuHardDrive /></span>
          <div>
            <strong>Latest on server</strong>
            <span>{latestVersion ? `v${latestVersion}` : 'Check for updates to see the newest release'}</span>
          </div>
        </div>
        <div className="win-row">
          <span className="win-row-icon"><LuRocket /></span>
          <div>
            <strong>Install</strong>
            <span>
              {phase === 'ready'
                ? 'The new version is downloaded. Install and restart to finish.'
                : 'Download finishes first. Install and restart switches this PC to the new version.'}
            </span>
          </div>
        </div>
      </div>
      </div>

      {modalOpen && (
        <div className="win-overlay" onClick={() => { if (!busy) setModalOpen(false); }}>
          <div
            className={`win-dialog is-${phase}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="win-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="win-dialog-top">
              <UpdateGlyph phase={phase} />
              <div>
                <p className="win-kicker">{showUpgrade ? 'Update available' : HEADLINES[phase]}</p>
                <h3 id="win-dialog-title">{HEADLINES[phase]}</h3>
                <p>{status}</p>
              </div>
            </div>

            <div className="win-compare">
              <div>
                <span>Installed</span>
                <strong>v{version}</strong>
              </div>
              {showUpgrade ? <LuArrowRight /> : <span className="win-eq">=</span>}
              <div className={showUpgrade ? 'is-new' : ''}>
                <span>{showUpgrade ? 'Available' : 'Latest'}</span>
                <strong>{shownLatest === '—' ? shownLatest : `v${shownLatest}`}</strong>
              </div>
            </div>

            {(phase === 'checking' || phase === 'downloading' || phase === 'ready') && (
              <div className="win-progress win-progress-dialog">
                <div className="win-progress-fill" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
              </div>
            )}

            {showUpgrade && (
              <ol className="win-steps">
                <li className="is-done">Check</li>
                <li className={phase === 'available' ? 'is-current' : 'is-done'}>Download</li>
                <li className={phase === 'ready' ? 'is-current' : ''}>Install</li>
              </ol>
            )}

            <div className="win-dialog-actions">
              {showUpgrade && phase !== 'ready' && (
                <button type="button" className="win-btn win-btn-primary" onClick={handleDownload} disabled={busy || phase !== 'available'}>
                  <LuDownload /> {phase === 'downloading' ? 'Downloading...' : 'Download update'}
                </button>
              )}
              {showUpgrade && (
                <button type="button" className="win-btn win-btn-primary" onClick={handleInstall} disabled={busy || phase !== 'ready'}>
                  <LuRocket /> Install and restart
                </button>
              )}
              <button type="button" className="win-btn" onClick={() => setModalOpen(false)} disabled={busy}>
                {phase === 'current' ? 'Done' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AboutSparkleApplication;
