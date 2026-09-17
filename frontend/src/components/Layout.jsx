import { useState, useEffect, useRef } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard, FileCheck, FileText, PlusCircle,
  ChevronRight, Shield, LogOut, Building2, User
} from 'lucide-react';

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', roles: ['issuer','holder','inspector','regulator'] },
  { to: '/assets', icon: FileCheck, label: 'Compliance Assets', roles: ['issuer','holder','inspector','regulator'] },
  { to: '/audit', icon: FileText, label: 'Audit Trail', roles: ['issuer','holder','inspector','regulator'] },
  { to: '/ledger-records', icon: FileText, label: 'Canton Records', roles: ['issuer','holder','inspector','regulator'] },
  { to: '/ledger-transfers', icon: Shield, label: 'Canton Transfers', roles: ['issuer','holder'] },
  { to: '/ledger-inspection', icon: Shield, label: 'Canton Inspection', roles: ['inspector'] },
  { to: '/ledger-issuance', icon: Shield, label: 'Canton Issuance', roles: ['issuer'] },
  { to: '/create-asset', icon: PlusCircle, label: 'Create Asset', roles: ['issuer'] },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const menuRef = useRef(null);
  useEffect(() => {
    if (!sidebarOpen) return;
    const closeOnEscape = event => {
      if (event.key === 'Escape') {
        setSidebarOpen(false);
        menuRef.current?.focus();
      }
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [sidebarOpen]);

  const visibleNav = navItems.filter(item => user && item.roles.includes(user.role));

  return (
    <div className="app-layout">
      {/* Mobile toggle */}
      <button
        ref={menuRef}
        className="mobile-nav-toggle"
        aria-expanded={sidebarOpen}
        aria-controls="app-sidebar"
        aria-label={sidebarOpen ? 'Close navigation menu' : 'Open navigation menu'}
        onClick={() => setSidebarOpen(open => !open)}
      >
        <Shield size={18} aria-hidden="true" /> Menu
      </button>

      {/* Mobile overlay */}
      {sidebarOpen && <button className="sidebar-overlay" aria-label="Dismiss navigation" onClick={() => { setSidebarOpen(false); menuRef.current?.focus(); }} />}

      {/* Sidebar */}
      <aside id="app-sidebar" className={`sidebar${sidebarOpen ? ' sidebar-open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" style={{ width: 28, height: 28 }}>
              <rect width="32" height="32" rx="6" fill="#0f766e"/>
              <path d="M16 6 L26 26 H6 Z" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinejoin="round"/>
              <circle cx="16" cy="18" r="3" fill="#fff"/>
            </svg>
            <span>Sanitova<span style={{ color: '#ccfbf1' }}>Credits</span></span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-label">Main</div>
          {visibleNav.map(item => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              onClick={() => setSidebarOpen(false)}>
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* User info at bottom */}
        <div style={{ padding: '16px 12px', borderTop: '1px solid rgba(255,255,255,0.15)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700 }}>
              {user?.full_name?.charAt(0) || 'U'}
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'white' }}>{user?.full_name}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>{user?.role}</div>
            </div>
          </div>
          <button className="nav-item" onClick={logout} style={{ color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
