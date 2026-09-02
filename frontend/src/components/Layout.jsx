import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Topbar from './Topbar';
import Sidebar from './Sidebar';
import { Menu } from 'lucide-react';
import { useSocket } from '../contexts/SocketContext';
import { useAuth } from '../contexts/AuthContext';

const Layout = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { socket } = useSocket();
  const { user, login, updateGlobalProfile } = useAuth();

  useEffect(() => {
    if (!socket || !user) return;

    const handleRoleChanged = (data) => {
      if (data.username === user.username) {
        const newRole = data.newRole || data.role;
        const updatedUser = { ...user, role: newRole };
        login(localStorage.getItem('token'), updatedUser);
        if (updateGlobalProfile) {
          updateGlobalProfile({ role: newRole });
        }
      }
    };

    socket.on('user-promoted', handleRoleChanged);
    socket.on('user-demoted', handleRoleChanged);
    socket.on('user-role-changed', handleRoleChanged);

    return () => {
      socket.off('user-promoted', handleRoleChanged);
      socket.off('user-demoted', handleRoleChanged);
      socket.off('user-role-changed', handleRoleChanged);
    };
  }, [socket, user, login, updateGlobalProfile]);

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  return (
    <div className="app-layout">
      <Sidebar isOpen={isSidebarOpen} toggleSidebar={toggleSidebar} />
      
      <div className="main-wrapper">
        <Topbar toggleSidebar={toggleSidebar} />
        
        <main className="main-content-area">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;
