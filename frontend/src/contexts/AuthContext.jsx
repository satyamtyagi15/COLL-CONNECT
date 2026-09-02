import React, { createContext, useContext, useState, useEffect } from 'react';

const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem('user');
    if (!savedUser || savedUser === 'undefined') return null;
    try {
      return JSON.parse(savedUser);
    } catch (e) {
      console.error('Failed to parse user from localStorage', e);
      localStorage.removeItem('user');
      return null;
    }
  });

  const login = (token, userData) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
  };

  const [globalProfileData, setGlobalProfileData] = useState(null);

  useEffect(() => {
    if (user && user.username) {
      const fetchProfile = async () => {
        try {
          const res = await fetch(`${backendUrl}/api/me`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
          });
          if (res.ok) {
            const data = await res.json();
            setGlobalProfileData(data);
            
            // Sync local storage user if role differs (e.g. promoted/demoted while offline)
            if (data.role && data.role !== user.role) {
              const updatedUser = { ...user, role: data.role };
              localStorage.setItem('user', JSON.stringify(updatedUser));
              setUser(updatedUser);
            }
          } else if (res.status === 404 || res.status === 401) {
            // User deleted or token invalid
            logout();
          }
        } catch (err) {
          console.error('Failed to fetch global profile data', err);
        }
      };
      fetchProfile();
    } else {
      setGlobalProfileData(null);
    }
  }, [user]);

  const updateGlobalProfile = (newData) => {
    setGlobalProfileData(prev => ({ ...prev, ...newData }));
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    setGlobalProfileData(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, globalProfileData, updateGlobalProfile }}>
      {children}
    </AuthContext.Provider>
  );
};
