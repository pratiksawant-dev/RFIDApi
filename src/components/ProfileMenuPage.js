import React from 'react';
import { Link } from 'react-router-dom';
import { FaArrowRight } from 'react-icons/fa';
import {
  RiTestTubeFill,
  RiBookReadFill,
  RiFlashlightFill,
  RiFileDownloadFill,
  RiFolderDownloadFill,
  RiPriceTag3Fill,
  RiBarcodeFill,
  RiFingerprintFill,
  RiCamera2Fill,
  RiGlobalLine,
  RiFolderOpenLine,
  RiCodeSSlashLine,
} from 'react-icons/ri';
import { getApiMode } from '../services/apiBaseConfig';

const THEMES = {
  green: { accent: '#16a34a', soft: '#e7f7f2', ink: '#15803d' },
  orange: { accent: '#f68b1e', soft: '#fff5ec', ink: '#c2410c' },
  purple: { accent: '#8e44ad', soft: '#f3e8ff', ink: '#6b21a8' },
  blue: { accent: '#2d74da', soft: '#e8f0fe', ink: '#1d4ed8' },
  teal: { accent: '#0d9488', soft: '#e6fffa', ink: '#0f766e' },
};

const buildMenuItems = () => {
  const base = [
    { path: '/download-folder-settings', icon: RiFolderOpenLine, label: 'Download Folders (Exports & PRN)', theme: 'green', description: 'Choose where labelled stock exports (Excel/PDF) and PRN label files are saved.' },
    { path: '/dashboard', icon: RiTestTubeFill, label: 'API Testing (Postman)', theme: 'orange', description: 'Playground to test integrated APIs with request and response payloads.' },
    { path: '/api-documentation', icon: RiBookReadFill, label: 'API Integration Guide', theme: 'purple', description: 'Documentation and examples for third-party RFID integration.' },
    { path: '/rfid-integration', icon: RiFlashlightFill, label: 'Quick Integration', theme: 'blue', description: 'Get started with the RFID API in minutes.' },
    { path: '/download-api-doc', icon: RiFileDownloadFill, label: 'Download API Doc', theme: 'blue', description: 'Download API documentation and reference files.' },
    { path: '/download-resources', icon: RiFolderDownloadFill, label: 'Download Resources', theme: 'green', description: 'Templates, guides, and other developer resources.' },
    { path: '/single-use-tags', icon: RiPriceTag3Fill, label: 'Single Use Tags', theme: 'purple', description: 'Manage and track single-use RFID tags.' },
    { path: '/sync-labelled-stock-tid', icon: RiBarcodeFill, label: 'Sync Labelled Stock TID', theme: 'blue', description: 'Copy EPC values from RFID tables into labelled stock TIDNumber, with live progress.' },
    { path: '/fingerprint-register', icon: RiFingerprintFill, label: 'Fingerprint Login Settings', theme: 'blue', description: 'Morpho RD capture, PIN, and fingerprint login management.' },
    { path: '/face-register', icon: RiCamera2Fill, label: 'Face Login Settings', theme: 'purple', description: 'Register and manage Face ID for camera-based sign-in.' },
  ];
  if (getApiMode() === 'offline') {
    return [
      {
        path: '/offline-api-settings',
        icon: RiGlobalLine,
        label: 'Offline API base URLs',
        theme: 'teal',
        description: 'Set Soni and RRGOLD base URLs for this PC.',
      },
      ...base,
    ];
  }
  return base;
};

const HUB_BANNER = `${process.env.PUBLIC_URL || ''}/images/DeveloperHub.png`;

const Card = ({ item, index }) => {
  const { icon: Icon, label, description, path, theme } = item;
  const t = THEMES[theme] || THEMES.blue;

  return (
    <Link to={path} className="hub-card" style={{ animationDelay: `${index * 50}ms`, '--accent': t.accent, '--soft': t.soft, '--ink': t.ink }}>
      <span className="hub-card-bar" />
      <div className="hub-card-top">
        <span className="hub-card-icon"><Icon /></span>
        <h3>{label}</h3>
      </div>
      <p>{description}</p>
      <span className="hub-explore">
        Explore <FaArrowRight />
      </span>
    </Link>
  );
};

const ProfileMenuPage = () => {
  const menuItems = buildMenuItems();

  return (
    <div className="hub-page">
      <style>{hubStyles}</style>
      <header className="hub-hero">
        <img className="hub-hero-banner" src={HUB_BANNER} alt="" aria-hidden="true" />
        <div className="hub-hero-copy">
          <h1>Developer Hub <span>&amp; Resources</span></h1>
          <p>Everything you need to build, integrate, and innovate with our RFID platform.</p>
          <span className="hub-badge">
            <RiCodeSSlashLine />
            Build. Integrate. Innovate.
          </span>
        </div>
      </header>

      <div className="hub-grid">
        {menuItems.map((item, index) => (
          <Card key={item.path} item={item} index={index} />
        ))}
      </div>
    </div>
  );
};

const hubStyles = `
  .hub-page {
    min-height: 100%;
    padding: 16px 20px 28px;
    background: #f8fafc;
    font-family: Inter, "Plus Jakarta Sans", system-ui, sans-serif;
    box-sizing: border-box;
    color: #0f172a;
  }
  .hub-hero {
    position: relative;
    display: flex;
    align-items: center;
    margin-bottom: 16px;
    min-height: 148px;
    height: clamp(148px, 18vw, 196px);
    padding: 16px 24px;
    border-radius: 16px;
    overflow: hidden;
    background: #efe9ff;
    border: 1px solid #e4dcff;
    box-sizing: border-box;
  }
  .hub-hero-banner {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: 78% 48%;
    pointer-events: none;
    user-select: none;
  }
  .hub-hero::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: 1;
    background: linear-gradient(90deg, rgba(247,244,255,0.96) 0%, rgba(247,244,255,0.88) 38%, rgba(247,244,255,0.35) 62%, rgba(247,244,255,0) 78%);
    pointer-events: none;
  }
  .hub-hero-copy {
    position: relative;
    z-index: 2;
    max-width: min(860px, 78%);
    min-width: 0;
  }
  .hub-hero h1 {
    margin: 0;
    font-size: clamp(32px, 4.8vw, 54px);
    font-weight: 800;
    letter-spacing: -0.03em;
    color: #1e1b4b;
    line-height: 1.15;
  }
  .hub-hero h1 span { color: #6d5dfe; }
  .hub-hero p {
    margin: 5px 0 0;
    font-size: clamp(11px, 1.2vw, 13px);
    color: #64748b;
    font-weight: 500;
    line-height: 1.4;
  }
  .hub-badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin-top: 10px;
    height: 28px;
    padding: 0 12px 0 6px;
    border-radius: 999px;
    background: rgba(237, 233, 254, 0.92);
    color: #5b21b6;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.01em;
    border: 1px solid #ddd6fe;
  }
  .hub-badge svg {
    width: 18px;
    height: 18px;
    padding: 3px;
    border-radius: 5px;
    background: #6d5dfe;
    color: #fff;
  }
  .hub-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 16px;
  }
  .hub-card {
    display: flex;
    flex-direction: column;
    min-height: 176px;
    padding: 18px 18px 16px;
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 14px;
    text-decoration: none;
    color: inherit;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
    position: relative;
    overflow: hidden;
    animation: hubIn 0.45s ease both;
    transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
  }
  .hub-card:hover {
    transform: translateY(-3px);
    box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
    border-color: var(--accent);
  }
  .hub-card-bar {
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    height: 3px;
    background: linear-gradient(90deg, var(--accent), color-mix(in srgb, var(--accent) 40%, #fff));
  }
  .hub-card-top {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    margin-bottom: 10px;
  }
  .hub-card-icon {
    width: 36px;
    height: 36px;
    flex-shrink: 0;
    border-radius: 999px;
    background: var(--soft);
    color: var(--accent);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
  }
  .hub-card h3 {
    margin: 6px 0 0;
    font-size: 14px;
    font-weight: 800;
    color: #0f172a;
    line-height: 1.3;
    letter-spacing: -0.02em;
  }
  .hub-card p {
    margin: 0 0 14px;
    font-size: 12px;
    line-height: 1.5;
    color: #64748b;
    flex: 1;
  }
  .hub-explore {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    align-self: flex-start;
    height: 28px;
    padding: 0 12px;
    border-radius: 999px;
    background: var(--soft);
    color: var(--ink);
    font-size: 12px;
    font-weight: 700;
  }
  .hub-explore svg { width: 10px; height: 10px; }
  .hub-card:hover .hub-explore { background: var(--accent); color: #fff; }
  @keyframes hubIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @media (max-width: 1180px) {
    .hub-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  }
  @media (max-width: 900px) {
    .hub-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .hub-hero { height: clamp(140px, 24vw, 176px); padding: 16px 18px; }
    .hub-hero-banner { object-position: 88% 48%; }
    .hub-hero-copy { max-width: 70%; }
  }
  @media (max-width: 720px) {
    .hub-page { padding: 10px 10px 20px; }
    .hub-hero {
      height: auto;
      min-height: 0;
      padding: 14px 14px 16px;
      border-radius: 12px;
      margin-bottom: 12px;
    }
    .hub-hero-banner { object-position: 100% 48%; opacity: 0.55; }
    .hub-hero::before {
      background: linear-gradient(90deg, rgba(247,244,255,0.94) 0%, rgba(247,244,255,0.78) 70%, rgba(247,244,255,0.45) 100%);
    }
    .hub-hero-copy { max-width: 100%; }
    .hub-badge { margin-top: 8px; }
  }
  @media (max-width: 560px) {
    .hub-grid { grid-template-columns: 1fr; gap: 12px; }
    .hub-card { min-height: 0; }
  }
`;

export default ProfileMenuPage;
