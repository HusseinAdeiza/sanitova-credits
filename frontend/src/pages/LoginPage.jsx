import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
            <rect width="32" height="32" rx="6" fill="#0f766e"/>
            <path d="M16 6 L26 26 H6 Z" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinejoin="round"/>
            <circle cx="16" cy="18" r="3" fill="#fff"/>
          </svg>
          <h1>SanitovaCredits</h1>
          <p>Canton-based compliance asset management</p>
        </div>
        <form onSubmit={handleSubmit}>
          {error && <div style={{ background: '#fee2e2', color: '#991b1b', padding: '8px 12px', borderRadius: 8, fontSize: 13, marginBottom: 12 }}>{error}</div>}
          <div className="form-group">
            <label className="form-label">Email</label>
            <input className="form-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" required autoFocus />
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input className="form-input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
          </div>
          <button className="btn btn-primary btn-lg" type="submit" style={{ width: '100%', justifyContent: 'center' }} disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <div style={{ marginTop: 16, padding: '12px', background: '#f8fafc', borderRadius: 8, fontSize: 12, color: '#64748b' }}>
          <strong>Demo accounts</strong> (password: <code>demo123</code>)<br />
          <span style={{ display: 'block', marginTop: 4 }}>alice@sanitova.com — Issuer</span>
          <span style={{ display: 'block', marginTop: 2 }}>bob@sanitova.com — Holder</span>
          <span style={{ display: 'block', marginTop: 2 }}>clara@sanitova.com — Inspector</span>
          <span style={{ display: 'block', marginTop: 2 }}>david@sanitova.com — Regulator</span>
        </div>
      </div>
    </div>
  );
}
