import React, { useEffect, useState } from 'react';
import {
  ShieldCheck,
  Search,
  Filter,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Eye,
  X,
  FileText,
  MapPin,
  Zap,
} from 'lucide-react';
import { api } from '../api/client';
import { ProviderProfile } from '../types';

export const Providers: React.FC = () => {
  const [providers, setProviders] = useState<ProviderProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<ProviderProfile | null>(null);

  // Modal review state
  const [reviewNote, setReviewNote] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const fetchProviders = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      if (searchQuery) params.append('q', searchQuery);
      params.append('pageSize', '50');

      const res = await api.get(`/admin/providers?${params.toString()}`);
      setProviders(res.data.data || []);
    } catch (err) {
      console.error('Failed to load providers:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProviders();
  }, [statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchProviders();
  };

  const handleReviewAction = async (newStatus: 'APPROVED' | 'REJECTED' | 'SUSPENDED') => {
    if (!selectedProvider) return;
    if (newStatus === 'APPROVED') {
      const hasHost = Boolean(selectedProvider.user?.avatarUrl || selectedProvider.documents?.some((d) => d.type === 'ID_PROOF'));
      const hasCharger = Boolean(selectedProvider.documents?.some((d) => d.type === 'CHARGER_PHOTO' || d.type === 'SITE_PHOTO'));
      if (!hasHost || !hasCharger) {
        alert('Cannot approve provider: Both Host Personal Photo and Charging Point Photo must exist before approval.');
        return;
      }
    }
    if (newStatus === 'REJECTED' && !reviewNote.trim()) {
      alert('Please provide a reason or clarification note for rejection.');
      return;
    }

    setSubmittingReview(true);
    try {
      await api.patch(`/admin/providers/${selectedProvider.id}/review`, {
        status: newStatus,
        note: reviewNote.trim() || undefined,
      });

      setActionMessage(`Provider status successfully updated to ${newStatus}`);
      setTimeout(() => {
        setActionMessage(null);
        setSelectedProvider(null);
        setReviewNote('');
        fetchProviders();
      }, 1000);
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to update provider status');
    } finally {
      setSubmittingReview(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return <span className="badge badge-success"><CheckCircle size={12} style={{ marginRight: 4 }} /> Approved</span>;
      case 'PENDING':
      case 'UNDER_REVIEW':
      case 'RESUBMITTED':
        return <span className="badge badge-warning"><AlertTriangle size={12} style={{ marginRight: 4 }} /> Pending Review</span>;
      case 'REJECTED':
      case 'SUSPENDED':
        return <span className="badge badge-danger"><XCircle size={12} style={{ marginRight: 4 }} /> {status}</span>;
      default:
        return <span className="badge badge-neutral">{status}</span>;
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 800, color: '#0F172A' }}>Provider Approvals</h2>
          <p style={{ color: '#64748B', fontSize: 14, marginTop: 4 }}>
            Review charging station host applications, hardware specifications, and photos
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
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
          <span style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>Filter Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ minWidth: 160 }}
          >
            <option value="">All Statuses</option>
            <option value="PENDING">Pending Review</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
            <option value="SUSPENDED">Suspended</option>
          </select>
        </div>

        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: 8 }}>
          <div style={{ position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: 11, color: '#94A3B8' }} />
            <input
              type="text"
              placeholder="Search by station or city..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingLeft: 36, width: 260 }}
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
                <th>Station / Business</th>
                <th>Host Name</th>
                <th>Contact</th>
                <th>Location</th>
                <th>Capacity</th>
                <th>Verification</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: 32, color: '#64748B' }}>
                    Loading provider applications...
                  </td>
                </tr>
              ) : providers.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: 32, color: '#94A3B8' }}>
                    No providers match the selected criteria.
                  </td>
                </tr>
              ) : (
                providers.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div style={{ fontWeight: 700, color: '#0F172A' }}>{p.businessName}</div>
                      <div style={{ fontSize: 12, color: '#64748B' }}>Type: {p.providerType}</div>
                    </td>
                    <td style={{ fontWeight: 600 }}>{p.user?.fullName}</td>
                    <td style={{ color: '#475569', fontSize: 13 }}>{p.user?.phone}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#475569' }}>
                        <MapPin size={14} color="#64748B" />
                        <span>{p.city || 'Location logged'}</span>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Zap size={14} color="#059669" />
                        <span style={{ fontWeight: 600 }}>{p.maxPowerKw} kW</span>
                        <span style={{ color: '#64748B', fontSize: 12 }}>({p.totalChargingPoints} pts)</span>
                      </div>
                    </td>
                    <td>{getStatusBadge(p.verificationStatus)}</td>
                    <td>
                      <button
                        onClick={() => {
                          setSelectedProvider(p);
                          setReviewNote(p.verificationNote || '');
                        }}
                        className="btn btn-secondary btn-sm"
                      >
                        <Eye size={14} />
                        <span>Review</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Review Modal */}
      {selectedProvider && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 600 }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <ShieldCheck size={22} color="#059669" />
                <h3 style={{ fontSize: 18, fontWeight: 800 }}>Review Charging Provider</h3>
              </div>
              <button onClick={() => setSelectedProvider(null)} style={{ color: '#64748B' }}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              {actionMessage ? (
                <div style={{
                  padding: 20,
                  backgroundColor: '#ECFDF5',
                  color: '#065F46',
                  borderRadius: 12,
                  textAlign: 'center',
                  fontWeight: 600,
                }}>
                  {actionMessage}
                </div>
              ) : (
                <>
                  {/* Summary Box */}
                  <div style={{
                    backgroundColor: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    borderRadius: 12,
                    padding: 16,
                    marginBottom: 20,
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 12,
                    fontSize: 13,
                  }}>
                    <div>
                      <div style={{ color: '#64748B' }}>Station Name:</div>
                      <div style={{ fontWeight: 700, color: '#0F172A' }}>{selectedProvider.businessName}</div>
                    </div>
                    <div>
                      <div style={{ color: '#64748B' }}>Host Full Name:</div>
                      <div style={{ fontWeight: 700, color: '#0F172A' }}>{selectedProvider.user?.fullName}</div>
                    </div>
                    <div>
                      <div style={{ color: '#64748B' }}>Phone:</div>
                      <div style={{ fontWeight: 600 }}>{selectedProvider.user?.phone}</div>
                    </div>
                    <div>
                      <div style={{ color: '#64748B' }}>Email:</div>
                      <div style={{ fontWeight: 600 }}>{selectedProvider.user?.email || 'N/A'}</div>
                    </div>
                    <div>
                      <div style={{ color: '#64748B' }}>Hardware Power:</div>
                      <div style={{ fontWeight: 700, color: '#059669' }}>
                        {selectedProvider.maxPowerKw} kW ({selectedProvider.totalChargingPoints} points)
                      </div>
                    </div>
                    <div>
                      <div style={{ color: '#64748B' }}>Pricing:</div>
                      <div style={{ fontWeight: 600 }}>
                        {selectedProvider.pricePerKwh ? `₹${selectedProvider.pricePerKwh}/kWh` : 'Session Flat Rate'}
                      </div>
                    </div>
                  </div>

                  {/* Photo Verification Section */}
                  <div style={{
                    backgroundColor: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    borderRadius: 12,
                    padding: 16,
                    marginBottom: 20,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>
                        Required Verification Photos
                      </span>
                      {(() => {
                        const hasHost = Boolean(selectedProvider.user?.avatarUrl || selectedProvider.documents?.some(d => d.type === 'ID_PROOF'));
                        const hasCharger = Boolean(selectedProvider.documents?.some(d => d.type === 'CHARGER_PHOTO' || d.type === 'SITE_PHOTO'));
                        if (hasHost && hasCharger) {
                          return (
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#059669', backgroundColor: '#ECFDF5', padding: '3px 8px', borderRadius: 6 }}>
                              ✓ Both Photos Present
                            </span>
                          );
                        }
                        return (
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#DC2626', backgroundColor: '#FEF2F2', padding: '3px 8px', borderRadius: 6 }}>
                            ⚠️ Missing Photos
                          </span>
                        );
                      })()}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      {/* Host Photo */}
                      <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 10, backgroundColor: '#fff', textAlign: 'center' }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#64748B', marginBottom: 6 }}>
                          1. Host Personal Photo
                        </div>
                        {selectedProvider.user?.avatarUrl ? (
                          <a href={selectedProvider.user.avatarUrl} target="_blank" rel="noreferrer">
                            <img
                              src={selectedProvider.user.avatarUrl}
                              alt="Host Verification"
                              style={{ width: '100%', height: 130, objectFit: 'cover', borderRadius: 6 }}
                            />
                          </a>
                        ) : (
                          <div style={{ height: 130, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1F5F9', borderRadius: 6, color: '#EF4444', fontSize: 12 }}>
                            ✕ No Host Photo
                          </div>
                        )}
                      </div>

                      {/* Charger Photo */}
                      <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 10, backgroundColor: '#fff', textAlign: 'center' }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#64748B', marginBottom: 6 }}>
                          2. Charging Point Photo
                        </div>
                        {(() => {
                          const chargerDoc = selectedProvider.documents?.find(d => d.type === 'CHARGER_PHOTO' || d.type === 'SITE_PHOTO');
                          if (chargerDoc?.fileUrl) {
                            return (
                              <a href={chargerDoc.fileUrl} target="_blank" rel="noreferrer">
                                <img
                                  src={chargerDoc.fileUrl}
                                  alt="Charging Point Hardware"
                                  style={{ width: '100%', height: 130, objectFit: 'cover', borderRadius: 6 }}
                                />
                              </a>
                            );
                          }
                          return (
                            <div style={{ height: 130, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1F5F9', borderRadius: 6, color: '#EF4444', fontSize: 12 }}>
                              ✕ No Charger Photo
                            </div>
                          );
                        })()}
                      </div>
                    </div>

                    {(!selectedProvider.user?.avatarUrl || !selectedProvider.documents?.some(d => d.type === 'CHARGER_PHOTO' || d.type === 'SITE_PHOTO')) && (
                      <div style={{ marginTop: 10, padding: 8, backgroundColor: '#FEF2F2', borderRadius: 6, fontSize: 12, color: '#B91C1C' }}>
                        Notice: According to platform security policy, providers must submit both their personal identity photo and the physical charger photo before this station can be approved for EV drivers.
                      </div>
                    )}
                  </div>

                  {/* Verification Note / Clarification Input */}
                  <div style={{ marginBottom: 20 }}>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                      Administrator Decision Note (Sent to Provider):
                    </label>
                    <textarea
                      rows={3}
                      value={reviewNote}
                      onChange={(e) => setReviewNote(e.target.value)}
                      placeholder="e.g. Approved for public listing, or: Please upload a clearer photograph of the station plug..."
                      style={{ width: '100%', resize: 'vertical' }}
                    />
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 10, borderTop: '1px solid #E2E8F0' }}>
                    <button
                      type="button"
                      onClick={() => handleReviewAction('REJECTED')}
                      disabled={submittingReview}
                      className="btn btn-danger btn-sm"
                    >
                      <XCircle size={16} />
                      <span>Reject Application</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleReviewAction('SUSPENDED')}
                      disabled={submittingReview}
                      className="btn btn-secondary btn-sm"
                    >
                      <AlertTriangle size={16} />
                      <span>Suspend</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleReviewAction('APPROVED')}
                      disabled={submittingReview}
                      className="btn btn-primary btn-sm"
                    >
                      <CheckCircle size={16} />
                      <span>Approve Provider</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

