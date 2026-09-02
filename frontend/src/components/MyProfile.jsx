import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { useToast } from '../contexts/ToastContext';
import { Camera, Edit2, Save, X, User as UserIcon, Link as LinkIcon, Image as ImageIcon, Eye, Trash2, Upload, Lock, Unlock } from 'lucide-react';
import { FaInstagram as Instagram, FaFacebook as Facebook, FaLinkedin as Linkedin, FaSnapchat as Snapchat } from 'react-icons/fa';
import ImageCropperModal from './ImageCropperModal';
import ImageModal from './ImageModal';
import '../index.css';

const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

const MyProfile = () => {
  const navigate = useNavigate();
  const { user: authUser, login, updateGlobalProfile, logout } = useAuth();
  const { socket } = useSocket();
  const { showToast, showConfirm } = useToast();
  const [profileData, setProfileData] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Edit States
  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  
  const [isEditingSpotify, setIsEditingSpotify] = useState(false);
  const [spotifyUrl, setSpotifyUrl] = useState('');
  
  const [isEditingGender, setIsEditingGender] = useState(false);
  const [gender, setGender] = useState('');

  const [isEditingSocials, setIsEditingSocials] = useState(false);
  const [socials, setSocials] = useState({ instagram: '', facebook: '', linkedin: '', snapchat: '' });

  const [activeTab, setActiveTab] = useState('profile'); // 'profile' or 'friends'

  // Image Cropper States
  const [cropperOpen, setCropperOpen] = useState(false);
  const [cropperSrc, setCropperSrc] = useState('');
  const [cropperFile, setCropperFile] = useState(null);
  const [cropperAspect, setCropperAspect] = useState(1); // 1 for profile, 16/9 for banner
  const [cropperTarget, setCropperTarget] = useState(''); // 'profile' or 'banner'
  const [isUploading, setIsUploading] = useState(false);

  // Popup & View States
  const [popupMenu, setPopupMenu] = useState(null); // 'profile' or 'banner'
  const [imageModalSrc, setImageModalSrc] = useState(null);

  useEffect(() => {
    fetchProfile();
    
    const handleRefresh = () => fetchProfile();
    window.addEventListener('profile-refresh-required', handleRefresh);
    return () => window.removeEventListener('profile-refresh-required', handleRefresh);
  }, []);

  useEffect(() => {
    if (!socket || !authUser) return;
    const handleProfileUpdated = (data) => {
      if (data.username?.toLowerCase() === authUser.username?.toLowerCase()) {
        fetchProfile();
      }
    };
    socket.on('profile-updated', handleProfileUpdated);
    socket.on('user-role-changed', handleProfileUpdated);
    socket.on('user-promoted', handleProfileUpdated);
    socket.on('user-demoted', handleProfileUpdated);
    
    return () => {
      socket.off('profile-updated', handleProfileUpdated);
      socket.off('user-role-changed', handleProfileUpdated);
      socket.off('user-promoted', handleProfileUpdated);
      socket.off('user-demoted', handleProfileUpdated);
    };
  }, [socket, authUser]);

  const fetchProfile = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${backendUrl}/api/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setProfileData(data);
        setNewUsername(data.username);
        setSpotifyUrl(data.spotifyUrl || '');
        setGender(data.gender || 'Not Specified');
        setSocials(data.socials || { instagram: '', facebook: '', linkedin: '', snapchat: '' });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleImageChange = (e, target) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) return showToast('Image must be less than 5MB');
      setCropperFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setCropperSrc(reader.result);
        setCropperTarget(target);
        setCropperAspect(target === 'profile' ? 1 : 16 / 9);
        setCropperOpen(true);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCropComplete = async (cropParams) => {
    setCropperOpen(false);
    if (!cropParams || !cropperFile) return;
    setIsUploading(true);
    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('file', cropperFile);

      const uploadRes = await fetch(`${backendUrl}/api/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      
      if (!uploadRes.ok) throw new Error('Cloudinary upload failed');
      const uploadData = await uploadRes.json();
      const originalUrl = uploadData.url;
      
      // Inject Cloudinary Transformation
      const parts = originalUrl.split('/upload/');
      let finalUrl = originalUrl;
      if (parts.length === 2) {
        const w = Math.round(cropParams.width);
        const h = Math.round(cropParams.height);
        const x = Math.round(cropParams.x);
        const y = Math.round(cropParams.y);
        finalUrl = `${parts[0]}/upload/c_crop,w_${w},h_${h},x_${x},y_${y}/${parts[1]}`;
      }
      
      const endpoint = cropperTarget === 'profile' ? '/api/profile-pic' : '/api/profile-banner';
      const payload = cropperTarget === 'profile' 
        ? { profilePic: finalUrl } 
        : { bannerImage: finalUrl };

      const saveRes = await fetch(`${backendUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (saveRes.ok) {
        const data = await saveRes.json();
        setProfileData(prev => ({ ...prev, ...data }));
        if (updateGlobalProfile) updateGlobalProfile(data);
        showToast(`${cropperTarget === 'profile' ? 'Profile picture' : 'Background banner'} updated successfully!`);
      }
    } catch (err) {
      console.error(err);
      showToast('Upload failed');
    } finally {
      setIsUploading(false);
      setPopupMenu(null);
    }
  };

  const handleTogglePrivacy = async () => {
    try {
      const token = localStorage.getItem('token');
      const newStatus = !profileData.isPrivate;
      const res = await fetch(`${backendUrl}/api/privacy`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ isPrivate: newStatus })
      });
      if (res.ok) {
        setProfileData(prev => ({ ...prev, isPrivate: newStatus }));
        showToast(newStatus ? 'Profile Locked (Private)' : 'Profile Unlocked (Public)');
      }
    } catch (err) {
      console.error('Failed to update privacy', err);
      showToast('Failed to update privacy setting');
    }
  };

  const requestRemoveImage = (target) => {
    showConfirm(
      `Are you sure you want to remove your ${target === 'profile' ? 'profile picture' : 'background banner'}?`,
      () => handleRemoveImage(target)
    );
    setPopupMenu(null);
  };

  const handleRemoveImage = async (target) => {
    setIsUploading(true);
    setPopupMenu(null);
    try {
      const token = localStorage.getItem('token');
      const endpoint = target === 'profile' ? '/api/profile-pic' : '/api/profile-banner';
      const res = await fetch(`${backendUrl}${endpoint}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setProfileData(prev => ({ ...prev, ...data }));
        if (updateGlobalProfile) updateGlobalProfile(data);
        showToast(`${target === 'profile' ? 'Profile picture' : 'Background banner'} removed successfully.`);
      }
    } catch (err) {
      console.error('Failed to remove image', err);
      showToast('Failed to remove image.');
    } finally {
      setIsUploading(false);
    }
  };

  const getOriginalImageUrl = (url) => {
    if (!url || !url.includes('cloudinary.com')) return url;
    const uploadIndex = url.indexOf('/upload/');
    if (uploadIndex === -1) return url;
    const afterUpload = url.substring(uploadIndex + 8);
    if (afterUpload.startsWith('v')) return url; // No transformations
    
    const nextSlash = afterUpload.indexOf('/');
    return url.substring(0, uploadIndex + 8) + afterUpload.substring(nextSlash + 1);
  };

  const handleSaveUsername = async () => {
    if (newUsername === profileData.username) {
      setIsEditingUsername(false);
      return;
    }
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${backendUrl}/api/profile/change-username`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ newUsername })
      });
      const data = await res.json();
      if (res.ok) {
        showToast('Username changed successfully!');
        setTimeout(() => {
          login(data.token);
          window.location.reload();
        }, 1500);
      } else {
        showToast(data.error || 'Failed to change username');
      }
    } catch (err) {
      console.error(err);
      showToast('An error occurred');
    }
  };

  const handleSaveGender = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${backendUrl}/api/profile/gender`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ gender })
      });
      if (res.ok) {
        setProfileData(prev => ({ ...prev, gender }));
        setIsEditingGender(false);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveSpotify = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${backendUrl}/api/profile/spotify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ spotifyUrl })
      });
      if (res.ok) {
        setProfileData(prev => ({ ...prev, spotifyUrl }));
        setIsEditingSpotify(false);
        showToast('Spotify Vibe updated!');
      } else {
        showToast('Failed to update Spotify Vibe');
      }
    } catch (err) {
      console.error(err);
      showToast('Error updating Spotify Vibe');
    }
  };

  const handleSaveSocials = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${backendUrl}/api/profile/socials`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ socials })
      });
      if (res.ok) {
        setProfileData(prev => ({ ...prev, socials }));
        setIsEditingSocials(false);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRequestDeletion = () => {
    if (profileData.deletionRequested) {
      showToast('Your account deletion request is already under review. Please wait.');
      return;
    }
    showConfirm('Are you sure you want to permanently delete your account? This action cannot be undone and will erase all your chats and data.', async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${backendUrl}/api/request-deletion`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          setProfileData(prev => ({ ...prev, deletionRequested: true }));
          showToast('Account deletion request submitted. Your request is under review. Please wait.');
        } else {
          showToast('Failed to submit deletion request.');
        }
      } catch (err) {
        showToast('Server error during deletion request.');
      }
    });
  };

  if (loading || !profileData) {
    return <div className="loading-container">Loading Profile...</div>;
  }

  return (
    <div className="my-profile-container">
      <div className="profile-header">
        <h1>My Profile</h1>
        <div className="profile-tabs">
          <button className={`tab-btn ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => setActiveTab('profile')}>Settings</button>
          <button className={`tab-btn ${activeTab === 'friends' ? 'active' : ''}`} onClick={() => setActiveTab('friends')}>My Friends</button>
          <button className={`tab-btn ${activeTab === 'visitors' ? 'active' : ''}`} onClick={() => setActiveTab('visitors')}>Profile Visitors</button>
        </div>
      </div>

      {activeTab === 'profile' ? (
        <div className="profile-content grid-layout" onClick={() => setPopupMenu(null)}>
          {/* Avatar Section (Preview Card) */}
          <div className="profile-card avatar-card" style={{padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column'}}>
            <div style={{padding: '12px 15px', background: 'rgba(17, 24, 39, 0.7)', borderBottom: '1px solid #374151', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: '#9ca3af', fontSize: '0.85rem', fontWeight: 'bold', zIndex: 10, backdropFilter: 'blur(4px)'}}>
              <Eye size={16} color="#8b5cf6" /> Live Public Preview
            </div>
            
            {/* Banner Area */}
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
              {!profileData.bannerImage && (
                <div className="banner-edit-btn" style={{position: 'absolute', top: '15px', right: '15px', backgroundColor: '#3b82f6', color: 'white', width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 10, boxShadow: '0 2px 4px rgba(0,0,0,0.2)'}}>
                  <Camera size={18} />
                </div>
              )}
              {popupMenu === 'banner' && (
                <div className="image-popup-menu" style={{position: 'absolute', top: '40px', right: '10px', background: '#1f2937', border: '1px solid #374151', borderRadius: '8px', padding: '5px', zIndex: 20, boxShadow: '0 4px 6px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', minWidth: '140px'}}>
                  {profileData.bannerImage && (
                    <button onClick={(e) => { e.stopPropagation(); setImageModalSrc(getOriginalImageUrl(profileData.bannerImage)); setPopupMenu(null); }} className="popup-menu-btn"><Eye size={16}/> View Banner</button>
                  )}
                  <label className="popup-menu-btn" onClick={(e) => e.stopPropagation()} style={{cursor: 'pointer', margin: 0}}>
                    <Upload size={16}/> Update Banner
                    <input type="file" accept="image/*" style={{display: 'none'}} onChange={(e) => { e.stopPropagation(); handleImageChange(e, 'banner'); }} />
                  </label>
                  {profileData.bannerImage && (
                    <button onClick={(e) => { e.stopPropagation(); requestRemoveImage('banner'); }} className="popup-menu-btn text-red"><Trash2 size={16}/> Remove Banner</button>
                  )}
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
              {!profileData.profilePic && (
                <div className="avatar-edit-btn" style={{cursor: 'pointer', zIndex: 10}}>
                  <Camera size={18} />
                </div>
              )}
              
              {popupMenu === 'profile' && (
                <div className="image-popup-menu" style={{position: 'absolute', top: '50px', left: '50%', transform: 'translateX(-50%)', background: '#1f2937', border: '1px solid #374151', borderRadius: '8px', padding: '5px', zIndex: 20, boxShadow: '0 4px 6px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', minWidth: '150px'}}>
                  {profileData.profilePic && (
                    <button onClick={(e) => { e.stopPropagation(); setImageModalSrc(getOriginalImageUrl(profileData.profilePic)); setPopupMenu(null); }} className="popup-menu-btn"><Eye size={16}/> View Picture</button>
                  )}
                  <label className="popup-menu-btn" onClick={(e) => e.stopPropagation()} style={{cursor: 'pointer', margin: 0}}>
                    <Upload size={16}/> Update Picture
                    <input type="file" accept="image/*" style={{display: 'none'}} onChange={(e) => { e.stopPropagation(); handleImageChange(e, 'profile'); }} />
                  </label>
                  {profileData.profilePic && (
                    <button onClick={(e) => { e.stopPropagation(); requestRemoveImage('profile'); }} className="popup-menu-btn text-red"><Trash2 size={16}/> Remove Picture</button>
                  )}
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
                {profileData.isPrivate ? (
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

          {/* Details Section */}
          <div className="profile-details-grid">
            {/* Account Info */}
            <div className="profile-card info-card">
              <h3>Account Info</h3>
              <div className="form-group" style={{marginTop: '15px'}}>
                <label>Email</label>
                <input type="text" className="profile-input text-muted" value={profileData.email} disabled />
              </div>
              
              <div className="form-group">
                <label>Username</label>
                {isEditingUsername ? (
                  <div className="edit-group">
                    <input type="text" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} className="profile-input" />
                    <button className="btn-save" style={{padding: '10px'}} onClick={handleSaveUsername}>Save</button>
                    <button className="btn-cancel" style={{padding: '10px'}} onClick={() => {setIsEditingUsername(false); setNewUsername(profileData.username);}}>Cancel</button>
                  </div>
                ) : (
                  <div>
                    <button className="btn-action btn-blue" onClick={() => setIsEditingUsername(true)} title="Change Username">Edit Username</button>
                  </div>
                )}
              </div>
              
              <div className="form-group">
                <label>Gender</label>
                {isEditingGender ? (
                  <div className="edit-group">
                    <select value={gender} onChange={(e) => setGender(e.target.value)} className="profile-input">
                      <option value="Not Specified">Not Specified</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                    <button className="btn-save" style={{padding: '10px'}} onClick={handleSaveGender}>Save</button>
                    <button className="btn-cancel" style={{padding: '10px'}} onClick={() => {setIsEditingGender(false); setGender(profileData.gender || 'Not Specified');}}>Cancel</button>
                  </div>
                ) : (
                  <div>
                    <button className="btn-action btn-blue" onClick={() => setIsEditingGender(true)}>Edit Gender</button>
                  </div>
                )}
              </div>
              
              <div className="form-group" style={{marginTop: '15px'}}>
                <label>Spotify Vibe (Track Link)</label>
                {isEditingSpotify ? (
                  <div className="edit-group">
                    <input type="text" value={spotifyUrl} onChange={(e) => setSpotifyUrl(e.target.value)} className="profile-input" placeholder="https://open.spotify.com/track/..." />
                    <button className="btn-save" style={{padding: '10px'}} onClick={handleSaveSpotify}>Save</button>
                    <button className="btn-cancel" style={{padding: '10px'}} onClick={() => {setIsEditingSpotify(false); setSpotifyUrl(profileData.spotifyUrl || '');}}>Cancel</button>
                  </div>
                ) : (
                  <div>
                    <button className="btn-action btn-blue" onClick={() => setIsEditingSpotify(true)}>Edit Spotify Vibe</button>
                  </div>
                )}
              </div>
              
              <div className="form-group" style={{marginTop: '20px', padding: '20px', backgroundColor: profileData.isPrivate ? 'rgba(139, 92, 246, 0.1)' : '#1f2937', borderRadius: '12px', border: `1px solid ${profileData.isPrivate ? '#8b5cf6' : '#374151'}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', transition: 'all 0.3s ease'}}>
                <div style={{display: 'flex', alignItems: 'center', gap: '15px'}}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: profileData.isPrivate ? 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)' : '#374151', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: profileData.isPrivate ? '0 4px 12px rgba(139, 92, 246, 0.4)' : 'none', transition: 'all 0.3s ease' }}>
                    {profileData.isPrivate ? <Lock size={24} color="#fff" /> : <Unlock size={24} color="#9ca3af" />}
                  </div>
                  <div>
                    <h4 style={{margin: '0 0 4px 0', color: profileData.isPrivate ? '#e5e7eb' : '#d1d5db', fontSize: '1.1rem'}}>Profile Visibility</h4>
                    <span style={{fontSize: '0.85rem', color: '#9ca3af'}}>
                      {profileData.isPrivate ? 'Your profile is currently Locked.' : 'Your profile is currently Public.'}
                    </span>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    const fakeEvent = { target: { checked: !profileData.isPrivate } };
                    handleTogglePrivacy(fakeEvent);
                  }}
                  style={{
                    padding: '10px 20px', 
                    borderRadius: '8px', 
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: profileData.isPrivate ? '#374151' : '#8b5cf6',
                    color: '#fff',
                    border: 'none',
                    boxShadow: profileData.isPrivate ? 'none' : '0 4px 12px rgba(139, 92, 246, 0.3)',
                    transition: 'all 0.2s ease'
                  }}
                >
                  {profileData.isPrivate ? 'Unlock Profile' : 'Lock Profile'}
                </button>
              </div>
            </div>

            {/* Social Links */}
            <div className="profile-card info-card">
              <div className="card-header-flex">
                <h3>Social Links</h3>
                {!isEditingSocials && (
                  <button className="btn-action btn-blue" onClick={() => setIsEditingSocials(true)}>Edit Socials</button>
                )}
              </div>
              {isEditingSocials ? (
                <div className="socials-edit-form">
                  <div className="form-group"><label>Instagram</label><input type="text" className="profile-input" value={socials.instagram} onChange={e => setSocials({...socials, instagram: e.target.value})} placeholder="Username or link (e.g. coder.1s)" /></div>
                  <div className="form-group"><label>Facebook</label><input type="text" className="profile-input" value={socials.facebook} onChange={e => setSocials({...socials, facebook: e.target.value})} placeholder="Username or link (e.g. john.doe)" /></div>
                  <div className="form-group"><label>LinkedIn</label><input type="text" className="profile-input" value={socials.linkedin} onChange={e => setSocials({...socials, linkedin: e.target.value})} placeholder="Username or link (e.g. shivam-tyagi)" /></div>
                  <div className="form-group"><label>Snapchat</label><input type="text" className="profile-input" value={socials.snapchat} onChange={e => setSocials({...socials, snapchat: e.target.value})} placeholder="Username (e.g. mysnap)" /></div>
                  <div className="edit-actions mt-2">
                    <button className="btn-save" onClick={handleSaveSocials}>Save Links</button>
                    <button className="btn-cancel" onClick={() => {setIsEditingSocials(false); setSocials(profileData.socials || { instagram: '', facebook: '', linkedin: '', snapchat: '' });}}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="socials-list" style={{display: 'flex', gap: '12px', flexWrap: 'wrap'}}>
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
                      { key: 'instagram', icon: <Instagram size={22} />, color: '#E1306C', hoverBg: 'rgba(225,48,108,0.15)' },
                      { key: 'facebook', icon: <Facebook size={22} />, color: '#1877F2', hoverBg: 'rgba(24,119,242,0.15)' },
                      { key: 'linkedin', icon: <Linkedin size={22} />, color: '#0A66C2', hoverBg: 'rgba(10,102,194,0.15)' },
                      { key: 'snapchat', icon: <span style={{fontSize: '20px'}}>👻</span>, color: '#FFFC00', hoverBg: 'rgba(255,252,0,0.15)' },
                    ];
                    const hasAny = platforms.some(p => s[p.key]);
                    if (!hasAny) return <span style={{color: '#6b7280', fontSize: '0.9rem'}}>No social links added yet</span>;
                    return platforms.map(p => {
                      const url = getSocialUrl(p.key, s[p.key]);
                      if (!url) return null;
                      return (
                        <a key={p.key} href={url} target="_blank" rel="noopener noreferrer" title={p.key.charAt(0).toUpperCase() + p.key.slice(1)}
                          style={{
                            width: '44px', height: '44px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: p.color,
                            transition: 'all 0.2s ease', cursor: 'pointer', textDecoration: 'none'
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = p.hoverBg; e.currentTarget.style.transform = 'scale(1.1)'; e.currentTarget.style.borderColor = p.color; }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
                        >
                          {p.icon}
                        </a>
                      );
                    });
                  })()}
                </div>
              )}
            </div>
          </div>
          
          {authUser?.role !== 'superadmin' && (
            <div style={{ marginTop: '20px', padding: '20px', backgroundColor: '#1f2937', borderRadius: '12px', border: '1px solid #ef4444', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '15px' }}>
              <div>
                <h4 style={{ margin: '0 0 4px 0', color: '#ef4444', fontSize: '1.1rem' }}>Danger Zone</h4>
                <span style={{ fontSize: '0.85rem', color: '#9ca3af' }}>
                  {profileData.deletionRequested 
                    ? 'Your account deletion request is currently under review by Superadmin. Please wait.' 
                    : 'Permanently delete your account and all associated data.'}
                </span>
              </div>
              <button 
                onClick={handleRequestDeletion}
                disabled={profileData.deletionRequested}
                style={{
                  padding: '10px 20px', 
                  borderRadius: '8px', 
                  fontWeight: 'bold',
                  cursor: profileData.deletionRequested ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: profileData.deletionRequested ? '#374151' : 'transparent',
                  color: profileData.deletionRequested ? '#9ca3af' : '#ef4444',
                  border: `1px solid ${profileData.deletionRequested ? '#374151' : '#ef4444'}`,
                  transition: 'all 0.2s ease'
                }}
              >
                <Trash2 size={16} /> 
                {profileData.deletionRequested ? 'Request Pending' : 'Request Account Deletion'}
              </button>
            </div>
          )}
        </div>
      ) : activeTab === 'friends' ? (
        <div className="friends-section" style={{marginTop: '20px'}}>
          <h3>Your Friends ({profileData.friends?.length || 0})</h3>
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
              <p className="text-muted">You have no friends yet. Start chatting to make friends!</p>
            )}
          </div>
        </div>
      ) : (
        <div className="friends-section" style={{marginTop: '20px'}}>
          <div style={{display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px'}}>
            <h3>Profile Visitors ({profileData.profileVisitors?.length || 0})</h3>
            <span style={{fontSize: '12px', color: '#9ca3af', backgroundColor: '#374151', padding: '2px 8px', borderRadius: '12px'}}>Last 24 Hours</span>
          </div>
          <div className="friends-grid">
            {profileData.profileVisitors?.length > 0 ? (
              profileData.profileVisitors.map(v => {
                const diffMs = Date.now() - new Date(v.timestamp).getTime();
                const diffMins = Math.floor(diffMs / 60000);
                const diffHrs = Math.floor(diffMins / 60);
                let timeString = diffMins < 1 ? 'Just now' : diffMins < 60 ? `${diffMins}m ago` : `${diffHrs}h ago`;
                
                return (
                  <div key={v.username} className="friend-card" style={{cursor: 'pointer', position: 'relative'}} onClick={() => navigate(`/user/${v.username}`)}>
                    {v.profilePic ? (
                      <img src={v.profilePic} alt={v.username} className="friend-avatar" />
                    ) : (
                      <div className="friend-avatar" style={{backgroundColor: '#374151', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                        <UserIcon size={24} color="#9ca3af" />
                      </div>
                    )}
                    <div className="friend-info">
                      <h4>{v.username}</h4>
                      <span className="friend-role" style={{fontSize: '11px', color: '#6b7280'}}>{timeString}</span>
                    </div>
                    <div style={{position: 'absolute', top: '10px', right: '10px'}}>
                      <span className={`badge badge-${v.role || 'user'}`} style={{fontSize: '9px', padding: '2px 4px'}}>
                        {(v.role || 'USER').toUpperCase()}
                      </span>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-muted">No one has visited your profile in the last 24 hours.</p>
            )}
          </div>
        </div>
      )}
      {isUploading && (
        <div className="modal-overlay" style={{zIndex: 99999}}>
          <div className="modal-content" style={{padding: '20px', textAlign: 'center'}}>
            <h3>Uploading Image...</h3>
            <p className="text-muted">Please wait while we process your request.</p>
          </div>
        </div>
      )}

      <ImageCropperModal 
        isOpen={cropperOpen}
        onClose={() => setCropperOpen(false)}
        imageSrc={cropperSrc}
        aspect={cropperAspect}
        onCropComplete={handleCropComplete}
      />

      <ImageModal 
        isOpen={!!imageModalSrc}
        onClose={() => setImageModalSrc(null)}
        imageUrl={imageModalSrc}
      />
    </div>
  );
};

export default MyProfile;
