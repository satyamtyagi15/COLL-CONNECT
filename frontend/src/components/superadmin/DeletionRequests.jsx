import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useSocket } from '../../contexts/SocketContext';
import { useToast } from '../../contexts/ToastContext';

const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

const DeletionRequests = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { socket } = useSocket();
  const { showConfirm, showToast } = useToast();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Modal for Warnings
  const [showWarningsModal, setShowWarningsModal] = useState(false);
  const [selectedUserWarnings, setSelectedUserWarnings] = useState([]);
  const [selectedUsername, setSelectedUsername] = useState('');

  const fetchRequests = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${backendUrl}/api/admin/deletion-requests?t=${new Date().getTime()}`, {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      if (res.ok) {
        const data = await res.json();
        setRequests(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  useEffect(() => {
    if (socket) {
      socket.on('admin-update', fetchRequests);
      socket.on('new-deletion-request', fetchRequests);
      socket.on('deletion-request-resolved', fetchRequests);
    }
    return () => {
      if (socket) {
        socket.off('admin-update', fetchRequests);
        socket.off('new-deletion-request', fetchRequests);
        socket.off('deletion-request-resolved', fetchRequests);
      }
    };
  }, [socket, fetchRequests]);

  const handleAction = async (endpoint, username, actionName) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${backendUrl}/api/admin/deletion-requests/${username}/${endpoint}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        showToast(`Request ${actionName} for ${username}`);
        fetchRequests();
      } else {
        showToast(`Failed to ${actionName} request.`);
      }
    } catch (err) {
      console.error(err);
      showToast('Server error');
    }
  };

  const acceptRequest = (username) => {
    showConfirm(`Are you sure you want to permanently delete ${username}? This will erase all their chats and data globally.`, () => {
      handleAction('accept', username, 'accepted');
    });
  };

  const dismissRequest = (username) => {
    showConfirm(`Dismiss deletion request for ${username}?`, () => {
      handleAction('dismiss', username, 'dismissed');
    });
  };

  const openWarningsModal = (username, warnings) => {
    setSelectedUsername(username);
    setSelectedUserWarnings(warnings || []);
    setShowWarningsModal(true);
  };

  const closeWarningsModal = () => {
    setShowWarningsModal(false);
    setSelectedUserWarnings([]);
    setSelectedUsername('');
  };

  if (user?.role !== 'superadmin') return <div className="loading-container">Access Denied</div>;
  if (loading) return <div className="loading-container">Loading Requests...</div>;

  return (
    <div className="manage-users-container">
      <h2>Account Deletion Requests</h2>
      <p style={{color: '#9ca3af', marginBottom: '20px'}}>Manage users who have requested to permanently delete their accounts.</p>

      {requests.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', backgroundColor: '#1a2035', borderRadius: '12px', border: '1px solid #2a314d', color: '#94a3b8' }}>
          No pending deletion requests at the moment.
        </div>
      ) : (
        <div className="users-list">
          {requests.map(reqUser => (
            <div key={reqUser.username} className="user-card" style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #2a314d', paddingBottom: '15px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                  <div style={{ width: '50px', height: '50px', borderRadius: '50%', backgroundColor: '#374151', overflow: 'hidden' }}>
                    {reqUser.profilePic ? (
                      <img src={reqUser.profilePic} alt={reqUser.username} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>U</div>
                    )}
                  </div>
                  <div>
                    <h3 style={{ margin: 0, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {reqUser.username}
                      <span className="badge badge-user" style={{ fontSize: '10px' }}>USER</span>
                    </h3>
                    <div style={{ color: '#94a3b8', fontSize: '0.85rem', marginTop: '4px' }}>{reqUser.email}</div>
                  </div>
                </div>
                
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: '#94a3b8', fontSize: '0.8rem' }}>Joined: {new Date(reqUser.joinedAt).toLocaleDateString()}</div>
                  <div style={{ color: '#eab308', fontSize: '0.8rem', marginTop: '4px', fontWeight: 'bold' }}>
                    Warnings: {reqUser.warningHistory?.length || 0}
                  </div>
                </div>
              </div>
              
              <div className="user-actions" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button className="btn-action btn-blue" onClick={() => navigate(`/user/${reqUser.username}`)}>VISIT PROFILE</button>
                <button className="btn-action btn-blue" onClick={() => openWarningsModal(reqUser.username, reqUser.warningHistory)}>WARNINGS ({reqUser.warningHistory?.length || 0})</button>
                
                <div style={{ flex: 1 }}></div>
                
                <button className="btn-action" style={{ backgroundColor: '#475569', color: 'white' }} onClick={() => dismissRequest(reqUser.username)}>DISMISS REQUEST</button>
                <button className="btn-action" style={{ backgroundColor: '#ef4444', color: 'white' }} onClick={() => acceptRequest(reqUser.username)}>ACCEPT DELETION</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Warnings Modal */}
      {showWarningsModal && (
        <div className="modal-overlay" onClick={closeWarningsModal}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px', width: '90%' }}>
            <h3 style={{ marginBottom: '20px', color: '#f8fafc', borderBottom: '1px solid #334155', paddingBottom: '10px' }}>Warnings for {selectedUsername}</h3>
            <div className="reports-list" style={{ maxHeight: '400px', overflowY: 'auto', paddingRight: '10px' }}>
              {selectedUserWarnings.length === 0 ? (
                <p className="text-muted">No warnings issued to this user.</p>
              ) : (
                selectedUserWarnings.map((warn, index) => (
                  <div key={index} style={{ backgroundColor: '#1e293b', padding: '15px', borderRadius: '8px', marginBottom: '10px', border: '1px solid #334155' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>{new Date(warn.timestamp).toLocaleString()}</span>
                      <span style={{ color: '#eab308', fontSize: '0.85rem', fontWeight: 'bold' }}>By: {warn.byAdmin}</span>
                    </div>
                    <div style={{ color: '#e2e8f0', marginBottom: '8px' }}><strong>Message:</strong> {warn.message}</div>
                    <div style={{ color: '#cbd5e1', fontSize: '0.9rem' }}><strong>Reason context:</strong> {warn.reason}</div>
                  </div>
                ))
              )}
            </div>
            <div style={{ marginTop: '20px', textAlign: 'right' }}>
              <button className="btn-cancel" onClick={closeWarningsModal}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DeletionRequests;
