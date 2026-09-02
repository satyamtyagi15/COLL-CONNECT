import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';

const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
const SocketContext = createContext();

export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const { user, logout } = useAuth();
  const { showToast } = useToast();

  useEffect(() => {
    if (user && user.username) {
      const newSocket = io(backendUrl);
      
      newSocket.on('connect', () => {
        newSocket.emit('register-active', user.username);
      });

      newSocket.on('account-deleted', () => {
        showToast('Your account has been permanently deleted by the Superadmin.');
        if (logout) logout();
      });

      newSocket.on('deletion-request-dismissed', () => {
        showToast('Your account deletion request was dismissed by the Superadmin.');
        window.dispatchEvent(new Event('profile-refresh-required'));
      });

      newSocket.on('warning-received', (data) => {
        showToast(data.message || 'You have received a warning from the admin.');
        window.dispatchEvent(new Event('profile-refresh-required'));
      });

      newSocket.on('account-blocked', () => {
        showToast('Your account has been blocked by the moderation team. You have been logged out.');
        if (logout) logout();
      });

      setSocket(newSocket);
      return () => newSocket.close();
    }
  }, [user, logout]);

  return (
    <SocketContext.Provider value={{ socket }}>
      {children}
    </SocketContext.Provider>
  );
};
