import React, { useEffect, useState } from 'react';
import {
  CalendarCheck,
  Filter,
  CreditCard,
  Clock,
  Zap,
  MapPin,
} from 'lucide-react';
import { api } from '../api/client';
import { Booking } from '../types';

export const Bookings: React.FC = () => {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');

  const fetchBookings = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      params.append('pageSize', '50');

      const res = await api.get(`/bookings?${params.toString()}`);
      setBookings(res.data.data || []);
    } catch (err) {
      console.error('Failed to load bookings:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBookings();
  }, [statusFilter]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return <span className="badge badge-success">Completed</span>;
      case 'IN_PROGRESS':
        return <span className="badge badge-info">Charging Now</span>;
      case 'CONFIRMED':
        return <span className="badge badge-success">Confirmed</span>;
      case 'PENDING':
        return <span className="badge badge-warning">Pending Host</span>;
      case 'CANCELLED':
        return <span className="badge badge-danger">Cancelled</span>;
      default:
        return <span className="badge badge-neutral">{status}</span>;
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 800, color: '#0F172A' }}>Charging Bookings</h2>
          <p style={{ color: '#64748B', fontSize: 14, marginTop: 4 }}>
            Monitor real-time EV charging slot reservations and session progress
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div style={{
        backgroundColor: '#fff',
        border: '1px solid #E2E8F0',
        borderRadius: 14,
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        marginBottom: 24,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Filter size={18} color="#64748B" />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>Filter Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ minWidth: 160 }}
          >
            <option value="">All Bookings</option>
            <option value="PENDING">Pending Acceptance</option>
            <option value="CONFIRMED">Confirmed</option>
            <option value="IN_PROGRESS">In Progress (Charging)</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="card-table">
        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Booking Ref</th>
                <th>Driver</th>
                <th>Charging Station</th>
                <th>Hardware / Slot</th>
                <th>Total</th>
                <th>Payment</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: 32, color: '#64748B' }}>
                    Loading bookings...
                  </td>
                </tr>
              ) : bookings.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: 32, color: '#94A3B8' }}>
                    No bookings found matching the selected filter.
                  </td>
                </tr>
              ) : (
                bookings.map((b) => (
                  <tr key={b.id}>
                    <td>
                      <div style={{ fontWeight: 700, color: '#0F172A' }}>
                        #{b.id.slice(0, 8).toUpperCase()}
                      </div>
                      <div style={{ fontSize: 12, color: '#64748B' }}>
                        {new Date(b.createdAt).toLocaleDateString()}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{b.driver?.fullName || 'Driver'}</div>
                      <div style={{ fontSize: 12, color: '#64748B' }}>{b.driver?.phone}</div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: '#0F172A' }}>
                        {b.provider?.businessName || 'Station'}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#64748B' }}>
                        <MapPin size={12} />
                        <span>{b.provider?.city || 'City logged'}</span>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Zap size={14} color="#059669" />
                        <span style={{ fontWeight: 600 }}>{b.connectorType}</span>
                        <span style={{ color: '#64748B', fontSize: 12 }}>({b.powerKw} kW)</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#64748B', marginTop: 2 }}>
                        <Clock size={12} />
                        <span>
                          {new Date(b.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} -{' '}
                          {new Date(b.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 700, color: '#0F172A' }}>
                        ₹{Number(b.totalAmount || 0).toLocaleString('en-IN')}
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${b.payment?.status === 'PAID' ? 'badge-success' : 'badge-neutral'}`}>
                        <CreditCard size={12} style={{ marginRight: 4 }} />
                        {b.payment?.status || 'PENDING'}
                      </span>
                    </td>
                    <td>{getStatusBadge(b.status)}</td>
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

