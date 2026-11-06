import React, { useEffect, useState } from 'react';
import {
  Users as UsersIcon,
  Search,
  Filter,
  CheckCircle2,
  Shield,
  Ban,
  Phone,
  Mail,
  Calendar,
} from 'lucide-react';
import { api } from '../api/client';
import { AdminUser } from '../types';

export const Users: React.FC = () => {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (roleFilter) params.append('role', roleFilter);
      if (searchQuery) params.append('q', searchQuery);
      params.append('pageSize', '50');

      const res = await api.get(`/admin/users?${params.toString()}`);
      setUsers(res.data.data || []);
    } catch (err) {
      console.error('Failed to load users:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [roleFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchUsers();
  };

  const toggleUserStatus = async (user: AdminUser) => {
    const nextStatus = !user.isActive;
    const confirmMsg = nextStatus
      ? `Reactivate account for ${user.fullName}?`
      : `Deactivate account for ${user.fullName}? This will immediately revoke their active sessions.`;

    if (!window.confirm(confirmMsg)) return;

    setUpdatingId(user.id);
    try {
      await api.patch(`/admin/users/${user.id}/status`, { isActive: nextStatus });
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, isActive: nextStatus } : u))
      );
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to update user status');
    } finally {
      setUpdatingId(null);
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'ADMIN':
        return <span className="badge badge-danger"><Shield size={12} style={{ marginRight: 4 }} /> Admin</span>;
      case 'PROVIDER':
        return <span className="badge badge-warning">Provider</span>;
      case 'DRIVER':
        return <span className="badge badge-success">Driver</span>;
      default:
        return <span className="badge badge-neutral">{role}</span>;
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 800, color: '#0F172A' }}>Users & Drivers</h2>
          <p style={{ color: '#64748B', fontSize: 14, marginTop: 4 }}>
            Manage platform accounts, mobile verification status, and security permissions
          </p>
        </div>
      </div>

      {/* Filter and Search */}
      <div style={{
        backgroundColor: '#fff',
        border: '1px solid #E2E8F0',
        borderRadius: 14,
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        marginBottom: 24,
        flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Filter size={18} color="#64748B" />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>Filter Role:</span>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            style={{ minWidth: 140 }}
          >
            <option value="">All Roles</option>
            <option value="DRIVER">Drivers</option>
            <option value="PROVIDER">Providers</option>
            <option value="ADMIN">Admins</option>
          </select>
        </div>

        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: 8 }}>
          <div style={{ position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: 11, color: '#94A3B8' }} />
            <input
              type="text"
              placeholder="Search by name, phone, email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingLeft: 36, width: 280 }}
            />
          </div>
          <button type="submit" className="btn btn-secondary">
            Search
          </button>
        </form>
      </div>

      {/* Table */}
      <div className="card-table">
        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Contact</th>
                <th>Mobile Verified</th>
                <th>Status</th>
                <th>Registered</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: 32, color: '#64748B' }}>
                    Loading user records...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: 32, color: '#94A3B8' }}>
                    No users found matching the query.
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div style={{ fontWeight: 700, color: '#0F172A' }}>{u.fullName}</div>
                      <div style={{ fontSize: 12, color: '#64748B' }}>ID: {u.id.slice(0, 8)}...</div>
                    </td>
                    <td>{getRoleBadge(u.role)}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                        <Phone size={13} color="#64748B" />
                        <span>{u.phone}</span>
                      </div>
                      {u.email && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#64748B', marginTop: 2 }}>
                          <Mail size={12} color="#94A3B8" />
                          <span>{u.email}</span>
                        </div>
                      )}
                    </td>
                    <td>
                      {u.isPhoneVerified ? (
                        <span className="badge badge-success">
                          <CheckCircle2 size={12} style={{ marginRight: 4 }} /> Verified
                        </span>
                      ) : (
                        <span className="badge badge-neutral">Unverified</span>
                      )}
                    </td>
                    <td>
                      {u.isActive ? (
                        <span className="badge badge-success">Active</span>
                      ) : (
                        <span className="badge badge-danger">Deactivated</span>
                      )}
                    </td>
                    <td style={{ color: '#64748B', fontSize: 13 }}>
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                    <td>
                      {u.role !== 'ADMIN' && (
                        <button
                          onClick={() => toggleUserStatus(u)}
                          disabled={updatingId === u.id}
                          className={`btn btn-sm ${u.isActive ? 'btn-danger' : 'btn-primary'}`}
                        >
                          <Ban size={12} />
                          <span>{u.isActive ? 'Deactivate' : 'Reactivate'}</span>
                        </button>
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

