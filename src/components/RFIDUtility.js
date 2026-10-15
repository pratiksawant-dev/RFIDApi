import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FaArrowRight, FaCheck, FaClipboardList, FaCogs, FaImages, FaInfoCircle, FaLayerGroup, FaMicrochip, FaPen, FaProjectDiagram, FaSyncAlt, FaWaveSquare } from 'react-icons/fa';
import '../styles/RFIDUtility.css';
import { isInventoryTrayEnabled, setInventoryTrayEnabled } from '../services/trayModeService';
import ExeApiModeBanner from './common/ExeApiModeBanner';

const utilityMenus = [
  {
    id: 'auto-push-stock',
    title: 'Auto Push Stock',
    subtitle: 'Smart Sync',
    description: 'Automatically push inventory updates to your connected endpoints.',
    icon: FaSyncAlt,
    theme: 'rfid-card-orange',
    route: '/rfid-utility/auto-push-stock',
  },
  {
    id: 'check-rfid',
    title: 'RFID Tray Connect',
    subtitle: 'Reader Bridge',
    description: 'Connect tray readers, start scan, and stream tag reads in real time.',
    icon: FaWaveSquare,
    theme: 'rfid-card-blue',
    route: '/rfid-utility/tray-connect',
  },
  {
    id: 'write-tag',
    title: 'Write Tag',
    subtitle: 'Read and encode',
    description: 'Read tray EPCs, type a barcode, and write it into USER memory or the EPC.',
    icon: FaPen,
    theme: 'rfid-card-green',
    route: '/rfid-utility/write-tag',
  },
  {
    id: 'device-settings',
    title: 'Device Settings',
    subtitle: 'Configuration',
    description: 'Manage scanner connectivity, speed, and read preferences.',
    icon: FaCogs,
    theme: 'rfid-card-teal',
  },
  {
    id: 'about',
    title: 'About',
    subtitle: 'System Info',
    description: 'Check utility version, compatibility, and support information.',
    icon: FaInfoCircle,
    theme: 'rfid-card-indigo',
    route: '/rfid-utility/about-sparkle',
  },
  {
    id: 'map-fields',
    title: 'Map Fields',
    subtitle: 'Template Mapping',
    description: 'Review template fields and source-column mapping for auto push workflows.',
    icon: FaProjectDiagram,
    theme: 'rfid-card-purple',
    route: '/rfid-utility/map-fields',
  },
  {
    id: 'template',
    title: 'Templates',
    subtitle: 'Create Mapping',
    description: 'Select Excel columns and save reusable mapping templates.',
    icon: FaClipboardList,
    theme: 'rfid-card-rose',
    route: '/rfid-utility/template',
  },
  {
    id: 'item-image-folder',
    title: 'Item Image Folder',
    subtitle: 'Image Mapping',
    description: 'Select local folder and map item-code image files for grid card previews.',
    icon: FaImages,
    theme: 'rfid-card-blue',
    route: '/rfid-utility/item-images',
  },
  {
    id: 'sync-labelled-tid',
    title: 'Sync Labelled Stock TID',
    subtitle: 'Live ProductMaster',
    description: 'Copy EPC values from RFID tables into labelled stock TIDNumber.',
    icon: FaSyncAlt,
    theme: 'rfid-card-purple',
    route: '/sync-labelled-stock-tid',
  },
  {
    id: 'firmware-tools',
    title: 'Firmware Tools',
    subtitle: 'Maintenance',
    description: 'Check scanner firmware status and prepare maintenance actions.',
    icon: FaCogs,
    theme: 'rfid-card-green',
  },
  {
    id: 'system-status',
    title: 'System Status',
    subtitle: 'Live Monitor',
    description: 'View utility service health, queue load, and connectivity.',
    icon: FaMicrochip,
    theme: 'rfid-card-coral',
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
              className={`rfid-utility-card ${menu.theme}`}
              onClick={() => {
                if (menu.route) {
                  navigate(menu.route);
                }
              }}
            >
              <div className="rfid-card-content">
                <span className="rfid-card-icon">
                  <Icon />
                </span>
                <span className="rfid-card-kicker">{menu.subtitle}</span>
                <h3>{menu.title}</h3>
                <p>{menu.description}</p>
                <div className="rfid-card-footer">
                  <span className="rfid-card-action">
                    Explore <FaArrowRight />
                  </span>
                  <span className="rfid-card-go" aria-hidden="true">
                    <FaArrowRight />
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default RFIDUtility;
