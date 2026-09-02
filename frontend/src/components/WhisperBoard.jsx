import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useSocket } from '../contexts/SocketContext';
import { Search, Send, Lock, Trash2, User as UserIcon, Eye, EyeOff } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

const WhisperBoard = () => {
  const { user } = useAuth();
  const { showToast, showConfirm } = useToast();
  const { socket } = useSocket();
  const navigate = useNavigate();
  
  const [whispers, setWhispers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  
  const [showPostModal, setShowPostModal] = useState(false);
  const [targetUser, setTargetUser] = useState('');
  const [content, setContent] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [revealedWhispers, setRevealedWhispers] = useState({});

  const toggleReveal = (id) => {
    if (user?.role === 'superadmin' || user?.isPremium) {
      setRevealedWhispers(prev => ({ ...prev, [id]: !prev[id] }));
    } else {
      showToast('Unlock Premium to reveal your Secret Admirers! 🌟 (Coming Soon)');
    }
  };

  const fetchWhispers = async (query = '') => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${backendUrl}/api/whispers?search=${encodeURIComponent(query)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setWhispers(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchWhispers(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    if (socket) {
      const handleNewWhisper = () => {
        fetchWhispers(searchQuery);
      };
      socket.on('new-whisper', handleNewWhisper);
      return () => socket.off('new-whisper', handleNewWhisper);
    }
  }, [socket, searchQuery]);

  const handlePostWhisper = async (e) => {
    e.preventDefault();
    if (!targetUser.trim() || !content.trim()) return;
    
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${backendUrl}/api/whispers`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ targetUser, content, isAnonymous })
      });
      
      const data = await res.json();
      if (res.ok) {
        showToast('Whisper posted successfully!');
        setShowPostModal(false);
        setTargetUser('');
        setContent('');
        setIsAnonymous(false);
        fetchWhispers(searchQuery);
      } else {
        showToast(data.error || 'Failed to post whisper');
      }
    } catch (err) {
      showToast('Error posting whisper');
    }
  };

  const handleDeleteWhisper = (id) => {
    showConfirm("Are you sure you want to forcibly delete this whisper?", async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${backendUrl}/api/whispers/${id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          showToast('Whisper deleted successfully');
          fetchWhispers(searchQuery);
        } else {
          showToast('Failed to delete whisper');
        }
      } catch (err) {
        showToast('Error deleting whisper');
      }
    });
  };

  return (
    <div className="whisper-board-container" style={{ background: 'linear-gradient(to bottom, #020617, #0f172a, #1e1b4b)', width: '100%', height: 'calc(100vh - 60px)', overflow: 'hidden', position: 'relative' }}>
      {/* Live Moonlit Stars Background (Pure CSS) */}
      <div className="stars-bg"></div>
      <div className="css-moon"></div>
      <div className="css-forest"></div>
      
      <div className="whisper-board-content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', maxWidth: '800px', margin: '0 auto', padding: '10px 20px', height: '100%', overflowY: 'hidden', position: 'relative', zIndex: 2 }}>
        <div className="whisper-header">
          <h1 className="whisper-title">Whisper Board 🤫</h1>
          <p className="whisper-subtitle">Anonymously drop a compliment or confess your thoughts about someone.</p>
          
          <div className="whisper-controls">
            <div className="whisper-search-box">
              <Search size={18} color="#9ca3af" />
              <input 
                type="text" 
                placeholder="Search by username to see who whispered about them..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <button className="post-whisper-btn" onClick={() => setShowPostModal(true)}>
              <Send size={16} /> Drop a Whisper
            </button>
          </div>
        </div>

        {/* Instagram Reels Style Container */}
        <div style={{ position: 'relative', width: '100%', maxWidth: '450px', marginTop: '40px', marginBottom: '20px', flex: 1, maxHeight: '65vh', display: 'flex', flexDirection: 'column' }}>
          {/* 3D Glowing SVG Cat */}
          <svg viewBox="0 0 24 24" width="70" height="70" stroke="#c084fc" strokeWidth="1.2" fill="rgba(30, 41, 59, 0.9)" strokeLinecap="round" strokeLinejoin="round" className="live-cat" style={{ position: 'absolute', top: '-55px', left: '50%', transform: 'translateX(-50%)', zIndex: 10, animation: 'floatCat 4s ease-in-out infinite', filter: 'drop-shadow(0 0 15px rgba(192, 132, 252, 0.8))' }}>
            <path d="M12 5c.67 0 1.35.09 2 .26 1.78-2 5.03-2.84 6.42-2.26 1.4.58-.42 7-.42 7 .57 1.07 1 2.24 1 3.44C21 17.9 16.97 21 12 21s-9-3.1-9-7.56c0-1.25.5-2.4 1-3.44 0 0-1.89-6.42-.5-7 1.39-.58 4.72.23 6.5 2.23A9.04 9.04 0 0 1 12 5Z" />
            <path d="M8 14v.5" />
            <path d="M16 14v.5" />
            <path d="M11.25 16.25h1.5L12 17l-.75-.75Z" />
          </svg>
          
          <div className="reels-container" style={{ flex: 1, width: '100%', overflowY: 'scroll', scrollSnapType: 'y mandatory', borderRadius: '24px', perspective: '1000px', boxShadow: '0 0 40px rgba(0,0,0,0.6)', background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.05)' }}>
            {isLoading ? (
              <p style={{ textAlign: 'center', width: '100%', color: '#9ca3af', marginTop: '50px' }}>Loading whispers...</p>
            ) : whispers.length === 0 ? (
              <div className="empty-whisper" style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <p>No whispers found. Be the first to drop one!</p>
              </div>
            ) : (
              whispers.map(w => (
                <div key={w._id} className="whisper-reel-card" style={{ height: '100%', width: '100%', scrollSnapAlign: 'start', display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box' }}>
                  <div className="whisper-card magical-glow-card" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', transformStyle: 'preserve-3d', transition: 'all 0.4s ease', margin: '0', background: 'transparent', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '24px', padding: '20px', zIndex: 1 }}>
                <div className="whisper-card-header" style={{ flexShrink: 0, marginBottom: '10px' }}>
                  <div className="author-info" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="author-name">
                      {w.isAnonymous ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {(user?.role === 'superadmin' || user?.isPremium) ? (
                            <>
                              <span style={(!revealedWhispers[w._id]) ? {
                                background: 'linear-gradient(to right, #fbbf24, #f59e0b)',
                                WebkitBackgroundClip: 'text',
                                WebkitTextFillColor: 'transparent',
                                fontWeight: '700',
                                fontStyle: 'italic',
                                filter: 'drop-shadow(0 0 8px rgba(245, 158, 11, 0.4))',
                                letterSpacing: '0.5px'
                              } : {}}>
                                {revealedWhispers[w._id] ? w.realAuthor : w.authorDisplay}
                              </span>
                              <button onClick={() => toggleReveal(w._id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', color: '#fbbf24', filter: 'drop-shadow(0 0 6px rgba(251, 191, 36, 0.6))' }} title="Reveal Secret Admirer">
                                {revealedWhispers[w._id] ? <EyeOff size={16} /> : <Eye size={16} />}
                              </button>
                            </>
                          ) : (
                            <>
                              <span style={{
                                background: 'linear-gradient(to right, #fbbf24, #f59e0b)',
                                WebkitBackgroundClip: 'text',
                                WebkitTextFillColor: 'transparent',
                                fontWeight: '700',
                                fontStyle: 'italic',
                                filter: 'drop-shadow(0 0 8px rgba(245, 158, 11, 0.4))',
                                letterSpacing: '0.5px'
                              }}>
                                {w.authorDisplay}
                              </span>
                              <button onClick={() => toggleReveal(w._id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', color: '#fbbf24', filter: 'drop-shadow(0 0 8px rgba(251, 191, 36, 0.8))' }} title="Purchase Premium to reveal!">
                                <Lock size={16} />
                              </button>
                            </>
                          )}
                        </div>
                      ) : (
                        w.authorDisplay
                      )}
                    </span>
                    <span className="whisper-time">{new Date(w.timestamp).toLocaleDateString()}</span>
                  </div>
                  {user?.role === 'superadmin' && (
                    <button className="delete-whisper-btn" onClick={() => handleDeleteWhisper(w._id)} title="Forcibly delete this post">
                      <Trash2 size={16} color="#ef4444" />
                    </button>
                  )}
                </div>
                
                <div className="whisper-message hide-scrollbar" style={{ flex: '1 1 auto', minHeight: '80px', wordWrap: 'break-word', wordBreak: 'break-all', overflowWrap: 'anywhere', whiteSpace: 'pre-wrap', overflowY: 'scroll', fontSize: '1.1rem', lineHeight: '1.6', padding: '10px 15px', background: 'rgba(0,0,0,0.2)', borderRadius: '12px' }}>
                    "{w.content}"
                  </div>

                {w.targetUserDetails && (
                  <>
                  <div style={{ height: '15px', flexShrink: 0 }}></div>
                  <div className="tagged-user-card" onClick={() => navigate('/messages', { state: { openChatWith: w.targetUserDetails.username } })} style={{ flex: '0 0 160px', display: 'flex', flexDirection: 'column', background: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(12px)', border: '1px solid rgba(139, 92, 246, 0.25)', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
                    <div className="tagged-banner" style={{ 
                      backgroundImage: w.targetUserDetails.bannerImage ? `linear-gradient(to bottom, rgba(15, 23, 42, 0) 30%, rgba(15, 23, 42, 0.95) 100%), url(${w.targetUserDetails.bannerImage})` : `linear-gradient(to bottom, rgba(15, 23, 42, 0) 30%, rgba(15, 23, 42, 0.95) 100%), linear-gradient(to right, #4338ca, #3b82f6)`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      flex: '0 0 70px' 
                    }}></div>
                    <div className="tagged-info" style={{ flex: '1', marginTop: '-35px', padding: '0 15px', position: 'relative', zIndex: 2 }}>
                      <div className="tagged-avatar" style={{ border: '3px solid rgba(15, 23, 42, 0.95)', boxShadow: '0 4px 10px rgba(0,0,0,0.3)', width: '50px', height: '50px', borderRadius: '50%' }}>
                        {w.targetUserDetails.profilePic ? (
                          <img src={w.targetUserDetails.profilePic} alt="Profile" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                        ) : (
                          w.targetUserDetails.username.charAt(0).toUpperCase()
                        )}
                      </div>
                      <div className="tagged-details">
                        <h4>{w.targetUserDetails.username}</h4>
                        <span className={`badge badge-${w.targetUserDetails.role || 'user'}`}>{(w.targetUserDetails.role || 'USER').toUpperCase()}</span>
                      </div>
                    </div>
                  </div>
                  <div style={{ flex: '0 0 40px', display: 'flex', justifyContent: 'center', alignItems: 'flex-end', paddingTop: '10px' }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 0 4px rgba(255,255,255,0.2))', animation: 'floatCat 1.5s ease-in-out infinite' }}>
                      <path d="M18 15l-6-6-6 6"/>
                    </svg>
                  </div>
                  </>
                )}


                  </div>
                </div>
              ))
            )}
          </div>
          
          <div className="scroll-notice" style={{ textAlign: 'center', color: '#a78bfa', marginTop: '15px', fontSize: '0.9rem', fontStyle: 'italic', animation: 'pulseText 2s infinite' }}>
            Swipe up to read more whispers ✨
          </div>
        </div>
      </div>

      {showPostModal && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="modal-content" style={{ background: '#1e293b', border: '1px solid #334155' }}>
            <h3 style={{ marginBottom: '15px', color: '#fff' }}>Drop a Whisper</h3>
            <form onSubmit={handlePostWhisper} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', color: '#9ca3af', fontSize: '0.9rem' }}>Tag Username:</label>
                <input 
                  type="text" 
                  value={targetUser}
                  onChange={(e) => setTargetUser(e.target.value)}
                  placeholder="Enter exact username"
                  required
                  style={{ width: '100%', padding: '10px', borderRadius: '6px', background: '#0f172a', border: '1px solid #334155', color: '#fff' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', color: '#9ca3af', fontSize: '0.9rem' }}>Message:</label>
                <textarea 
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Type your compliment or confession..."
                  required
                  rows="4"
                  style={{ width: '100%', padding: '10px', borderRadius: '6px', background: '#0f172a', border: '1px solid #334155', color: '#fff', resize: 'vertical' }}
                ></textarea>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input 
                  type="checkbox" 
                  id="anon-check"
                  checked={isAnonymous}
                  onChange={(e) => setIsAnonymous(e.target.checked)}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
                <label htmlFor="anon-check" style={{ color: '#e2e8f0', cursor: 'pointer' }}>Post Anonymously</label>
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button type="button" onClick={() => setShowPostModal(false)} style={{ flex: 1, padding: '10px', background: '#334155', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Cancel</button>
                <button type="submit" style={{ flex: 1, padding: '10px', background: 'linear-gradient(135deg, #8b5cf6, #ec4899)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Drop It 🚀</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default WhisperBoard;
