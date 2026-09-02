import React, { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useSocket } from '../../contexts/SocketContext';

const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

const SuperAdminDashboard = () => {
  const [stats, setStats] = useState({ totalUsers: 0, admins: 0, pendingReports: 0, deletionRequests: 0 });
  const [analyticsData, setAnalyticsData] = useState([]);
  const { socket } = useSocket();

  useEffect(() => {
    fetchStats();
    fetchAnalytics();
  }, []);

  useEffect(() => {
    if (socket) {
      socket.on('admin-update', fetchStats);
      socket.on('new-deletion-request', fetchStats);
      socket.on('deletion-request-resolved', fetchStats);
    }
    return () => {
      if (socket) {
        socket.off('admin-update', fetchStats);
        socket.off('new-deletion-request', fetchStats);
        socket.off('deletion-request-resolved', fetchStats);
      }
    };
  }, [socket]);

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
          admins: users.filter(u => u.role === 'admin' || u.role === 'superadmin').length,
          pendingReports: data.reports ? data.reports.filter(r => r.status === 'pending').length : 0,
          deletionRequests: users.filter(u => u.deletionRequested).length
        });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchAnalytics = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${backendUrl}/api/admin/analytics`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const rawData = await res.json();
        // Format data for Recharts (e.g., '14:00' or 'Mon 14:00')
        const formattedData = rawData.map(item => {
          const date = new Date(item.timestamp);
          const timeString = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
          const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
          return {
            time: `${dayName} ${timeString}`,
            count: item.count
          };
        });
        setAnalyticsData(formattedData);
      }
    } catch (err) {
      console.error('Failed to fetch analytics', err);
    }
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div style={{ background: '#1e293b', border: '1px solid #334155', padding: '10px', borderRadius: '8px', color: '#fff' }}>
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>{label}</p>
          <p style={{ margin: '5px 0 0 0', fontWeight: 'bold', color: '#3b82f6' }}>
            Online Users: {payload[0].value}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="manage-users-container">
      <h2>Superadmin Dashboard</h2>
      <p style={{color: '#9ca3af', marginBottom: '30px'}}>Welcome to the control center.</p>
      
      <div className="stats-grid" style={{display: 'flex', gap: '20px', flexWrap: 'wrap', marginBottom: '30px'}}>
        <div className="stat-card" style={{background: '#1a2035', padding: '20px', borderRadius: '12px', flex: 1, minWidth: '200px', border: '1px solid #2a314d'}}>
          <h3 style={{color: '#9ca3af', fontSize: '0.9rem'}}>Total Users</h3>
          <div style={{fontSize: '2.5rem', fontWeight: 'bold', color: '#fff', marginTop: '10px'}}>{stats.totalUsers}</div>
        </div>
        <div className="stat-card" style={{background: '#1a2035', padding: '20px', borderRadius: '12px', flex: 1, minWidth: '200px', border: '1px solid #2a314d'}}>
          <h3 style={{color: '#9ca3af', fontSize: '0.9rem'}}>Admins</h3>
          <div style={{fontSize: '2.5rem', fontWeight: 'bold', color: '#3b82f6', marginTop: '10px'}}>{stats.admins}</div>
        </div>
        <div className="stat-card" style={{background: '#1a2035', padding: '20px', borderRadius: '12px', flex: 1, minWidth: '200px', border: '1px solid #2a314d'}}>
          <h3 style={{color: '#9ca3af', fontSize: '0.9rem'}}>Pending Reports</h3>
          <div style={{fontSize: '2.5rem', fontWeight: 'bold', color: '#ef4444', marginTop: '10px'}}>{stats.pendingReports}</div>
        </div>
        <div className="stat-card" style={{background: '#1a2035', padding: '20px', borderRadius: '12px', flex: 1, minWidth: '200px', border: '1px solid #2a314d'}}>
          <h3 style={{color: '#9ca3af', fontSize: '0.9rem'}}>Deletion Requests</h3>
          <div style={{fontSize: '2.5rem', fontWeight: 'bold', color: '#f59e0b', marginTop: '10px'}}>{stats.deletionRequests}</div>
        </div>
      </div>

      <div className="analytics-section" style={{background: '#1a2035', padding: '20px', borderRadius: '12px', border: '1px solid #2a314d'}}>
        <h3 style={{color: '#fff', fontSize: '1.2rem', marginBottom: '5px'}}>Live Online Users</h3>
        <p style={{color: '#9ca3af', fontSize: '0.85rem', marginBottom: '20px'}}>Tracks the peak active users every hour over the last 7 days.</p>
        
        {analyticsData.length === 0 ? (
          <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
            Collecting data... The graph will populate on the next hourly update.
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '20px', flexDirection: 'column' }}>
            <div style={{ width: '100%', height: 350 }}>
              <ResponsiveContainer>
                <AreaChart data={analyticsData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" vertical={false} />
                  <XAxis dataKey="time" stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorCount)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            
            <div className="analytics-table-container" style={{ overflowX: 'auto', marginTop: '20px' }}>
              <h4 style={{ color: '#e2e8f0', marginBottom: '10px' }}>Detailed Hourly Log</h4>
            <div className="table-responsive">
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', color: '#cbd5e1', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #334155' }}>
                    <th style={{ padding: '10px', color: '#94a3b8', fontWeight: '500' }}>Time</th>
                    <th style={{ padding: '10px', color: '#94a3b8', fontWeight: '500' }}>Active Users</th>
                  </tr>
                </thead>
                <tbody>
                  {[...analyticsData].reverse().map((data, index) => (
                    <tr key={index} style={{ borderBottom: '1px solid #1e293b' }}>
                      <td style={{ padding: '10px' }}>{data.time}</td>
                      <td style={{ padding: '10px', fontWeight: 'bold', color: '#3b82f6' }}>{data.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SuperAdminDashboard;
