import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  ShieldAlert,
  Zap,
  CalendarCheck,
  TrendingUp,
  Award,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import { api } from '../api/client';
import { AdminStats, AuditLog } from '../types';

export const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [recentLogs, setRecentLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const [statsRes, logsRes] = await Promise.all([
        api.get('/admin/stats'),
        api.get('/admin/audit-logs?pageSize=6'),
      ]);
      setStats(statsRes.data.data);
      setRecentLogs(logsRes.data.data || []);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 800, color: '#0F172A' }}>Platform Overview</h2>
          <p style={{ color: '#64748B', fontSize: 14, marginTop: 4 }}>
            Real-time marketplace KPIs, charging network metrics & verification queue
          </p>
        </div>
        <button
          onClick={fetchDashboardData}
          className="btn btn-secondary"
          disabled={loading}
        >
          <RefreshCw size={16} className={loading ? 'spin' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Pending verification alert banner if needed */}
      {stats && stats.pendingProviders > 0 && (
        <div style={{
          backgroundColor: '#FEF3C7',
          border: '1px solid #FCD34D',
          borderRadius: 12,
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 24,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              backgroundColor: '#F59E0B',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
            }}>
              <ShieldAlert size={22} />
            </div>
            <div>
              <div style={{ fontWeight: 700, color: '#92400E', fontSize: 15 }}>
                {stats.pendingProviders} Provider Application{stats.pendingProviders > 1 ? 's' : ''} Pending Review
              </div>
              <div style={{ fontSize: 13, color: '#B45309', marginTop: 2 }}>
                Review personal photographs and station specifications to authorize their public listing.
              </div>
            </div>
          </div>
          <Link to="/providers" className="btn btn-primary btn-sm" style={{ backgroundColor: '#D97706' }}>
            <span>Review Now</span>
            <ArrowRight size={14} />
          </Link>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-info">
            <h4>Total Registered</h4>
            <div className="stat-number">{stats?.users ?? 0}</div>
            <div style={{ fontSize: 12, color: '#059669', marginTop: 4, fontWeight: 600 }}>
              {stats?.drivers ?? 0} Verified Drivers
            </div>
          </div>
          <div className="stat-icon" style={{ backgroundColor: '#ECFDF5', color: '#059669' }}>
            <Users size={24} />
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-info">
            <h4>Active Stations</h4>
            <div className="stat-number">{stats?.providers ?? 0}</div>
            <div style={{ fontSize: 12, color: '#F59E0B', marginTop: 4, fontWeight: 600 }}>
              {stats?.pendingProviders ?? 0} Pending Approval
            </div>
          </div>
          <div className="stat-icon" style={{ backgroundColor: '#FEF3C7', color: '#D97706' }}>
            <Zap size={24} />
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-info">
            <h4>Total Bookings</h4>
            <div className="stat-number">{stats?.bookings ?? 0}</div>
            <div style={{ fontSize: 12, color: '#10B981', marginTop: 4, fontWeight: 600 }}>
              {stats?.completedBookings ?? 0} Completed Sessions
            </div>
          </div>
          <div className="stat-icon" style={{ backgroundColor: '#EFF6FF', color: '#2563EB' }}>
            <CalendarCheck size={24} />
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-info">
            <h4>Gross Volume</h4>
            <div className="stat-number">₹{Number(stats?.grossRevenue ?? 0).toLocaleString('en-IN')}</div>
            <div style={{ fontSize: 12, color: '#64748B', marginTop: 4, fontWeight: 600 }}>
              {stats?.reviews ?? 0} Driver Reviews
            </div>
          </div>
          <div className="stat-icon" style={{ backgroundColor: '#F0FDF4', color: '#16A34A' }}>
            <TrendingUp size={24} />
          </div>
        </div>
      </div>

      {/* Recent Audit Logs & System Health */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>
        {/* Recent Audit Actions */}
        <div className="card-table">
          <div className="card-header">
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0F172A' }}>Recent Audit Trail</h3>
              <p style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                Platform management actions and state transitions
              </p>
            </div>
            <Link to="/audit-logs" className="btn btn-secondary btn-sm">
              <span>View All</span>
              <ArrowRight size={14} />
            </Link>
          </div>

          <div className="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {recentLogs.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', color: '#94A3B8', padding: 24 }}>
                      No audit events recorded yet.
                    </td>
                  </tr>
                ) : (
                  recentLogs.map((log) => (
                    <tr key={log.id}>
                      <td style={{ fontWeight: 600 }}>
                        {log.actor?.fullName || 'System'}
                      </td>
                      <td>
                        <span className="badge badge-info">{log.action}</span>
                      </td>
                      <td style={{ color: '#64748B' }}>{log.entity}</td>
                      <td style={{ color: '#64748B', fontSize: 13 }}>
                        {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Platform Compliance & Guidelines Card */}
        <div style={{
          background: '#fff',
          border: '1px solid #E2E8F0',
          borderRadius: 14,
          padding: 24,
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <Award size={22} color="#059669" />
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0F172A' }}>Compliance Rules</h3>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontSize: 13, lineHeight: 1.5, color: '#475569' }}>
            <div style={{ padding: 12, backgroundColor: '#F8FAFC', borderRadius: 10, border: '1px solid #E2E8F0' }}>
              <strong style={{ color: '#0F172A' }}>Driver Approval Policy:</strong>
              <div style={{ marginTop: 4, color: '#64748B' }}>
                Drivers are approved automatically upon mobile OTP verification and photo upload.
              </div>
            </div>

            <div style={{ padding: 12, backgroundColor: '#F8FAFC', borderRadius: 10, border: '1px solid #E2E8F0' }}>
              <strong style={{ color: '#0F172A' }}>Provider Verification Policy:</strong>
              <div style={{ marginTop: 4, color: '#64748B' }}>
                Provider profiles & station facilities must be reviewed and approved by an administrator before appearing in public searches.
              </div>
            </div>

            <div style={{ padding: 12, backgroundColor: '#F8FAFC', borderRadius: 10, border: '1px solid #E2E8F0' }}>
              <strong style={{ color: '#0F172A' }}>Address Privacy:</strong>
              <div style={{ marginTop: 4, color: '#64748B' }}>
                Exact residential coordinates are masked until a driver's booking is confirmed by the host.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

