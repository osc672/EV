import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, Lock, Phone, AlertCircle, ArrowRight } from 'lucide-react';
import { api } from '../api/client';

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const [phone, setPhone] = useState('+919999999999');
  const [password, setPassword] = useState('Admin@12345');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await api.post('/auth/login', { phone, password });
      const { user, accessToken } = res.data.data;

      if (user.role !== 'ADMIN') {
        setError('Access denied: this account does not have platform administrator privileges.');
        setLoading(false);
        return;
      }

      localStorage.setItem('evrescue_admin_token', accessToken);
      localStorage.setItem('evrescue_admin_user', JSON.stringify(user));
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#091310',
      padding: 20,
    }}>
      <div style={{
        maxWidth: 420,
        width: '100%',
        backgroundColor: '#FFFFFF',
        borderRadius: 20,
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4)',
        padding: 36,
      }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 54,
            height: 54,
            borderRadius: 16,
            background: 'linear-gradient(135deg, #10B981, #059669)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 16,
            boxShadow: '0 8px 16px rgba(16, 185, 129, 0.3)',
          }}>
            <Zap size={30} color="#FFFFFF" />
          </div>
          <h2 style={{ fontSize: 24, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.5px' }}>
            EV RESCUE
          </h2>
          <p style={{ fontSize: 13, color: '#64748B', marginTop: 4, fontWeight: 500 }}>
            Platform Administration Console
          </p>
        </div>

        {error && (
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            padding: 12,
            backgroundColor: '#FEE2E2',
            borderRadius: 10,
            marginBottom: 20,
            color: '#B91C1C',
            fontSize: 13,
          }}>
            <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 18 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
              Administrator Phone
            </label>
            <div style={{ position: 'relative' }}>
              <Phone size={18} style={{ position: 'absolute', left: 12, top: 12, color: '#94A3B8' }} />
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91..."
                required
                style={{ width: '100%', paddingLeft: 40, height: 42 }}
              />
            </div>
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <Lock size={18} style={{ position: 'absolute', left: 12, top: 12, color: '#94A3B8' }} />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                required
                style={{ width: '100%', paddingLeft: 40, height: 42 }}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary"
            style={{
              width: '100%',
              height: 44,
              justifyContent: 'center',
              fontSize: 15,
              borderRadius: 10,
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Authenticating...' : 'Sign In to Console'}
            {!loading && <ArrowRight size={18} />}
          </button>
        </form>

        <div style={{
          marginTop: 24,
          padding: 12,
          backgroundColor: '#F8FAFC',
          borderRadius: 10,
          border: '1px solid #E2E8F0',
          fontSize: 12,
          color: '#64748B',
          lineHeight: 1.5,
        }}>
          <strong>Default Admin Credentials:</strong><br />
          Phone: <code style={{ color: '#059669' }}>+919999999999</code><br />
          Password: <code style={{ color: '#059669' }}>Admin@12345</code>
        </div>
      </div>
    </div>
  );
};

