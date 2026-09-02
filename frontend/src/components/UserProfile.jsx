import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useSocket } from '../contexts/SocketContext';
import { User as UserIcon, Eye, Trash2, MessageCircle, Clock, UserPlus, Check, X, UserMinus, Lock } from 'lucide-react';
import { FaInstagram as Instagram, FaFacebook as Facebook, FaLinkedin as Linkedin, FaSnapchat as Snapchat } from 'react-icons/fa';
import ImageModal from './ImageModal';
import '../index.css';

const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

const UserProfile = () => {
  const { username } = useParams();
  const navigate = useNavigate();
  const { user: authUser } = useAuth();
  const { showToast, showConfirm } = useToast();
  const { socket } = useSocket();
  const [profileData, setProfileData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('profile');
  const [imageModalSrc, setImageModalSrc] = useState(null);
  const [popupMenu, setPopupMenu] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    fetchProfile();
    setActiveTab('profile');
    setPopupMenu(null);
  }, [username]);

  useEffect(() => {
    if (!socket) return;
    const handleProfileUpdated = (data) => {
      if (data.username?.toLowerCase() === username?.toLowerCase()) {
        fetchProfile(); // Refetch to get the latest socials/images/etc
      }
    };
    const handleRoleChanged = (data) => {
      if (data.username?.toLowerCase() === username?.toLowerCase()) {
        fetchProfile(); // Refetch to get the updated role instantly
      }
    };

    socket.on('profile-updated', handleProfileUpdated);
    socket.on('user-role-changed', handleRoleChanged);
    socket.on('user-promoted', handleRoleChanged);
    socket.on('user-demoted', handleRoleChanged);
    
    return () => {
      socket.off('profile-updated', handleProfileUpdated);
      socket.off('user-role-changed', handleRoleChanged);
      socket.off('user-promoted', handleRoleChanged);
      socket.off('user-demoted', handleRoleChanged);
    };
  }, [socket, username]);

  const fetchProfile = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${backendUrl}/api/users/${username}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setProfileData(data);
      } else {
        setProfileData(null);
      }
    } catch (err) {
      console.error(err);
      setProfileData(null);
    } finally {
      setLoading(false);
    }
  };

  const sendFriendRequest = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${backendUrl}/api/friend-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ targetUsername: username })
      });
      if (res.ok) {
        showToast(`Friend request sent to ${username}`);
        fetchProfile();
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to send request');
      }
    } catch (err) {
      showToast('Server error');
    }
  };

  const respondToRequest = async (action) => {
    try {
      const token = localStorage.getItem('token');
      const endpoint = action === 'accept' ? '/api/friend-accept' : '/api/friend-decline';
      const res = await fetch(`${backendUrl}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ targetUsername: username })
      });
      if (res.ok) {
        showToast(`Request ${action}ed`);
        fetchProfile();
      } else {
        showToast(`Failed to ${action} request`);
      }
    } catch (err) {
      showToast('Server error');
    }
  };

  const unfriend = async () => {
    showConfirm(`Are you sure you want to unfriend ${username}? This will also delete your chat history.`, async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${backendUrl}/api/unfriend`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ targetUsername: username })
        });
        if (res.ok) {
          showToast(`Unfriended ${username}`);
          fetchProfile();
        } else {
          showToast(`Failed to unfriend`);
        }
      } catch (err) {
        showToast('Server error');
      }
    });
  };

  const getOriginalImageUrl = (url) => {
    if (!url || !url.includes('cloudinary.com')) return url;
    const uploadIndex = url.indexOf('/upload/');
    if (uploadIndex === -1) return url;
    const afterUpload = url.substring(uploadIndex + 8);
    if (afterUpload.startsWith('v')) return url; 
    
    const nextSlash = afterUpload.indexOf('/');
    return url.substring(0, uploadIndex + 8) + afterUpload.substring(nextSlash + 1);
  };

  const handleForceRemoveImage = async (target) => {
    setIsProcessing(true);
    setPopupMenu(null);
    try {
      const token = localStorage.getItem('token');
      const endpoint = target === 'profile' ? `/api/admin/users/${username}/profile-pic` : `/api/admin/users/${username}/banner`;
      const res = await fetch(`${backendUrl}${endpoint}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        showToast(`${target === 'profile' ? 'Profile picture' : 'Background banner'} forcefully removed.`);
        fetchProfile();
      } else {
        showToast('Failed to remove image.');
      }
    } catch (err) {
      console.error('Failed to remove image', err);
      showToast('Failed to remove image.');
    } finally {
      setIsProcessing(false);
    }
  };

  if (loading) {
    return <div className="loading-container">Loading Profile...</div>;
  }

  if (!profileData) {
    return <div className="loading-container">User not found.</div>;
  }

  const isSuperadmin = authUser?.role === 'superadmin';

  // Removed old getBadgeStyle

  const isLocked = profileData.isPrivate && profileData.socials === null;

  return (
    <div className="my-profile-container">
      <div className="profile-header" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h1 style={{ margin: 0 }}>{profileData.username}'s Profile</h1>
          <span className={`badge badge-${profileData.role || 'user'}`}>
            {(profileData.role || 'USER').toUpperCase()}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          {profileData.username !== authUser?.username && (
            (() => {
              const isSuperadminViewer = authUser?.role === 'superadmin';
              const isTargetSuperadmin = profileData.role === 'superadmin';
              const isAdminViewer = authUser?.role === 'admin';
              
              if (isSuperadminViewer || isTargetSuperadmin) {
                return (
                  <button className="btn-action" style={{display: 'flex', alignItems: 'center', gap: '8px', background: '#10b981', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer'}} onClick={() => navigate('/messages', { state: { openChatWith: profileData.username } })}>
                    <MessageCircle size={18} /> Message
                  </button>
                );
              }

              const canMessage = profileData.isFriend || isAdminViewer;

              return (
                <>
                  {profileData.isFriend ? (
                    <button className="btn-action" style={{display: 'flex', alignItems: 'center', gap: '8px', background: '#374151', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer'}} onClick={unfriend}>
                      <UserMinus size={18} /> Unfriend
                    </button>
                  ) : profileData.hasSentRequest ? (
                    <button disabled className="btn-action" style={{display: 'flex', alignItems: 'center', gap: '8px', background: '#374151', color: '#9ca3af', border: 'none', padding: '8px 16px', borderRadius: '8px'}}>
                      <Clock size={18} /> Request Pending
                    </button>
                  ) : profileData.hasReceivedRequest ? (
                    <>
                      <button className="btn-action" style={{display: 'flex', alignItems: 'center', gap: '8px', background: '#10b981', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer'}} onClick={() => respondToRequest('accept')}>
                        <Check size={18} /> Accept Request
                      </button>
                      <button className="btn-action" style={{display: 'flex', alignItems: 'center', gap: '8px', background: '#ef4444', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer'}} onClick={() => respondToRequest('decline')}>
                        <X size={18} /> Decline
                      </button>
                    </>
                  ) : (
                    <button className="btn-action" style={{display: 'flex', alignItems: 'center', gap: '8px', background: '#3b82f6', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer'}} onClick={sendFriendRequest}>
                      <UserPlus size={18} /> Add Friend
                    </button>
                  )}
                  {canMessage && (
                    <button className="btn-action" style={{display: 'flex', alignItems: 'center', gap: '8px', background: '#10b981', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', marginLeft: '10px'}} onClick={() => navigate('/messages', { state: { openChatWith: profileData.username } })}>
                      <MessageCircle size={18} /> Message
                    </button>
                  )}
                </>
              );
            })()
          )}
        </div>
      </div>
      <div className="profile-tabs">
        <button className={`tab-btn ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => setActiveTab('profile')}>Profile</button>
        {!isLocked && (
          <button className={`tab-btn ${activeTab === 'friends' ? 'active' : ''}`} onClick={() => setActiveTab('friends')}>Friends ({profileData.friends?.length || 0})</button>
        )}
      </div>

      {activeTab === 'profile' ? (
        <div className="profile-content" onClick={() => setPopupMenu(null)} style={{display: 'flex', justifyContent: 'center', padding: '20px 0'}}>
          <div className="profile-card avatar-card" style={{padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', width: '100%', maxWidth: '400px'}}>
            <div className="banner-area" 
              onClick={(e) => { e.stopPropagation(); setPopupMenu('banner'); }}
              style={{ 
                height: '120px', 
                width: '100%', 
                backgroundColor: '#374151',
                backgroundImage: profileData.bannerImage ? `url(${profileData.bannerImage})` : 'linear-gradient(135deg, #374151 0%, #1f2937 100%)',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                position: 'relative',
                cursor: 'pointer'
              }}>
              {popupMenu === 'banner' && (
                <div className="image-popup-menu" style={{position: 'absolute', top: '40px', right: '10px', background: '#1f2937', border: '1px solid #374151', borderRadius: '8px', padding: '5px', zIndex: 20, boxShadow: '0 4px 6px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', minWidth: '140px'}}>
                  {profileData.bannerImage && (
                    <button onClick={(e) => { e.stopPropagation(); setImageModalSrc(getOriginalImageUrl(profileData.bannerImage)); setPopupMenu(null); }} className="popup-menu-btn"><Eye size={16}/> View Banner</button>
                  )}
                  {isSuperadmin && profileData.bannerImage && (
                    <button onClick={(e) => { 
                      e.stopPropagation(); 
                      showConfirm(`SUPERADMIN ACTION: Are you sure you want to FORCE REMOVE this user's banner? This cannot be undone.`, () => handleForceRemoveImage('banner'));
                    }} className="popup-menu-btn text-red"><Trash2 size={16}/> Remove Banner</button>
                  )}
                  {(!profileData.bannerImage && !isSuperadmin) && <span style={{padding: '5px', color: '#9ca3af', fontSize: '12px'}}>No banner</span>}
                </div>
              )}
            </div>

            <div className="avatar-wrapper" style={{ marginTop: '-50px', position: 'relative', alignSelf: 'center', marginInline: 'auto' }} onClick={(e) => { e.stopPropagation(); setPopupMenu('profile'); }}>
              {profileData.profilePic ? (
                <img src={profileData.profilePic} alt="Profile" className="profile-large-avatar" style={{backgroundColor: '#1f2937', cursor: 'pointer', boxShadow: '0 4px 10px rgba(0,0,0,0.3)'}} />
              ) : (
                <div className="profile-large-avatar" style={{backgroundColor: '#1f2937', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 10px rgba(0,0,0,0.3)'}}>
                  <UserIcon size={80} color="#9ca3af" />
                </div>
              )}
              
              {popupMenu === 'profile' && (
                <div className="image-popup-menu" style={{position: 'absolute', top: '50px', left: '50%', transform: 'translateX(-50%)', background: '#1f2937', border: '1px solid #374151', borderRadius: '8px', padding: '5px', zIndex: 20, boxShadow: '0 4px 6px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', minWidth: '150px'}}>
                  {profileData.profilePic && (
                    <button onClick={(e) => { e.stopPropagation(); setImageModalSrc(getOriginalImageUrl(profileData.profilePic)); setPopupMenu(null); }} className="popup-menu-btn"><Eye size={16}/> View Picture</button>
                  )}
                  {isSuperadmin && profileData.profilePic && (
                    <button onClick={(e) => { 
                      e.stopPropagation(); 
                      showConfirm(`SUPERADMIN ACTION: Are you sure you want to FORCE REMOVE this user's profile picture? This cannot be undone.`, () => handleForceRemoveImage('profile'));
                    }} className="popup-menu-btn text-red"><Trash2 size={16}/> Remove Picture</button>
                  )}
                  {(!profileData.profilePic && !isSuperadmin) && <span style={{padding: '5px', color: '#9ca3af', fontSize: '12px'}}>No picture</span>}
                </div>
              )}
            </div>
            
            <div style={{ padding: '0 20px 20px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', flex: 1, width: '100%', boxSizing: 'border-box' }}>
              <h2 style={{ margin: '10px 0 5px 0', fontSize: '1.5rem', color: '#f3f4f6', fontWeight: '700', letterSpacing: '0.5px' }}>{profileData.username}</h2>
              
              <div style={{display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', justifyContent: 'center'}}>
                <span className={`badge badge-${profileData.role || 'user'}`} style={{boxShadow: '0 2px 10px rgba(0,0,0,0.2)'}}>
                  {(profileData.role || 'USER').toUpperCase()}
                </span>
                {profileData.gender && profileData.gender !== 'Not Specified' && (
                  <span style={{fontSize: '0.85rem', color: '#e5e7eb', background: 'rgba(55, 65, 81, 0.5)', border: '1px solid #4b5563', padding: '4px 12px', borderRadius: '16px'}}>
                    {profileData.gender}
                  </span>
                )}
              </div>

              {/* Social Links Preview */}
              <div style={{width: '100%', marginBottom: '20px'}}>
                {isLocked ? (
                  <div style={{background: 'rgba(17, 24, 39, 0.5)', padding: '15px', borderRadius: '12px', border: '1px dashed #4b5563'}}>
                    <Lock size={20} color="#6b7280" style={{marginBottom: '5px'}}/>
                    <div style={{fontSize: '0.85rem', color: '#9ca3af'}}>Socials hidden (Private)</div>
                  </div>
                ) : (
                  <div className="socials-list" style={{display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center'}}>
                    {(() => {
                      const getSocialUrl = (platform, value) => {
                        if (!value) return null;
                        const v = value.trim();
                        if (v.startsWith('http://') || v.startsWith('https://')) return v;
                        switch (platform) {
                          case 'instagram': return `https://instagram.com/${v.replace(/^@/, '')}`;
                          case 'facebook': return `https://facebook.com/${v}`;
                          case 'linkedin': return v.includes('linkedin.com') ? `https://${v}` : `https://linkedin.com/in/${v}`;
                          case 'snapchat': return `https://snapchat.com/add/${v.replace(/^@/, '')}`;
                          default: return null;
                        }
                      };
                      const s = profileData.socials || {};
                      const platforms = [
                        { key: 'instagram', icon: <Instagram size={18} />, color: '#E1306C', hoverBg: 'rgba(225,48,108,0.15)' },
                        { key: 'facebook', icon: <Facebook size={18} />, color: '#1877F2', hoverBg: 'rgba(24,119,242,0.15)' },
                        { key: 'linkedin', icon: <Linkedin size={18} />, color: '#0A66C2', hoverBg: 'rgba(10,102,194,0.15)' },
                        { key: 'snapchat', icon: <span style={{fontSize: '16px'}}>👻</span>, color: '#FFFC00', hoverBg: 'rgba(255,252,0,0.15)' },
                      ];
                      const hasAny = platforms.some(p => s[p.key]);
                      if (!hasAny) return <div style={{fontSize: '0.85rem', color: '#6b7280', padding: '10px'}}>No social links added</div>;
                      return platforms.map(p => {
                        const url = getSocialUrl(p.key, s[p.key]);
                        if (!url) return null;
                        return (
                          <a key={p.key} href={url} target="_blank" rel="noopener noreferrer" title={p.key.charAt(0).toUpperCase() + p.key.slice(1)}
                            style={{
                              width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: p.color,
                              transition: 'all 0.2s ease', cursor: 'pointer', textDecoration: 'none'
                            }}
                          >
                            {p.icon}
                          </a>
                        );
                      });
                    })()}
                  </div>
                )}
              </div>

              {/* Spotify Preview */}
              {profileData.spotifyUrl && profileData.spotifyUrl.includes('open.spotify.com/track/') && (
                <div style={{ width: '100%', borderRadius: '12px', overflow: 'hidden', marginTop: '15px', boxShadow: '0 4px 15px rgba(30, 215, 96, 0.15)' }}>
                  <iframe 
                    src={profileData.spotifyUrl.replace('/track/', '/embed/track/')} 
                    width="100%" 
                    height="80" 
                    frameBorder="0" 
                    allowFullScreen="" 
                    allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" 
                    loading="lazy"
                    style={{display: 'block'}}
                  ></iframe>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="friends-section" style={{marginTop: '20px'}}>
          <h3>{profileData.username}'s Friends ({profileData.friends?.length || 0})</h3>
          <div className="friends-grid">
            {profileData.friends?.length > 0 ? (
              profileData.friends.map(f => (
                <div key={f.username} className="friend-card" style={{cursor: 'pointer'}} onClick={() => navigate(`/user/${f.username}`)}>
                  {f.profilePic ? (
                    <img src={f.profilePic} alt={f.username} className="friend-avatar" />
                  ) : (
                    <div className="friend-avatar" style={{backgroundColor: '#374151', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                      <UserIcon size={24} color="#9ca3af" />
                    </div>
                  )}
                  <div className="friend-info">
                    <h4>{f.username}</h4>
                    <span className={`badge badge-${f.role || 'user'}`} style={{fontSize: '10px', padding: '2px 6px', marginTop: '4px'}}>
                      {(f.role || 'USER').toUpperCase()}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-muted">This user has no friends yet.</p>
            )}
          </div>
        </div>
      )}
      
      {isProcessing && (
        <div className="modal-overlay" style={{zIndex: 99999}}>
          <div className="modal-content" style={{padding: '20px', textAlign: 'center'}}>
            <h3>Processing...</h3>
            <p className="text-muted">Please wait.</p>
          </div>
        </div>
      )}

      <ImageModal 
        isOpen={!!imageModalSrc}
        onClose={() => setImageModalSrc(null)}
        imageUrl={imageModalSrc}
      />
    </div>
  );
};

export default UserProfile;
