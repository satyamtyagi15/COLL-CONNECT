import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useSocket } from '../../contexts/SocketContext';
import { useToast } from '../../contexts/ToastContext';

const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

const ManageUsers = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { socket } = useSocket();
  const { showConfirm, showToast } = useToast();
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [blockDurations, setBlockDurations] = useState({});
  const [showReportsModal, setShowReportsModal] = useState(false);
  const [selectedUserReports, setSelectedUserReports] = useState([]);
  const [selectedUsername, setSelectedUsername] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);

  const isAdmin = user?.role === 'admin';
  const isSuperadmin = user?.role === 'superadmin';

  const fetchUsers = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${backendUrl}/api/admin/users?t=${new Date().getTime()}`, {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    if (socket) {
      socket.on('admin-update', fetchUsers);
    }
    return () => {
      if (socket) socket.off('admin-update', fetchUsers);
    };
  }, [socket, fetchUsers]);

  const handleAction = async (endpoint, payload) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${backendUrl}/api/admin/${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        fetchUsers();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const promoteUser = (username) => handleAction('promote', { username });
  const dismissAdmin = (username) => handleAction('dismiss', { username });
  const deleteUser = (username) => {
    showConfirm(`Are you sure you want to permanently delete ${username}?`, () => {
      handleAction('force-delete-user', { username });
    });
  };
  
  const blockUser = (username) => {
    const duration = blockDurations[username] || '30 Mins';
    let apiDuration = 'none';
    if (duration === '15 Mins') apiDuration = '15';
    else if (duration === '30 Mins') apiDuration = '30';
    else if (duration === '1 Hour') apiDuration = '60';
    else if (duration === '24 Hours') apiDuration = '1440';
    else if (duration === 'Permanent') apiDuration = 'permanent';
    
    showConfirm(`Block ${username} for ${duration}?`, () => {
      // In the backend, we now use /api/admin/block/:username
      fetch(`${backendUrl}/api/admin/block/${username}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ duration: apiDuration })
      }).then(res => {
        if(res.ok) fetchUsers();
      }).catch(err => console.error(err));
    });
  };

  const unblockUser = (username) => {
    showConfirm(`Are you sure you want to unblock ${username}?`, () => {
      fetch(`${backendUrl}/api/admin/block/${username}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ duration: 'none' })
      }).then(res => {
        if(res.ok) fetchUsers();
      }).catch(err => console.error(err));
    });
  };

  const viewWarnings = (userObj) => {
    setSelectedUsername(userObj.username);
    setSelectedUserReports(userObj.warningHistory || []);
    setShowReportsModal(true);
  };

  const messageUser = (username) => {
    navigate('/messages', { state: { openChatWith: username } });
  };

  const isBlocked = (blockedUntil) => {
    if (!blockedUntil) return false;
    if (blockedUntil === 'permanent') return true;
    return new Date(blockedUntil) > new Date();
  };

  const handleDurationChange = (username, value) => {
    setBlockDurations(prev => ({ ...prev, [username]: value }));
  };

  const filteredUsers = users.filter(u => 
    u.username.toLowerCase().includes(search.toLowerCase()) || 
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  const admins = filteredUsers.filter(u => u.role === 'admin' || u.role === 'superadmin');
  const normalUsers = filteredUsers.filter(u => u.role === 'user');

  return (
    <div className="manage-users-container">
      <h2>All Registered Users</h2>
      
      <div className="search-bar-wrapper">
        <input 
          type="text" 
          placeholder="Search by username or email..." 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="admin-search-input"
        />
      </div>

      {loading ? <p style={{color: '#9ca3af'}}>Loading users...</p> : (
        <>
          <div className="user-section">
            <h3 className="section-heading blue-heading">Admins ({admins.length})</h3>
            <div className="user-list">
              {admins.map(u => (
                <div key={u.username} className="user-card admin-card">
                  <div className="user-card-row">
                    <span className="label">Username:</span>
                    <span className="value">{u.username}</span>
                    <span className={`badge ${u.role === 'superadmin' ? 'badge-superadmin' : 'badge-admin'}`}>
                      {u.role.toUpperCase()}
                    </span>
                  </div>
                  <div className="user-card-row">
                    <span className="label">Email:</span>
                    <span className="value">{u.email}</span>
                  </div>
                  {isSuperadmin && (
                    <div className="user-card-row">
                      <span className="label text-danger">Password:</span>
                      <span className="value text-danger">{u.password || '*********'}</span>
                    </div>
                  )}
                  
                  <div className="user-actions row-actions" style={{marginTop: '10px'}}>
                    {u.role !== 'superadmin' && (
                      <button className="btn-action" style={{backgroundColor: '#3b82f6', color: 'white'}} onClick={() => navigate(`/user/${u.username}`)}>VISIT PROFILE</button>
                    )}
                    {isSuperadmin && u.role === 'admin' && (
                      <button className="btn-action btn-red" onClick={() => dismissAdmin(u.username)}>
                        DISMISS ADMIN
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="user-section">
            <h3 className="section-heading green-heading">Normal Users ({normalUsers.length})</h3>
            <div className="user-list">
              {normalUsers.map(u => (
                <div key={u.username} className="user-card">
                  <div className="user-card-row">
                    <span className="label">Username:</span>
                    <span className="value">{u.username}</span>
                    <span className="badge badge-user">USER</span>
                  </div>
                  <div className="user-card-row">
                    <span className="label">Email:</span>
                    <span className="value">{u.email}</span>
                  </div>
                  {isSuperadmin && (
                    <div className="user-card-row">
                      <span className="label text-danger">Password:</span>
                      <span className="value text-danger">{u.password || '*********'}</span>
                    </div>
                  )}
                  
                  <div className="user-actions row-actions mt-2" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    <button className="btn-action" style={{backgroundColor: '#3b82f6', color: 'white'}} onClick={() => navigate(`/user/${u.username}`)}>VISIT PROFILE</button>
                    <button className="btn-action" style={{backgroundColor: '#10b981', color: 'white'}} onClick={() => messageUser(u.username)}>MESSAGE</button>
                    <button className="btn-action btn-red" onClick={() => viewWarnings(u)}>
                      WARNINGS {u.warningHistory?.length > 0 && `(${u.warningHistory.length})`}
                    </button>
                    {isSuperadmin && (
                      <>
                        <button className="btn-action btn-red" onClick={() => deleteUser(u.username)}>DELETE ID</button>
                        <button className="btn-action btn-blue" onClick={() => promoteUser(u.username)}>PROMOTE TO ADMIN</button>
                      </>
                    )}
                  </div>
                  
                  {isBlocked(u.blockedUntil) ? (
                    <div className="user-actions row-actions mt-2" style={{alignItems: 'center'}}>
                      <button className="btn-action btn-blue" onClick={() => unblockUser(u.username)}>UNBLOCK USER</button>
                      <span style={{color: '#ef4444', fontSize: '0.8rem', marginLeft: '10px'}}>
                        {u.blockedUntil === 'permanent' ? 'Permanently Blocked' : `Blocked until ${new Date(u.blockedUntil).toLocaleString()}`}
                      </span>
                    </div>
                  ) : (
                    <div className="user-actions row-actions mt-2">
                      <select 
                        className="admin-select"
                        value={blockDurations[u.username] || '30 Mins'}
                        onChange={(e) => handleDurationChange(u.username, e.target.value)}
                      >
                        <option>15 Mins</option>
                        <option>30 Mins</option>
                        <option>1 Hour</option>
                        <option>24 Hours</option>
                        <option>Permanent</option>
                      </select>
                      <button className="btn-action btn-red" onClick={() => blockUser(u.username)}>BLOCK USER</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {showReportsModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowReportsModal(false)}>
          <div style={{ background: '#1f2937', padding: '24px', borderRadius: '12px', width: '600px', maxHeight: '80vh', overflowY: 'auto', border: '1px solid #374151' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px 0', color: '#ef4444' }}>Warning History for {selectedUsername}</h3>
            {selectedUserReports.length === 0 ? (
              <p style={{ color: '#9ca3af' }}>No warnings found.</p>
            ) : (
              selectedUserReports.map((warning, index) => (
                <div key={index} style={{ background: '#111827', padding: '16px', borderRadius: '8px', marginBottom: '16px', border: '1px solid #4b5563' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ color: '#60a5fa', fontWeight: 'bold' }}>Warned By: {warning.byAdmin || 'System'}</span>
                    <span style={{ color: '#9ca3af', fontSize: '0.85rem' }}>{new Date(warning.date).toLocaleString()}</span>
                  </div>
                  <p style={{ color: '#f3f4f6', margin: '0 0 12px 0' }}>Warning Message: {warning.message}</p>
                  <p style={{ color: '#9ca3af', margin: '0 0 12px 0', fontSize: '0.85rem' }}>Reported By: {warning.reporter || 'N/A'}</p>
                  <p style={{ color: '#9ca3af', margin: '0 0 12px 0', fontSize: '0.85rem' }}>Reason: {warning.reason || 'N/A'}</p>
                  {warning.screenshot && (
                    <div style={{ marginTop: '10px' }}>
                      <p style={{ color: '#9ca3af', fontSize: '0.85rem', marginBottom: '4px' }}>Screenshot Evidence:</p>
                      <img 
                        src={warning.screenshot} 
                        alt="evidence" 
                        onClick={() => setSelectedImage(warning.screenshot)}
                        style={{ width: '100%', borderRadius: '8px', border: '1px solid #374151', cursor: 'pointer', transition: 'opacity 0.2s' }} 
                        onMouseEnter={(e) => e.currentTarget.style.opacity = 0.8}
                        onMouseLeave={(e) => e.currentTarget.style.opacity = 1}
                      />
                    </div>
                  )}
                </div>
              ))
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button onClick={() => setShowReportsModal(false)} style={{ background: '#374151', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer' }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {selectedImage && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.9)', zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px' }} onClick={() => setSelectedImage(null)}>
          <img src={selectedImage} alt="Full Evidence" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: '8px' }} />
        </div>
      )}

    </div>
  );
};

export default ManageUsers;
