import React from 'react';
import {
  FaBookOpen,
  FaChartBar,
  FaCog,
  FaDatabase,
  FaExchangeAlt,
  FaFileAlt,
  FaLightbulb,
} from 'react-icons/fa';
import { HiOutlineDocumentText } from 'react-icons/hi';
import { RiFileExcel2Line, RiLinksLine } from 'react-icons/ri';
import '../styles/DataMigration.css';

const FEATURES = [
  {
    title: 'Bring Your Data',
    text: 'Import data from legacy ERP, Excel/CSV or database.',
    theme: 'gold',
    icon: FaFileAlt,
  },
  {
    title: 'Map & Validate',
    text: 'Map fields, apply business rules and validate data.',
    theme: 'blue',
    icon: FaCog,
  },
  {
    title: 'Import to ERP',
    text: 'Create records using secure and controlled process.',
    theme: 'green',
    icon: FaExchangeAlt,
  },
  {
    title: 'Reconcile & Report',
    text: 'Verify counts, totals and generate detailed reports.',
    theme: 'purple',
    icon: FaChartBar,
  },
];

const STEPS = [
  { n: '1', title: 'Upload Source Data', text: 'Import files or connect to source database.' },
  { n: '2', title: 'Map Columns', text: 'Map source fields to target ERP entities.' },
  { n: '3', title: 'Validate Data', text: 'Run validation and fix errors.' },
  { n: '4', title: 'Import Data', text: 'Execute import in correct order.' },
  { n: '5', title: 'Reconcile', text: 'Verify records and generate reports.' },
];

const SOURCES = [
  { label: 'Excel Files (.xlsx)', theme: 'excel', icon: RiFileExcel2Line },
  { label: 'CSV Files (.csv)', theme: 'csv', icon: HiOutlineDocumentText },
  { label: 'Source Database (Approved)', theme: 'db', icon: FaDatabase },
  { label: 'Source API (Approved)', theme: 'api', icon: RiLinksLine },
];

const HeroBanner = () => (
  <section
    className="dm-hero"
    style={{ backgroundImage: `url(${process.env.PUBLIC_URL}/Migration.png)` }}
  >
    <div className="dm-hero-copy">
      <p className="dm-kicker">Data Migration Tool</p>
      <h1>ERP Legacy Data Migration</h1>
      <p>Move your business data from legacy systems to the new ERP easily, securely and accurately.</p>
    </div>
  </section>
);

const FeatureCard = ({ title, text, theme, icon: Icon }) => (
  <article className={`dm-feature theme-${theme}`}>
    <span className="dm-feature-icon" aria-hidden="true">
      <Icon />
    </span>
    <div>
      <h2>{title}</h2>
      <p>{text}</p>
    </div>
  </article>
);

const MigrationStepper = () => (
  <article className="dm-card">
    <header className="dm-card-head">
      <span className="dm-card-badge" aria-hidden="true">
        <FaCog />
      </span>
      <div>
        <h2>Migration Process</h2>
        <p>Follow these simple steps to migrate your data.</p>
      </div>
    </header>
    <ol className="dm-steps">
      {STEPS.map((step) => (
        <li key={step.n} className={step.n === '1' ? 'is-current' : ''}>
          <span className="dm-step-no">{step.n}</span>
          <strong>{step.title}</strong>
          <span>{step.text}</span>
        </li>
      ))}
    </ol>
  </article>
);

const SupportedSources = () => (
  <article className="dm-card dm-sources-card">
    <header className="dm-card-head">
      <span className="dm-card-badge" aria-hidden="true">
        <FaDatabase />
      </span>
      <div>
        <h2>Supported Sources</h2>
        <p>Import data from multiple source types.</p>
      </div>
    </header>
    <ul className="dm-sources">
      {SOURCES.map((source) => {
        const Icon = source.icon;
        return (
          <li key={source.label}>
            <span className={`dm-source-mark theme-${source.theme}`} aria-hidden="true">
              <Icon />
            </span>
            {source.label}
          </li>
        );
      })}
    </ul>
  </article>
);

const MIGRATION_URL = 'https://migration.loyalstring.in/';

const ImportantNotice = () => (
  <section className="dm-note">
    <span className="dm-note-icon" aria-hidden="true">
      <FaLightbulb />
    </span>
    <div>
      <strong>Important</strong>
      <p>This tool helps you migrate customers, vendors, employees, products, opening stock, purchase/sales history, invoices and more.</p>
      <p>Please ensure you have the required files, permissions and mapping details before starting a migration job.</p>
    </div>
    <a className="dm-docs" href={MIGRATION_URL} target="_blank" rel="noopener noreferrer">
      <FaBookOpen aria-hidden="true" />
      Start Migration
    </a>
  </section>
);

const DataMigration = () => (
  <div className="dm-page">
    <HeroBanner />
    <section className="dm-features">
      {FEATURES.map((feature) => (
        <FeatureCard key={feature.title} {...feature} />
      ))}
    </section>
    <section className="dm-split">
      <MigrationStepper />
      <SupportedSources />
    </section>
    <ImportantNotice />
  </div>
);

export default DataMigration;
