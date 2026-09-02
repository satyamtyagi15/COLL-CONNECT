import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [interestedIn, setInterestedIn] = React.useState('Any');

  return (
    <div className="dashboard-container">
      <div className="dashboard-content">
        <div className="dashboard-left">
          <h1 className="welcome-text">
            Welcome back,<br />
            {user?.username || 'user'}
          </h1>
          <p className="welcome-subtext">
            Connect with random people online completely anonymously.<br />
            Experience a fast, secure, and vibrant video chat environment.
          </p>
        </div>
        
        <div className="dashboard-right">
          <div className="chat-prefs-card">
            <h2 className="prefs-title">Chat Preferences</h2>
            
            <div className="prefs-form">
              <div className="prefs-group">
                <label>Interested in:</label>
                <div className="select-wrapper">
                  <select value={interestedIn} onChange={(e) => setInterestedIn(e.target.value)}>
                    <option value="Any">Any Gender</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </div>
              </div>
              
              <button 
                className="start-chat-btn"
                onClick={() => navigate('/chat', { state: { interestedIn } })}
              >
                START VIDEO CHAT
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
