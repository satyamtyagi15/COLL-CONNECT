import React, { useState, useEffect } from 'react';
import { Shield, AlertTriangle, Image as ImageIcon, Search } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useSocket } from '../../contexts/SocketContext';
import { useToast } from '../../contexts/ToastContext';

const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

const Reports = () => {
  const { user } = useAuth();
  const { socket } = useSocket();
  const { showConfirm, showToast } = useToast();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState(null);

  // Warn Modal States
  const [showWarnModal, setShowWarnModal] = useState(false);
  const [warnReportId, setWarnReportId] = useState(null);
  const [warnMessage, setWarnMessage] = useState('');

  const fetchReports = async () => {
    try {
      const token = localStorage.getItem('token');
      // Reusing the admin/users endpoint since it returns reports array as well
      const res = await fetch(`${backendUrl}/api/admin/users?t=${new Date().getTime()}`, {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      if (res.ok) {
        const data = await res.json();
        const pendingReports = (data.reports || []).filter(r => r.status === 'pending');
        setReports(pendingReports);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

  useEffect(() => {
    if (socket) {
      socket.on('admin-update', fetchReports);
    }
    return () => {
      if (socket) socket.off('admin-update', fetchReports);
    };
  }, [socket]);

  const handleDismiss = async (reportId) => {
    showConfirm('Are you sure you want to dismiss this report?', async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${backendUrl}/api/admin/dismiss-report`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ reportId })
        });
        if (res.ok) {
          showToast('Report dismissed successfully');
          fetchReports();
        } else { showToast('Failed to dismiss report'); }
      } catch (err) { showToast('Server error'); }
    });
  };

  const handleWarnClick = (reportId) => {
    setWarnReportId(reportId);
    setWarnMessage('');
    setShowWarnModal(true);
  };

  const submitWarnUser = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${backendUrl}/api/admin/warn-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ reportId: warnReportId, warningMessage: warnMessage })
      });
      if (res.ok) {
        showToast('User warned successfully');
        setShowWarnModal(false);
        fetchReports();
      } else { showToast('Failed to warn user'); }
    } catch (err) { showToast('Server error'); }
  };

  if (loading) return <div style={{color:'#fff', padding:'20px'}}>Loading reports...</div>;

  return (
    <div className="reports-container" style={{ padding: '20px', color: '#f3f4f6', maxWidth: '1000px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '30px' }}>
        <AlertTriangle size={32} color="#ef4444" />
        <h2 style={{ margin: 0 }}>Pending Reports</h2>
      </div>

      {reports.length === 0 ? (
        <div style={{ background: '#1f2937', padding: '40px', borderRadius: '12px', textAlign: 'center', border: '1px solid #374151' }}>
          <Shield size={48} color="#10b981" style={{ marginBottom: '15px', opacity: 0.8 }} />
          <h3 style={{ margin: '0 0 10px 0', color: '#d1d5db' }}>All Caught Up!</h3>
          <p style={{ color: '#9ca3af', margin: 0 }}>There are no pending reports to review.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '20px' }}>
          {reports.map((report) => (
            <div key={report.id || report._id} style={{ background: '#1f2937', borderRadius: '12px', border: '1px solid #374151', overflow: 'hidden' }}>
              <div style={{ padding: '15px 20px', background: '#111827', borderBottom: '1px solid #374151', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                  <div>
                    <span style={{ color: '#9ca3af', fontSize: '0.85rem' }}>Reported User</span>
                    <div style={{ fontWeight: 'bold', fontSize: '1.1rem', color: '#ef4444' }}>{report.reportedUser}</div>
                  </div>
                  <div style={{ height: '30px', width: '1px', background: '#374151' }}></div>
                  <div>
                    <span style={{ color: '#9ca3af', fontSize: '0.85rem' }}>Reported By</span>
                    <div style={{ fontWeight: 'bold', fontSize: '1rem', color: '#60a5fa' }}>{report.reporter}</div>
                  </div>
                </div>
                <div style={{ color: '#9ca3af', fontSize: '0.85rem' }}>
                  {new Date(report.time || report.timestamp).toLocaleString()}
                </div>
              </div>
              
              <div style={{ padding: '20px', display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 300px' }}>
                  <h4 style={{ margin: '0 0 10px 0', color: '#d1d5db', fontSize: '0.95rem' }}>Reason</h4>
                  <div style={{ background: '#111827', padding: '12px', borderRadius: '8px', color: '#f3f4f6', border: '1px solid #374151', fontSize: '0.95rem', lineHeight: '1.5' }}>
                    {report.reason}
                  </div>
                </div>
                
                {report.screenshot && (
                  <div style={{ flex: '0 0 200px' }}>
                    <h4 style={{ margin: '0 0 10px 0', color: '#d1d5db', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <ImageIcon size={16} /> Attached Evidence
                    </h4>
                    <div 
                      style={{ height: '120px', background: '#111827', borderRadius: '8px', border: '1px solid #374151', overflow: 'hidden', cursor: 'pointer', position: 'relative' }}
                      onClick={() => setSelectedImage(report.screenshot)}
                    >
                      <img src={report.screenshot} alt="Evidence" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.opacity = 1} onMouseLeave={(e) => e.currentTarget.style.opacity = 0}>
                        <Search color="#fff" />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div style={{ padding: '15px 20px', background: '#111827', borderTop: '1px solid #374151', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button 
                  onClick={() => handleDismiss(report.id || report._id)}
                  style={{ background: 'transparent', border: '1px solid #4b5563', color: '#d1d5db', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', transition: 'all 0.2s' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#374151'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  Dismiss
                </button>
                <button 
                  onClick={() => handleWarnClick(report.id || report._id)}
                  style={{ background: '#eab308', color: '#000', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', transition: 'all 0.2s' }}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
                >
                  Warn User
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedImage && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.9)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px' }} onClick={() => setSelectedImage(null)}>
          <img src={selectedImage} alt="Full Evidence" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: '8px' }} />
        </div>
      )}

      {showWarnModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#1f2937', padding: '30px', borderRadius: '12px', width: '90%', maxWidth: '450px', border: '1px solid #374151' }}>
            <h3 style={{ margin: '0 0 20px 0', color: '#f3f4f6', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <AlertTriangle size={24} color="#eab308" />
              Warn User
            </h3>
            
            <p style={{ color: '#9ca3af', marginBottom: '20px', fontSize: '0.9rem', lineHeight: '1.5' }}>
              Send a warning to this user. This will be recorded in their profile history.
            </p>

            <div style={{ marginBottom: '25px' }}>
              <label style={{ display: 'block', color: '#d1d5db', marginBottom: '8px', fontSize: '0.9rem' }}>Warning Message (Optional):</label>
              <textarea 
                value={warnMessage} 
                onChange={(e) => setWarnMessage(e.target.value)}
                placeholder="Leave blank for a default warning..."
                style={{ width: '100%', padding: '12px', background: '#111827', border: '1px solid #374151', color: '#f3f4f6', borderRadius: '8px', outline: 'none', minHeight: '100px', resize: 'vertical' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button 
                onClick={() => setShowWarnModal(false)}
                style={{ padding: '10px 16px', background: 'transparent', border: '1px solid #4b5563', color: '#d1d5db', borderRadius: '8px', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button 
                onClick={submitWarnUser}
                style={{ padding: '10px 16px', background: '#eab308', color: '#000', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                Send Warning
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Reports;
