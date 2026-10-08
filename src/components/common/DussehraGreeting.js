import React, { useEffect, useState } from 'react';
import '../../styles/DussehraGreeting.css';

const DUSSEHRA = new Date(2026, 9, 20);
const ART = `${process.env.PUBLIC_URL || ''}/images/Happy-Dussehra.png?v=banner`;
export const DUSSEHRA_OFFER_KEY = 'showDussehraOffer';

const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const offerIsCurrent = () => {
  const days = Math.round((startOfDay(DUSSEHRA) - startOfDay(new Date())) / 86400000);
  return days >= -2;
};

export const markDussehraOffer = () => {
  if (!offerIsCurrent()) return;
  try {
    sessionStorage.setItem(DUSSEHRA_OFFER_KEY, '1');
  } catch {
    /* ignore private-mode storage errors */
  }
};

const DussehraOfferPopup = () => {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    let pending = false;
    try {
      pending = sessionStorage.getItem(DUSSEHRA_OFFER_KEY) === '1';
      if (pending) sessionStorage.removeItem(DUSSEHRA_OFFER_KEY);
    } catch {
      pending = false;
    }
    if (!pending || !offerIsCurrent()) return undefined;
    const timer = setTimeout(() => setOpen(true), 320);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') setClosing(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (!open || closing) return undefined;
    const timer = setTimeout(() => setClosing(true), 3000);
    return () => clearTimeout(timer);
  }, [open, closing]);

  useEffect(() => {
    if (!closing) return undefined;
    const timer = setTimeout(() => setOpen(false), 360);
    return () => clearTimeout(timer);
  }, [closing]);

  if (!open) return null;

  const close = () => setClosing(true);

  return (
    <div className={`dussehra-pop${closing ? ' is-closing' : ''}`} role="dialog" aria-modal="true" aria-label="Dussehra offer">
      <button type="button" className="dussehra-pop-backdrop" aria-label="Close offer" onClick={close} />
      <div className="dussehra-pop-card">
        <button type="button" className="dussehra-pop-x" onClick={close} aria-label="Close">
          ×
        </button>
        <img
          src={ART}
          alt="Happy Dussehra. Biggest deal of the year on RFID products."
          className="dussehra-pop-img"
        />
        <span className="dussehra-pop-timer" aria-hidden="true" />
      </div>
    </div>
  );
};

export default DussehraOfferPopup;
