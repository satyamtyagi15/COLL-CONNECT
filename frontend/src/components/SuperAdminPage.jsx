import React, { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import AuthGuard from './auth/AuthGuard';

const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

const SuperAdminPage = () => {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${backendUrl}/api/admin/users`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) setUsers(await res.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const promoteUser = async (userId) => {
    // Implement API call
    console.log("Promote", userId);
  };

  const dismissAdmin = async (userId) => {
    // Implement API call
    console.log("Dismiss", userId);
  };

  return (
    <AuthGuard requiredRoles={['superadmin']}>
      <div style={{ color: 'white', padding: '20px' }}>
        <h2>SuperAdmin Dashboard</h2>
        <p>Manage users and admins here.</p>
        
        {loading ? <p>Loading users...</p> : (
          <table style={{ width: '100%', marginTop: '20px', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #2d3748', textAlign: 'left' }}>
                <th style={{ padding: '10px' }}>Username</th>
                <th style={{ padding: '10px' }}>Email</th>
                <th style={{ padding: '10px' }}>Role</th>
                <th style={{ padding: '10px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u._id} style={{ borderBottom: '1px solid #1a202c' }}>
                  <td style={{ padding: '10px' }}>{u.username}</td>
                  <td style={{ padding: '10px' }}>{u.email}</td>
                  <td style={{ padding: '10px' }}>{u.role}</td>
                  <td style={{ padding: '10px' }}>
                    {u.role === 'user' && (
                      <button className="btn-primary" style={{ padding: '5px 10px', fontSize: '0.8rem', width: 'auto' }} onClick={() => promoteUser(u._id)}>Promote to Admin</button>
                    )}
                    {u.role === 'admin' && (
                      <button className="btn-danger" style={{ padding: '5px 10px', fontSize: '0.8rem' }} onClick={() => dismissAdmin(u._id)}>Dismiss</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AuthGuard>
  );
};

export default SuperAdminPage;
