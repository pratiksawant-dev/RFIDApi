import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FaArrowRight, FaClipboardList, FaCogs, FaImages, FaInfoCircle, FaMicrochip, FaProjectDiagram, FaSyncAlt, FaWaveSquare } from 'react-icons/fa';
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
       
        <h1>RFID Utility Center</h1>
        <p>Quick access menus for RFID operations and settings.</p>
        <ExeApiModeBanner />
      </div>
      <div style={{ marginBottom: 18, background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>Enable Tray For Inventory Management</div>
          <div style={{ fontSize: 12, color: '#64748b' }}>When enabled, Invoice page can scan EPC tags from RFID tray.</div>
        </div>
        <button
          type="button"
          onClick={handleToggleInventoryTray}
          style={{
            border: `1px solid ${inventoryTrayEnabled ? '#16a34a' : '#cbd5e1'}`,
            background: inventoryTrayEnabled ? '#16a34a' : '#ffffff',
            color: inventoryTrayEnabled ? '#ffffff' : '#475569',
            borderRadius: 999,
            padding: '8px 14px',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer'
          }}
        >
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
                <h3>{menu.title}</h3>
                <p>{menu.description}</p>
                <div className="rfid-card-footer">
                  <span className="rfid-card-action">
                    Explore <FaArrowRight />
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
