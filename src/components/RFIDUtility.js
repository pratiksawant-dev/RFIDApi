import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FaArrowRight, FaCheck, FaLayerGroup } from 'react-icons/fa';
import {
  RiBarcodeLine,
  RiCpuLine,
  RiEdit2Line,
  RiFileList3Line,
  RiImageLine,
  RiInformationLine,
  RiNodeTree,
  RiPulseLine,
  RiRefreshLine,
  RiSettings3Line,
  RiWifiLine,
} from 'react-icons/ri';
import '../styles/RFIDUtility.css';
import { isInventoryTrayEnabled, setInventoryTrayEnabled } from '../services/trayModeService';
import ExeApiModeBanner from './common/ExeApiModeBanner';

const utilityMenus = [
  {
    id: 'auto-push-stock',
    title: 'Auto Push Stock',
    description: 'Automatically push inventory updates to your connected endpoints.',
    icon: RiRefreshLine,
    theme: 'rfid-card-orange',
    route: '/rfid-utility/auto-push-stock',
  },
  {
    id: 'check-rfid',
    title: 'RFID Tray Connect',
    description: 'Connect tray readers, start scan, and stream tag reads in real time.',
    icon: RiWifiLine,
    theme: 'rfid-card-blue',
    route: '/rfid-utility/tray-connect',
  },
  {
    id: 'write-tag',
    title: 'Write Tag',
    description: 'Read tray EPCs, type a barcode, and write it into USER memory or the EPC.',
    icon: RiEdit2Line,
    theme: 'rfid-card-green',
    route: '/rfid-utility/write-tag',
  },
  {
    id: 'device-settings',
    title: 'Device Settings',
    description: 'Manage scanner connectivity, speed, and read preferences.',
    icon: RiSettings3Line,
    theme: 'rfid-card-teal',
  },
  {
    id: 'about',
    title: 'About',
    description: 'Check utility version, compatibility, and support information.',
    icon: RiInformationLine,
    theme: 'rfid-card-indigo',
    route: '/rfid-utility/about-sparkle',
  },
  {
    id: 'map-fields',
    title: 'Map Fields',
    description: 'Review template fields and source-column mapping for auto push workflows.',
    icon: RiNodeTree,
    theme: 'rfid-card-purple',
    route: '/rfid-utility/map-fields',
  },
  {
    id: 'template',
    title: 'Templates',
    description: 'Select Excel columns and save reusable mapping templates.',
    icon: RiFileList3Line,
    theme: 'rfid-card-rose',
    route: '/rfid-utility/template',
  },
  {
    id: 'item-image-folder',
    title: 'Item Image Folder',
    description: 'Select local folder and map item-code image files for grid card previews.',
    icon: RiImageLine,
    theme: 'rfid-card-sky',
    route: '/rfid-utility/item-images',
  },
  {
    id: 'sync-labelled-tid',
    title: 'Sync Labelled Stock TID',
    description: 'Copy EPC values from RFID tables into labelled stock TIDNumber.',
    icon: RiBarcodeLine,
    theme: 'rfid-card-blue',
    route: '/sync-labelled-stock-tid',
  },
  {
    id: 'firmware-tools',
    title: 'Firmware Tools',
    description: 'Check scanner firmware status and prepare maintenance actions.',
    icon: RiCpuLine,
    theme: 'rfid-card-green',
  },
  {
    id: 'system-status',
    title: 'System Status',
    description: 'View utility service health, queue load, and connectivity.',
    icon: RiPulseLine,
    theme: 'rfid-card-teal',
  },
];

const RFIDUtility = () => {
  const navigate = useNavigate();
  const [inventoryTrayEnabled, setInventoryTrayEnabledState] = React.useState(isInventoryTrayEnabled());

  React.useEffect(() => {
    const syncFromStorage = () => setInventoryTrayEnabledState(isInventoryTrayEnabled());
    window.addEventListener('storage', syncFromStorage);
    return () => window.removeEventListener('storage', syncFromStorage);
  }, []);

  const handleToggleInventoryTray = () => {
    const next = !inventoryTrayEnabled;
    setInventoryTrayEnabled(next);
    setInventoryTrayEnabledState(next);
  };

  return (
    <div className="rfid-utility-page">
      <div className="rfid-utility-header">
        <span className="rfid-utility-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M5 12a7 7 0 0 1 14 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M8.2 12a3.8 3.8 0 0 1 7.6 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <circle cx="12" cy="15.2" r="1.35" fill="currentColor" />
          </svg>
        </span>
        <div>
          <h1>RFID Utility Center</h1>
          <p>Quick access menus for RFID operations and settings.</p>
        </div>
      </div>
      <ExeApiModeBanner variant="strip" />
      <div className="rfid-tray-banner">
        <span className="rfid-tray-banner-icon" aria-hidden="true">
          <FaLayerGroup />
        </span>
        <div className="rfid-tray-banner-copy">
          <strong>Enable Tray For Inventory Management</strong>
          <span>When enabled, Invoice page can scan EPC tags from RFID tray.</span>
        </div>
        <button
          type="button"
          className={`rfid-tray-toggle${inventoryTrayEnabled ? ' is-on' : ''}`}
          onClick={handleToggleInventoryTray}
        >
          <FaCheck />
          {inventoryTrayEnabled ? 'Enabled' : 'Disabled'}
        </button>
      </div>
      <div className="rfid-utility-grid">
        {utilityMenus.map((menu) => {
          const Icon = menu.icon;
          return (
            <button
              key={menu.id}
              type="button"
              className={`rfid-utility-card ${menu.theme}${menu.route ? '' : ' is-static'}`}
              onClick={() => {
                if (menu.route) {
                  navigate(menu.route);
                }
              }}
            >
              <span className="rfid-card-bar" />
              <div className="rfid-card-top">
                <span className="rfid-card-icon">
                  <Icon />
                </span>
                <h3>{menu.title}</h3>
              </div>
              <p>{menu.description}</p>
              <span className="rfid-card-action">
                Explore <FaArrowRight />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default RFIDUtility;
