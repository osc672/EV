import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  ShieldCheck,
  Users,
  CalendarCheck,
  FileText,
  LogOut,
  Zap,
} from 'lucide-react';

export const Sidebar: React.FC = () => {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('evrescue_admin_token');
    localStorage.removeItem('evrescue_admin_user');
    navigate('/login');
  };

  const storedUser = localStorage.getItem('evrescue_admin_user');
  const user = storedUser ? JSON.parse(storedUser) : null;

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <Zap size={22} color="#fff" />
        </div>
        <div>
          <div className="sidebar-title">EV RESCUE</div>
          <div className="sidebar-sub">ADMIN CONSOLE</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        <NavLink to="/" end className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <LayoutDashboard size={18} />
          <span>Dashboard</span>
        </NavLink>

        <NavLink to="/providers" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <ShieldCheck size={18} />
          <span>Provider Approvals</span>
        </NavLink>

        <NavLink to="/users" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <Users size={18} />
          <span>Users & Drivers</span>
        </NavLink>

        <NavLink to="/bookings" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <CalendarCheck size={18} />
          <span>Bookings</span>
        </NavLink>

        <NavLink to="/audit-logs" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <FileText size={18} />
          <span>Audit Logs</span>
        </NavLink>
      </nav>

      <div className="sidebar-footer">
        <div style={{ overflow: 'hidden' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
            {user?.fullName || 'Administrator'}
          </div>
          <div style={{ fontSize: 11, color: '#64748B' }}>Platform Admin</div>
        </div>
        <button
          onClick={handleLogout}
          title="Sign out"
          style={{
            padding: 8,
            borderRadius: 8,
            color: '#EF4444',
            background: 'rgba(239, 68, 68, 0.1)',
          }}
        >
          <LogOut size={16} />
        </button>
      </div>
    </aside>
  );
};

