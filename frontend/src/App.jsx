import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Assets from './pages/Assets';
import AssetDetail from './pages/AssetDetail';
import CreateAsset from './pages/CreateAsset';
import AuditTrail from './pages/AuditTrail';
import LedgerIssuance from './pages/LedgerIssuance';
import LedgerInspection from './pages/LedgerInspection';
import LedgerTransfers from './pages/LedgerTransfers';
import CantonRecords from './pages/CantonRecords';

function ProtectedRoute({ children, allowRoles }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (allowRoles && !allowRoles.includes(user.role)) return <Navigate to="/dashboard" replace />;
  return children;
}

function LoadingScreen() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#f8fafc'
    }}>
      <div style={{ textAlign: 'center', color: '#0c4a6e' }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#0f766e" strokeWidth="2" style={{ margin: '0 auto 12px' }}>
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 6v6l4 2"/>
        </svg>
        <p style={{ fontSize: 14 }}>Loading…</p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<ProtectedRoute allowRoles={['issuer','holder','inspector','regulator']}><Dashboard /></ProtectedRoute>} />
        <Route path="assets" element={<ProtectedRoute allowRoles={['issuer','holder','inspector','regulator']}><Assets /></ProtectedRoute>} />
        <Route path="assets/:id" element={<ProtectedRoute allowRoles={['issuer','holder','inspector','regulator']}><AssetDetail /></ProtectedRoute>} />
        <Route path="ledger-records" element={<ProtectedRoute allowRoles={['issuer','holder','inspector','regulator']}><CantonRecords /></ProtectedRoute>} />
        <Route path="ledger-transfers" element={<ProtectedRoute allowRoles={['issuer','holder']}><LedgerTransfers key="transfers" /></ProtectedRoute>} />
        <Route path="ledger-inspection" element={<ProtectedRoute allowRoles={['inspector']}><LedgerInspection /></ProtectedRoute>} />
        <Route path="ledger-issuance" element={<ProtectedRoute allowRoles={['issuer']}><LedgerIssuance /></ProtectedRoute>} />
        <Route path="create-asset" element={<ProtectedRoute allowRoles={['issuer']}><CreateAsset /></ProtectedRoute>} />
        <Route path="audit" element={<ProtectedRoute allowRoles={['issuer','holder','inspector','regulator']}><AuditTrail /></ProtectedRoute>} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
