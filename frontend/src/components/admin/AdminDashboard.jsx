import React, { useState, useEffect } from 'react';
import { Shield, Users, AlertTriangle } from 'lucide-react';

const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

const AdminDashboard = () => {
  const [stats, setStats] = useState({ totalUsers: 0, pendingReports: 0 });

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${backendUrl}/api/admin/users`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const users = data.users || [];
        setStats({
          totalUsers: users.length,
          pendingReports: data.reports ? data.reports.filter(r => r.status === 'pending').length : 0
        });
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="manage-users-container">
      <h2>Admin Dashboard</h2>
      <p style={{color: '#9ca3af', marginBottom: '30px'}}>Welcome to the moderation dashboard. Here you can monitor user activity and handle reports.</p>
      
      <div className="stats-grid" style={{display: 'flex', gap: '20px', flexWrap: 'wrap', marginBottom: '30px'}}>
        <div className="stat-card" style={{background: '#1a2035', padding: '20px', borderRadius: '12px', flex: 1, minWidth: '200px', border: '1px solid #2a314d'}}>
          <div style={{display: 'flex', alignItems: 'center', gap: '10px', color: '#9ca3af', fontSize: '1rem'}}>
            <Users size={20} />
            <h3>Total Registered Users</h3>
          </div>
          <div style={{fontSize: '2.5rem', fontWeight: 'bold', color: '#fff', marginTop: '15px'}}>{stats.totalUsers}</div>
        </div>
        
        <div className="stat-card" style={{background: '#1a2035', padding: '20px', borderRadius: '12px', flex: 1, minWidth: '200px', border: '1px solid #2a314d'}}>
          <div style={{display: 'flex', alignItems: 'center', gap: '10px', color: '#9ca3af', fontSize: '1rem'}}>
            <AlertTriangle size={20} className="text-danger" />
            <h3>Pending Reports</h3>
          </div>
          <div style={{fontSize: '2.5rem', fontWeight: 'bold', color: '#ef4444', marginTop: '15px'}}>{stats.pendingReports}</div>
        </div>

        <div className="stat-card" style={{background: '#1a2035', padding: '20px', borderRadius: '12px', flex: 1, minWidth: '200px', border: '1px solid #2a314d', display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
          <div style={{display: 'flex', alignItems: 'center', gap: '10px', color: '#9ca3af', fontSize: '1rem', marginBottom: '10px'}}>
            <Shield size={20} className="text-lightblue" />
            <h3>Your Powers</h3>
          </div>
          <ul style={{ color: '#cbd5e1', paddingLeft: '20px', margin: 0, fontSize: '0.9rem', lineHeight: '1.5' }}>
            <li>Review and resolve user reports</li>
            <li>Block / Unblock non-admin users</li>
            <li>Direct message any user</li>
            <li>Visit any user profile</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
