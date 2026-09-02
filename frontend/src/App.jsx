import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import VideoRoom from './components/VideoRoom';
import AuthPage from './components/AuthPage';
import SuperAdminDashboard from './components/superadmin/SuperAdminDashboard';
import ManageUsers from './components/superadmin/ManageUsers';
import AdminDashboard from './components/admin/AdminDashboard';
import SupportTickets from './components/superadmin/SupportTickets';
import Announcements from './components/superadmin/Announcements';
import DeletionRequests from './components/superadmin/DeletionRequests';
import Reports from './components/admin/Reports';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import MyProfile from './components/MyProfile';
import UserProfile from './components/UserProfile';
import Messages from './components/Messages';
import WhisperBoard from './components/WhisperBoard';
import AuthGuard from './components/auth/AuthGuard';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { SocketProvider } from './contexts/SocketContext';
import { ToastProvider } from './contexts/ToastContext';

function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <SocketProvider>
            <Router>
            <Routes>
              {/* Standalone Auth Route */}
              <Route path="/auth" element={<AuthPage />} />

              {/* App Layout Routes */}
              <Route path="/" element={<AuthGuard><Layout /></AuthGuard>}>
                <Route index element={<Dashboard />} />
                <Route path="chat" element={<VideoRoom />} />
                <Route path="profile" element={<MyProfile />} />
                <Route path="user/:username" element={<UserProfile />} />
                <Route path="messages" element={<Messages />} />
                <Route path="whisper-board" element={<WhisperBoard />} />
                
                {/* Superadmin Routes */}
                <Route path="superadmin" element={<AuthGuard requiredRoles={['superadmin']}><SuperAdminDashboard /></AuthGuard>} />
                <Route path="superadmin/users" element={<AuthGuard requiredRoles={['superadmin']}><ManageUsers /></AuthGuard>} />
                <Route path="superadmin/tickets" element={<AuthGuard requiredRoles={['superadmin']}><SupportTickets /></AuthGuard>} />
                <Route path="superadmin/announcements" element={<AuthGuard requiredRoles={['superadmin']}><Announcements /></AuthGuard>} />
                <Route path="superadmin/deletion-requests" element={<AuthGuard requiredRoles={['superadmin']}><DeletionRequests /></AuthGuard>} />
                <Route path="superadmin/reports" element={<AuthGuard requiredRoles={['superadmin']}><Reports /></AuthGuard>} />
                
                {/* Admin Routes */}
                <Route path="admin" element={<AuthGuard requiredRoles={['admin']}><AdminDashboard /></AuthGuard>} />
                <Route path="admin/users" element={<AuthGuard requiredRoles={['admin']}><ManageUsers /></AuthGuard>} />
                <Route path="admin/reports" element={<AuthGuard requiredRoles={['admin']}><Reports /></AuthGuard>} />
              </Route>

              {/* Fallback */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Router>
        </SocketProvider>
      </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

export default App;
