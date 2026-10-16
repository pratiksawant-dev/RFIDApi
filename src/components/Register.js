import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
import { rfidService } from '../services/rfidService';
import { useAuthSplitSwap } from '../hooks/useAuthSplitSwap';
import { AUTH_HERO_SLIDES } from '../data/authHeroSlides';

const DEFAULT_PLAN_OPTIONS = [
  { PlanName: 'Basic', MaxSubUsers: 2, ValidityInDays: 365 },
  { PlanName: 'Pro', MaxSubUsers: 100, ValidityInDays: 365 },
];

const PLAN_FETCH_RETRY_MS = 10 * 60 * 1000;
const PLAN_FETCH_FAIL_CACHE_KEY = 'rfidPlanCatalogFetchFailedAt';
const SPARKLE_LOGO = `${process.env.PUBLIC_URL || ''}/Logo/sparkle-logo.png`;
const heroSlides = AUTH_HERO_SLIDES;

const Register = () => {
  const [formData, setFormData] = useState({
    Username: '',
    Password: '',
    ClientCode: '',
    SelectedPlan: ''
  });
  const [availablePlans, setAvailablePlans] = useState([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [plansError, setPlansError] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [showPassword, setShowPassword] = useState(false);
  const [slide, setSlide] = useState(0);
  const [animating, setAnimating] = useState(false);
  const navigate = useNavigate();
  const isRegisterLayout = useAuthSplitSwap(true);

  useEffect(() => {
    setAnimating(true);
    const timer = setTimeout(() => {
      setSlide((slide + 1) % heroSlides.length);
    }, 5000);
    const animTimer = setTimeout(() => setAnimating(false), 400);
    return () => {
      clearTimeout(timer);
      clearTimeout(animTimer);
    };
  }, [slide]);

  useEffect(() => {
    const fetchPlans = async () => {
      setPlansLoading(true);
      setPlansError('');
      const lastFailedAt = Number(sessionStorage.getItem(PLAN_FETCH_FAIL_CACHE_KEY) || 0);
      const withinCooldown = lastFailedAt && (Date.now() - lastFailedAt) < PLAN_FETCH_RETRY_MS;
      if (withinCooldown) {
        setAvailablePlans(DEFAULT_PLAN_OPTIONS);
        setPlansError('Using default plans (server plan API unavailable right now).');
        setPlansLoading(false);
        return;
      }
      try {
        const plans = await rfidService.getAvailableAuthPlans();
        const normalizedPlans = (plans || [])
          .map((plan) => ({
            PlanName: String(plan?.PlanName || '').trim(),
            MaxSubUsers: Number(plan?.MaxSubUsers || 0),
            ValidityInDays: Number(plan?.ValidityInDays || 365),
          }))
          .filter((plan) => plan.PlanName);

        const finalPlans = normalizedPlans.length > 0
          ? normalizedPlans
          : DEFAULT_PLAN_OPTIONS;

        setAvailablePlans(finalPlans);
        sessionStorage.removeItem(PLAN_FETCH_FAIL_CACHE_KEY);
      } catch (err) {
        sessionStorage.setItem(PLAN_FETCH_FAIL_CACHE_KEY, String(Date.now()));
        setAvailablePlans(DEFAULT_PLAN_OPTIONS);
        setPlansError('Could not load plans from server. Default plans are shown.');
      } finally {
        setPlansLoading(false);
      }
    };

    fetchPlans();
  }, []);

  const getApiErrorMessage = (err) => {
    const data = err?.response?.data;
    if (typeof data === 'string') return data;
    if (Array.isArray(data)) {
      return data.map((entry) => entry?.Description || entry?.description || String(entry)).join('\n');
    }
    if (data?.message) return data.message;
    if (data?.Message) return data.Message;
    return 'Registration failed. Please try again.';
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleNext = () => {
    if (!formData.Username.trim()) {
      setError('Please enter username.');
      return;
    }
    if (!formData.ClientCode.trim()) {
      setError('Please enter client code.');
      return;
    }
    if (!formData.Password.trim()) {
      setError('Please enter password.');
      return;
    }
    setError('');
    setStep(2);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    if (!formData.SelectedPlan) {
      setError('Please select a plan (Basic or Pro) to continue.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await rfidService.registerAuthUser({
        ...formData,
        SelectedPlan: formData.SelectedPlan,
      });
      toast.success('Registration successful! Please login.', {
        position: "top-right",
        autoClose: 3000,
        theme: "colored"
      });
      navigate('/login', { state: { fromAuth: 'register' } });
    } catch (err) {
      const errorMessage = getApiErrorMessage(err);
      setError(errorMessage);
      toast.error('Registration failed. Please check the requirements.', {
        position: "top-right",
        autoClose: 3000,
        theme: "colored"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>{`
        body, html { overflow: hidden !important; height: 100% !important; margin: 0; }
        .fas, .far, .fal, .fab { font-family: "Font Awesome 5 Free" !important; font-weight: 900 !important; display: inline-block !important; font-style: normal !important; line-height: 1 !important; }
      `}</style>
      <div className="login-page-wrapper">
        <ToastContainer
          position="bottom-center"
          hideProgressBar
          closeOnClick
          draggable={false}
          pauseOnHover
          style={{ background: 'transparent', boxShadow: 'none', zIndex: 9999, pointerEvents: 'none' }}
          toastStyle={{ background: 'transparent', boxShadow: 'none', padding: 0, maxWidth: 420, margin: '0 auto', pointerEvents: 'auto' }}
          bodyStyle={{ padding: 0 }}
          newestOnTop
        />

        <div className={`login-split${isRegisterLayout ? ' is-register' : ''}`}>
          <div className="login-left">
            <div className="login-left-body">
              <div className="login-form-shell">
                <div className="login-form-card">
                  <div className="login-brand-wrap">
                    <img
                      src={SPARKLE_LOGO}
                      alt="Sparkle RFID"
                      className="login-brand-logo"
                      onError={(e) => { e.target.onerror = null; e.target.src = `${process.env.PUBLIC_URL || ''}/Logo/LSlogo.png`; }}
                    />
                  </div>
                  <h1 className="login-title">Register to RFID Dashboard</h1>
                  <p className="login-sub">Smart Tracking • Secure Access</p>
                  <p className="login-step">Step {step} of 2</p>

                  {error && (
                    <div className="login-error">
                      <i className="fas fa-exclamation-circle" style={{ fontSize: 11 }}></i>
                      {error}
                    </div>
                  )}

                  <form onSubmit={handleSubmit} className="login-form">
                    {step === 1 && (
                      <>
                        <div className="login-field">
                          <label htmlFor="reg-username">Username</label>
                          <input
                            id="reg-username"
                            type="text"
                            name="Username"
                            value={formData.Username}
                            onChange={handleChange}
                            placeholder="Enter your username"
                            className="login-form-input"
                            autoComplete="username"
                          />
                        </div>
                        <div className="login-field">
                          <label htmlFor="reg-client">Client code</label>
                          <input
                            id="reg-client"
                            type="text"
                            name="ClientCode"
                            value={formData.ClientCode}
                            onChange={handleChange}
                            placeholder="Client code"
                            className="login-form-input"
                          />
                          <p className="login-hint">Client code is generated from Sparkle Masterpiece</p>
                        </div>
                        <div className="login-field">
                          <label htmlFor="reg-password">Password</label>
                          <div className="login-form-input-wrap">
                            <input
                              id="reg-password"
                              type={showPassword ? 'text' : 'password'}
                              name="Password"
                              value={formData.Password}
                              onChange={handleChange}
                              placeholder="Enter your password"
                              className="login-form-input"
                              autoComplete="new-password"
                            />
                            <button
                              type="button"
                              className="login-pw-toggle"
                              onClick={() => setShowPassword(!showPassword)}
                              aria-label={showPassword ? 'Hide password' : 'Show password'}
                            >
                              <i className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                            </button>
                          </div>
                        </div>
                      </>
                    )}

                    {step === 2 && (
                      <div className="login-field">
                        <label>Select your RFID plan</label>
                        <p className="login-hint" style={{ marginBottom: 8 }}>Choose one plan. It will be active for 365 days.</p>

                        {plansError && (
                          <p className="login-hint" style={{ color: '#b45309', marginBottom: 8 }}>{plansError}</p>
                        )}

                        {plansLoading ? (
                          <div className="login-hint" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" style={{ width: 12, height: 12, borderWidth: 2 }}></span>
                            Loading available plans...
                          </div>
                        ) : (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
                            {availablePlans.map((plan) => {
                              const isSelected = formData.SelectedPlan === plan.PlanName;
                              return (
                                <button
                                  key={plan.PlanName}
                                  type="button"
                                  className={`plan-card${isSelected ? ' selected' : ''}`}
                                  onClick={() => setFormData((prev) => ({ ...prev, SelectedPlan: plan.PlanName }))}
                                >
                                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                                    <div>
                                      <div className="plan-card-title">{plan.PlanName}</div>
                                      <div className="plan-card-meta">Up to {plan.MaxSubUsers} dashboard sub-users</div>
                                      <div className="plan-card-meta">Valid for {plan.ValidityInDays} days from registration</div>
                                    </div>
                                    <span className="plan-check">
                                      {isSelected ? <i className="fas fa-check"></i> : null}
                                    </span>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        )}
                        {!plansLoading && !formData.SelectedPlan && (
                          <p className="login-hint" style={{ color: '#b91c1c', marginTop: 8 }}>Please select Basic or Pro plan to enable account creation.</p>
                        )}

                        <div className="plan-features">
                          <p className="plan-card-title" style={{ margin: '0 0 7px' }}>Dashboard features included</p>
                          <div className="plan-features-grid">
                            {[
                              'Inventory Tracking',
                              'RFID Label Management',
                              'Reports & Analytics',
                              'Secure Sub-user Access',
                              'Real-time Sync',
                              'Stock Monitoring'
                            ].map((feature) => (
                              <div key={feature} style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#475569', fontSize: '0.61rem', fontWeight: 600 }}>
                                <i className="fas fa-check-circle" style={{ color: '#c59a3e', fontSize: 10 }}></i>
                                <span>{feature}</span>
                              </div>
                            ))}
                          </div>
                          <p className="login-hint" style={{ marginTop: 8 }}>All plans are valid for 365 days from registration date.</p>
                        </div>
                      </div>
                    )}

                    <div className="login-actions">
                      {step === 2 && (
                        <button type="button" className="login-btn-ghost" onClick={() => { setError(''); setStep(1); }}>
                          Back
                        </button>
                      )}
                      {step === 1 ? (
                        <button type="button" className="login-btn-primary" onClick={handleNext}>
                          Next
                        </button>
                      ) : (
                        <button
                          type="submit"
                          className="login-btn-primary"
                          style={{ flex: 2 }}
                          disabled={loading || plansLoading || !formData.SelectedPlan}
                        >
                          {loading ? (
                            <>
                              <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" style={{ width: 14, height: 14, borderWidth: 2 }}></span>
                              <span>Registering...</span>
                            </>
                          ) : (
                            <span>Create Account</span>
                          )}
                        </button>
                      )}
                    </div>

                    <div className="login-register-row">
                      <span>Already have an account? </span>
                      <button type="button" className="login-register-btn" onClick={() => navigate('/login', { state: { fromAuth: 'register' } })}>
                        Login now
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>

            <div className="login-left-foot">
              <span>© {new Date().getFullYear()}, LoyalString International Pvt Ltd.</span>
              <span>All Rights Reserved.</span>
            </div>
          </div>

          <div className="login-right">
            <img
              src={heroSlides[slide].img}
              alt=""
              className={`login-hero-img login-hero-img--${heroSlides[slide].fit || 'cover'}${animating ? ' is-fading' : ''}`}
            />
            <div className="login-hero-overlay">
              <div className={`login-hero-copy${animating ? ' is-fading' : ''}`}>
                <h2 className="login-hero-title">{heroSlides[slide].title}</h2>
                <p className="login-hero-desc">{heroSlides[slide].desc}</p>
                <div className="login-hero-dots">
                  {heroSlides.map((_, index) => (
                    <button
                      key={index}
                      type="button"
                      className={`login-hero-dot${index === slide ? ' is-active' : ''}`}
                      aria-label={`Show slide ${index + 1}`}
                      onClick={() => setSlide(index)}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Register;

