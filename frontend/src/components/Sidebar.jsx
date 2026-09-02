import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { X } from 'lucide-react';
import ContactSupportModal from './ContactSupportModal';

const Sidebar = ({ isOpen, toggleSidebar }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { socket } = useSocket();
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const [badges, setBadges] = useState({ messages: 0, reports: 0, deletionRequests: 0 });
  const [hasNewWhisper, setHasNewWhisper] = useState(false);
  const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

  const fetchBadges = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      const res = await fetch(`${backendUrl}/api/badges`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Cache-Control': 'no-cache' }
      });
      if (res.ok) {
        const data = await res.json();
        setBadges(data);
      }
    } catch (err) { console.error('Failed to fetch badges', err); }
  };

  useEffect(() => {
    if (user) fetchBadges();
  }, [user]);

  useEffect(() => {
    if (!socket) return;
    
    const handleUpdate = () => fetchBadges();
    const handleNewWhisper = () => setHasNewWhisper(true);
    
    socket.on('private-message', handleUpdate);
    socket.on('admin-update', handleUpdate);
    socket.on('new-whisper', handleNewWhisper);
    window.addEventListener('badge-update-required', handleUpdate);
    
    return () => {
      socket.off('private-message', handleUpdate);
      socket.off('admin-update', handleUpdate);
      socket.off('new-whisper', handleNewWhisper);
      window.removeEventListener('badge-update-required', handleUpdate);
    };
  }, [socket]);

  const handleLogout = () => {
    logout();
    navigate('/auth');
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && <div className="sidebar-backdrop" onClick={toggleSidebar}></div>}

      <div className={`sidebar-container ${isOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="topbar-logo">
            <span className="logo-cc">CC</span>
            <span className="logo-text">Coll-Connect</span>
          </div>
          <button className="close-btn" onClick={toggleSidebar}>
            <X size={20} color="#e0e0e0" />
          </button>
        </div>

        <div className="sidebar-scroll-area">
          <div className="sidebar-section">
            <div className="section-title">HOME & CHAT</div>
            <nav className="sidebar-nav">
              <NavLink to="/" end className={({isActive}) => isActive ? "nav-item active" : "nav-item"} onClick={toggleSidebar}>
                Random Chat
              </NavLink>
              <NavLink to="/profile" className={({isActive}) => isActive ? "nav-item active" : "nav-item"} onClick={toggleSidebar}>
                My Profile
              </NavLink>
              <NavLink to="/whisper-board" className={({isActive}) => isActive ? "nav-item active" : "nav-item"} onClick={() => { toggleSidebar(); setHasNewWhisper(false); }}>
                <span style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                  Whisper Board
                  {hasNewWhisper && (
                    <span className="blue-crystal-indicator" style={{ width: '8px', height: '8px', padding: 0, borderRadius: '50%', minWidth: '8px' }}></span>
                  )}
                </span>
              </NavLink>
              <NavLink to="/messages" className={({isActive}) => isActive ? "nav-item active" : "nav-item"} onClick={toggleSidebar}>
                <span style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                  Messages
                  {badges.messages > 0 && (
                    <span className="blue-crystal-indicator">
                      {badges.messages}
                    </span>
                  )}
                </span>
              </NavLink>
            </nav>
          </div>

          {user?.role === 'superadmin' && (
            <div className="sidebar-section">
              <div className="section-title">SUPERADMIN PANEL</div>
              <nav className="sidebar-nav">
                <NavLink to="/superadmin" end className={({isActive}) => isActive ? "nav-item active" : "nav-item"} onClick={toggleSidebar}>
                  Dashboard
                </NavLink>
                <NavLink to="/superadmin/users" className={({isActive}) => isActive ? "nav-item active" : "nav-item"} onClick={toggleSidebar}>
                  Manage Users
                </NavLink>
                <NavLink to="/superadmin/tickets" className={({isActive}) => isActive ? "nav-item active" : "nav-item"} onClick={toggleSidebar}>
                  Support Tickets
                </NavLink>
                <NavLink to="/superadmin/announcements" className={({isActive}) => isActive ? "nav-item active" : "nav-item"} onClick={toggleSidebar}>
                  Announcements
                </NavLink>
                <NavLink to="/superadmin/reports" className={({isActive}) => isActive ? "nav-item active" : "nav-item"} onClick={toggleSidebar}>
                  <span style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                    Reports
                    {badges.reports > 0 && (
                      <span className="blue-crystal-indicator">
                        {badges.reports}
                      </span>
                    )}
                  </span>
                </NavLink>
                <NavLink to="/superadmin/deletion-requests" className={({isActive}) => isActive ? "nav-item active" : "nav-item"} onClick={toggleSidebar}>
                  <span style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                    Deletion Requests
                    {badges.deletionRequests > 0 && (
                      <span className="blue-crystal-indicator">
                        {badges.deletionRequests}
                      </span>
                    )}
                  </span>
                </NavLink>
              </nav>
            </div>
          )}

          {user?.role === 'admin' && (
            <div className="sidebar-section">
              <div className="section-title">ADMIN PANEL</div>
              <nav className="sidebar-nav">
                <NavLink to="/admin" end className={({isActive}) => isActive ? "nav-item active" : "nav-item"} onClick={toggleSidebar}>
                  Dashboard
                </NavLink>
                <NavLink to="/admin/users" className={({isActive}) => isActive ? "nav-item active" : "nav-item"} onClick={toggleSidebar}>
                  Manage Users
                </NavLink>
                <NavLink to="/admin/reports" className={({isActive}) => isActive ? "nav-item active" : "nav-item"} onClick={toggleSidebar}>
                  <span style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                    Reports
                    {badges.reports > 0 && (
                      <span className="blue-crystal-indicator">
                        {badges.reports}
                      </span>
                    )}
                  </span>
                </NavLink>
              </nav>
            </div>
          )}
        </div>

        <div className="sidebar-footer">
          <button className="logout-btn" onClick={handleLogout}>Logout</button>
          
          <div className="footer-info">
            <div className="version-info">
              <strong>Coll-Connect</strong> <span className="version-badge">Version 1.0</span>
            </div>
            <p className="tagline">Empowering Seamless Connections. Bridging Distances with Secure, Real-time Communication.</p>
            <a href="#" className="support-link" onClick={(e) => { e.preventDefault(); setIsSupportOpen(true); }}>Contact Support</a>
          </div>
        </div>
      </div>
      
      <ContactSupportModal isOpen={isSupportOpen} onClose={() => setIsSupportOpen(false)} />
    </>
  );
};

export default Sidebar;
