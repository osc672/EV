import React, { useEffect, useState } from 'react';
import { FileText, ShieldAlert, Clock, User, HardDrive } from 'lucide-react';
import { api } from '../api/client';
import { AuditLog } from '../types';

export const AuditLogs: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/audit-logs?pageSize=50');
      setLogs(res.data.data || []);
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 24, fontWeight: 800, color: '#0F172A' }}>Platform Audit Trail</h2>
        <p style={{ color: '#64748B', fontSize: 14, marginTop: 4 }}>
          Tamper-evident record of administrative approvals, rejections, user status toggles, and system security events
        </p>
      </div>

      <div className="card-table">
        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Administrator</th>
                <th>Action</th>
                <th>Target Resource</th>
                <th>IP Address</th>
                <th>Details / Note</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 32, color: '#64748B' }}>
                    Loading audit trail...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 32, color: '#94A3B8' }}>
                    No audit records logged yet.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#475569' }}>
                        <Clock size={13} color="#94A3B8" />
                        <span>{new Date(log.createdAt).toLocaleString()}</span>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                        <User size={14} color="#059669" />
                        <span>{log.actor?.fullName || 'System'}</span>
                      </div>
                      <div style={{ fontSize: 12, color: '#64748B', marginLeft: 20 }}>
                        {log.actor?.phone}
                      </div>
                    </td>
                    <td>
                      <span className="badge badge-info">{log.action}</span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <HardDrive size={13} color="#64748B" />
                        <span style={{ fontWeight: 600 }}>{log.entity}</span>
                      </div>
                      <div style={{ fontSize: 11, color: '#94A3B8', fontFamily: 'monospace', marginLeft: 19 }}>
                        {log.entityId.slice(0, 12)}...
                      </div>
                    </td>
                    <td style={{ color: '#64748B', fontSize: 13, fontFamily: 'monospace' }}>
                      {log.ip || '127.0.0.1'}
                    </td>
                    <td style={{ fontSize: 13, color: '#334155' }}>
                      {log.metadata?.note ? (
                        <div style={{ fontStyle: 'italic', color: '#475569' }}>
                          "{String(log.metadata.note)}"
                        </div>
                      ) : (
                        <span style={{ color: '#94A3B8' }}>—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

