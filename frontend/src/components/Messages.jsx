import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { useToast } from '../contexts/ToastContext';
import EmojiPicker from 'emoji-picker-react';
import { Search, Send, User, Check, X, Clock, MessageCircle, Paperclip, Mic, Smile, AlertTriangle, UserMinus, MoreVertical, Square, Trash2, Image, Play, Maximize2, ArrowLeft, Lock } from 'lucide-react';
import html2canvas from 'html2canvas';

const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

// Giphy Public API Key for development
const GIPHY_API_KEY = 'GlVGYHqc3SyCEGqmeHgNa1gwJzOwkHfT';

const renderFormattedText = (text) => {
  if (!text) return null;
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
};

const useClickOutside = (ref, handler) => {
  useEffect(() => {
    const listener = (event) => {
      if (!ref.current || ref.current.contains(event.target)) return;
      handler(event);
    };
    document.addEventListener('mousedown', listener);
    document.addEventListener('touchstart', listener);
    return () => {
      document.removeEventListener('mousedown', listener);
      document.removeEventListener('touchstart', listener);
    };
  }, [ref, handler]);
};

const Messages = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user: authUser } = useAuth();
  const { socket } = useSocket();
  const { showToast, showConfirm } = useToast();

  const [friends, setFriends] = useState([]);
  const [requests, setRequests] = useState([]);
  const [unreadCounts, setUnreadCounts] = useState({});
  
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  const [activeTab, setActiveTab] = useState('inbox');
  const [activeChatUser, setActiveChatUser] = useState(null);
  const [chatHistory, setChatHistory] = useState([]);
  const [messageInput, setMessageInput] = useState('');
  const [isFetchingChat, setIsFetchingChat] = useState(false);
  
  const [isTimeCapsule, setIsTimeCapsule] = useState(false);
  const [deliverAt, setDeliverAt] = useState('');

  // Advanced States
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showChatMenu, setShowChatMenu] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  
  // Report System States
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  
  const [isUploading, setIsUploading] = useState(false);
  const [previewMedia, setPreviewMedia] = useState(null); // {url, type}
  
  const [gifs, setGifs] = useState([]);
  const [gifSearchQuery, setGifSearchQuery] = useState('');

  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const chatScrollRef = useRef(null);
  const fileInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);

  const emojiPickerRef = useRef(null);
  const chatMenuRef = useRef(null);
  const gifPickerRef = useRef(null);
  const timeCapsuleRef = useRef(null);

  useClickOutside(emojiPickerRef, () => setShowEmojiPicker(false));
  useClickOutside(chatMenuRef, () => setShowChatMenu(false));
  useClickOutside(gifPickerRef, () => setShowGifPicker(false));
  useClickOutside(timeCapsuleRef, () => {
    if (!deliverAt) setIsTimeCapsule(false);
  });

  useEffect(() => {
    fetchProfileData();
  }, []);

  useEffect(() => {
    if (location.state?.openChatWith) {
      openChat({ username: location.state.openChatWith });
      // clear state to prevent reopening on reload
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const fetchProfileData = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${backendUrl}/api/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setFriends(data.friends || []);
        setRequests(data.friendRequests || []);
        setUnreadCounts(data.unreadCounts || {});
      }
    } catch (err) {
      console.error('Failed to fetch profile data', err);
    }
  };

  useEffect(() => {
    if (!socket) return;
    const handleNewMessage = (msg) => {
      if (activeChatUser && (msg.sender === activeChatUser.username || msg.receiver === activeChatUser.username)) {
        setChatHistory(prev => [...prev, msg]);
        scrollToBottom();
        if (msg.sender === activeChatUser.username) {
          const token = localStorage.getItem('token');
          fetch(`${backendUrl}/api/messages/${msg.sender}/read`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}` }
          }).then(() => {
            window.dispatchEvent(new Event('badge-update-required'));
          });
        }
      } else {
        if (msg.sender !== authUser?.username) {
          setUnreadCounts(prev => ({ ...prev, [msg.sender]: (prev[msg.sender] || 0) + 1 }));
        }
      }
    };
    const handleRequestReceived = () => { fetchProfileData(); showToast('You have a new friend request!'); };
    const handleRequestAccepted = () => { fetchProfileData(); showToast('Your friend request was accepted!'); };
    const handleFriendRemoved = (data) => {
      fetchProfileData();
      if (activeChatUser && activeChatUser.username === data.username) {
        const isMeAdmin = authUser?.role === 'admin' || authUser?.role === 'superadmin';
        const isTargetAdmin = activeChatUser?.role === 'admin' || activeChatUser?.role === 'superadmin';
        if (!isMeAdmin && !isTargetAdmin) {
          setActiveChatUser(null);
          setChatHistory([]);
        }
      }
    };
    const handleProfileUpdated = (data) => {
      setFriends(prev => prev.map(f => f.username === data.username ? { ...f, profilePic: data.profilePic, bannerImage: data.bannerImage } : f));
      setRequests(prev => prev.map(r => r.username === data.username ? { ...r, profilePic: data.profilePic, bannerImage: data.bannerImage } : r));
      setSearchResults(prev => prev.map(u => u.username === data.username ? { ...u, profilePic: data.profilePic, bannerImage: data.bannerImage } : u));
      if (activeChatUser && activeChatUser.username === data.username) {
        setActiveChatUser(prev => ({ ...prev, profilePic: data.profilePic, bannerImage: data.bannerImage }));
      }
    };
    const handleMessageDeleted = (data) => {
      setChatHistory(prev => prev.filter(msg => msg.id !== data.messageId && msg._id !== data.messageId));
    };
    const handleMessageSentAck = (data) => {
      setChatHistory(prev => prev.map(msg => msg.id === data.tempId ? { ...msg, id: data.realId, _id: data.realId } : msg));
    };
    const handleChatCleared = (data) => {
      fetchProfileData();
      if (activeChatUser && (activeChatUser.username === data.targetUser || authUser?.username === data.targetUser)) {
        setActiveChatUser(null);
        setChatHistory([]);
      }
    };
    const handleRoleChanged = () => {
      fetchProfileData();
    };

    socket.on('private-message', handleNewMessage);
    socket.on('friend-request-received', handleRequestReceived);
    socket.on('friend-request-accepted', handleRequestAccepted);
    socket.on('friend-removed', handleFriendRemoved);
    socket.on('profile-updated', handleProfileUpdated);
    socket.on('message-deleted', handleMessageDeleted);
    socket.on('message-sent-ack', handleMessageSentAck);
    socket.on('chat-cleared', handleChatCleared);
    socket.on('user-role-changed', handleRoleChanged);
    socket.on('admin-update', handleRoleChanged);

    return () => {
      socket.off('private-message', handleNewMessage);
      socket.off('friend-request-received', handleRequestReceived);
      socket.off('friend-request-accepted', handleRequestAccepted);
      socket.off('friend-removed', handleFriendRemoved);
      socket.off('profile-updated', handleProfileUpdated);
      socket.off('message-deleted', handleMessageDeleted);
      socket.off('message-sent-ack', handleMessageSentAck);
      socket.off('chat-cleared', handleChatCleared);
      socket.off('user-role-changed', handleRoleChanged);
      socket.off('admin-update', handleRoleChanged);
    };
  }, [socket, activeChatUser]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (searchQuery.trim()) performSearch();
      else { setSearchResults([]); setIsSearching(false); }
    }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  const performSearch = async () => {
    setIsSearching(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${backendUrl}/api/users/search?q=${searchQuery}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) setSearchResults(await res.json());
    } catch (err) {} finally { setIsSearching(false); }
  };

  const sendFriendRequest = async (targetUsername) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${backendUrl}/api/friend-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ targetUsername })
      });
      if (res.ok) { showToast(`Friend request sent to ${targetUsername}`); performSearch(); } 
      else { const data = await res.json(); showToast(data.error || 'Failed to send request'); }
    } catch (err) { showToast('Server error'); }
  };

  const respondToRequest = async (targetUsername, action) => {
    try {
      const token = localStorage.getItem('token');
      const endpoint = action === 'accept' ? '/api/friend-accept' : '/api/friend-decline';
      const res = await fetch(`${backendUrl}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ targetUsername })
      });
      if (res.ok) { showToast(`Request ${action}ed`); fetchProfileData(); } 
      else { showToast(`Failed to ${action} request`); }
    } catch (err) { showToast('Server error'); }
  };

  const handleUnfriend = () => {
    setShowChatMenu(false);
    showConfirm(`Are you sure you want to unfriend ${activeChatUser.username}? You will lose your chat history.`, async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${backendUrl}/api/unfriend`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ targetUsername: activeChatUser.username })
        });
        if (res.ok) {
          showToast(`Unfriended ${activeChatUser.username}`);
          const isMeAdmin = authUser?.role === 'admin' || authUser?.role === 'superadmin';
          const isTargetAdmin = activeChatUser?.role === 'admin' || activeChatUser?.role === 'superadmin';
          if (!isMeAdmin && !isTargetAdmin) {
            setActiveChatUser(null);
            setChatHistory([]);
          }
          fetchProfileData();
        } else { showToast('Failed to unfriend'); }
      } catch (err) { showToast('Server error during unfriend'); }
    });
  };

  const handleReport = () => {
    setShowChatMenu(false);
    setShowReportModal(true);
    setReportReason('');
  };

  const submitReport = async () => {
    if (!reportReason.trim()) {
      showToast('Please provide a reason for reporting.');
      return;
    }
    
    setIsSubmittingReport(true);
    let screenshotData = '';
    
    try {
      // Capture the chat area automatically
      const chatArea = document.querySelector('.chat-area') || document.body;
      const canvas = await html2canvas(chatArea, { 
        useCORS: true, 
        allowTaint: false,
        ignoreElements: (element) => element.id === 'report-modal-wrapper'
      });
      screenshotData = canvas.toDataURL('image/jpeg', 0.6); // Compress to 60% quality jpeg
    } catch (err) {
      console.error('Failed to capture screenshot', err);
      // Proceed without screenshot if it fails
    }

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${backendUrl}/api/report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          reportedUser: activeChatUser.username,
          reason: reportReason,
          screenshotData
        })
      });
      
      if (res.ok) {
        showToast('Report submitted successfully.');
        setShowReportModal(false);
      } else {
        const errorData = await res.json();
        showToast(errorData.error || 'Failed to submit report');
      }
    } catch (err) {
      console.error(err);
      showToast('Server error while reporting');
    } finally {
      setIsSubmittingReport(false);
    }
  };

  const handleClearChat = () => {
    setShowChatMenu(false);
    showConfirm('Are you sure you want to clear the entire chat history with this user?', () => {
      socket.emit('admin-clear-chat', { targetUser: activeChatUser.username });
    });
  };

  const handleUnsend = (messageId) => {
    showConfirm('Are you sure you want to unsend this message?', () => {
      socket.emit('admin-delete-message', { messageId });
    });
  };

  const openChat = async (user) => {
    if (activeChatUser && activeChatUser.username === user.username) {
      setActiveChatUser(null);
      setChatHistory([]);
      return;
    }
    
    setActiveChatUser(user);
    setIsFetchingChat(true);
    setSearchQuery('');
    setShowChatMenu(false);
    setShowEmojiPicker(false);
    setAudioBlob(null);
    try {
      const token = localStorage.getItem('token');
      
      // Clear unread
      setUnreadCounts(prev => ({ ...prev, [user.username]: 0 }));
      await fetch(`${backendUrl}/api/messages/${user.username}/read`, { 
        method: 'PUT', 
        headers: { 'Authorization': `Bearer ${token}` } 
      });
      window.dispatchEvent(new Event('badge-update-required'));

      const res = await fetch(`${backendUrl}/api/messages/${user.username}`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (res.ok) { setChatHistory(await res.json()); scrollToBottom(); }
    } catch (err) {} finally { setIsFetchingChat(false); }
  };

  const sendMessage = (e) => {
    if (e) e.preventDefault();
    if (!messageInput.trim() || !activeChatUser || !socket) return;
    if (isTimeCapsule && !deliverAt) {
      showToast('Please select a delivery time for the Time Capsule.');
      return;
    }
    sendSocketMessage('text', messageInput.trim(), null);
    setMessageInput('');
    setIsTimeCapsule(false);
    setDeliverAt('');
    setShowEmojiPicker(false);
  };

  const sendSocketMessage = (type, text, fileUrl) => {
    const tempId = Date.now().toString();
    const msgData = { 
      id: tempId, 
      to: activeChatUser.username, 
      text: text, 
      type: type, 
      fileUrl: fileUrl,
      isTimeCapsule,
      deliverAt: isTimeCapsule && deliverAt ? new Date(deliverAt) : null
    };
    socket.emit('private-message', msgData);
    setChatHistory(prev => [...prev, {
      id: tempId, sender: authUser.username, receiver: activeChatUser.username,
      text: text, type: type, fileUrl: fileUrl, timestamp: new Date(),
      isTimeCapsule: msgData.isTimeCapsule, deliverAt: msgData.deliverAt
    }]);
    scrollToBottom();
  };

  const scrollToBottom = () => {
    setTimeout(() => { if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight; }, 50);
  };

  const onEmojiClick = (emojiObject) => { setMessageInput(prev => prev + emojiObject.emoji); };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');
    if (!isVideo && !isImage) { showToast('Only image and video files are supported'); return; }
    uploadFile(file, isVideo ? 'video' : 'image');
  };

  const uploadFile = async (file, type) => {
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const token = localStorage.getItem('token');
      const res = await fetch(`${backendUrl}/api/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      if (res.ok) {
        const { url } = await res.json();
        sendSocketMessage(type, '', url);
      } else { showToast('Failed to upload file'); }
    } catch(err) { showToast('Server error during upload'); } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const toggleRecording = async () => {
    if (isRecording) {
      if (mediaRecorderRef.current) mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(timerRef.current);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) audioChunksRef.current.push(event.data);
        };

        mediaRecorder.onstop = () => {
          const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          setAudioBlob(blob);
          stream.getTracks().forEach(track => track.stop());
        };

        mediaRecorder.start();
        setIsRecording(true);
        setRecordingDuration(0);
        timerRef.current = setInterval(() => { setRecordingDuration(prev => prev + 1); }, 1000);
      } catch (err) { showToast('Microphone access denied'); }
    }
  };

  const sendAudioMessage = () => {
    if (!audioBlob) return;
    const file = new File([audioBlob], `audio-${Date.now()}.webm`, { type: 'audio/webm' });
    uploadFile(file, 'audio');
    setAudioBlob(null);
  };

  const discardAudioMessage = () => {
    setAudioBlob(null);
    setRecordingDuration(0);
  };

  const fetchGifs = async (query = '') => {
    try {
      const endpoint = query ? 'search' : 'trending';
      const url = `https://api.giphy.com/v1/gifs/${endpoint}?api_key=${GIPHY_API_KEY}&limit=20${query ? `&q=${query}` : ''}`;
      const res = await fetch(url);
      const data = await res.json();
      setGifs(data.data || []);
    } catch (err) {
      console.error('GIF fetch failed', err);
    }
  };

  useEffect(() => {
    if (showGifPicker && gifs.length === 0) fetchGifs();
  }, [showGifPicker]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (showGifPicker) fetchGifs(gifSearchQuery);
    }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [gifSearchQuery]);

  const sendGif = (gifUrl) => {
    sendSocketMessage('image', '', gifUrl);
    setShowGifPicker(false);
  };

  // Use global CSS badges from index.css instead of inline styles

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div className="messages-wrapper" style={{ padding: '20px', height: 'calc(100vh - 70px)', boxSizing: 'border-box' }}>
      <div className={`messages-layout ${activeChatUser ? 'chat-open' : ''}`} style={{ display: 'flex', height: '100%', maxWidth: '1400px', margin: '0 auto', background: '#111827', color: '#f3f4f6', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.4)', border: '1px solid #374151' }}>
      
      {/* Lightbox / Media Modal */}
      {previewMedia && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.9)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(5px)' }} onClick={() => setPreviewMedia(null)}>
          <button style={{ position: 'absolute', top: '20px', right: '20px', background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', borderRadius: '50%', padding: '10px', cursor: 'pointer' }} onClick={() => setPreviewMedia(null)}>
            <X size={24} />
          </button>
          {previewMedia.type === 'video' ? (
            <video src={previewMedia.url} controls autoPlay style={{ maxWidth: '90%', maxHeight: '90%', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }} onClick={e => e.stopPropagation()} />
          ) : (
            <img src={previewMedia.url} alt="Preview" style={{ maxWidth: '90%', maxHeight: '90%', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.5)', objectFit: 'contain' }} onClick={e => e.stopPropagation()} />
          )}
        </div>
      )}

      {/* Left Sidebar */}
      <div className="messages-sidebar" style={{ width: '350px', borderRight: '1px solid #374151', display: 'flex', flexDirection: 'column', background: '#1f2937' }}>
        <div style={{ padding: '20px', borderBottom: '1px solid #374151' }}>
          <h2 style={{ margin: '0 0 16px 0', fontSize: '1.5rem', fontWeight: 'bold' }}>Messages</h2>
          <div style={{ position: 'relative', marginBottom: '16px' }}>
            <input type="text" placeholder="Search users..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ width: '100%', padding: '10px 36px 10px 36px', borderRadius: '8px', border: '1px solid #4b5563', background: '#111827', color: '#f3f4f6', outline: 'none', boxSizing: 'border-box' }} />
            <Search size={18} color="#9ca3af" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
            {searchQuery && (
              <X 
                size={16} 
                color="#9ca3af" 
                style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', cursor: 'pointer' }} 
                onClick={() => setSearchQuery('')} 
              />
            )}
          </div>

          {!searchQuery && (
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setActiveTab('inbox')} style={{ flex: 1, padding: '8px', borderRadius: '6px', background: activeTab === 'inbox' ? '#3b82f6' : '#374151', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: '500' }}>Inbox</button>
              <button onClick={() => setActiveTab('requests')} style={{ flex: 1, padding: '8px', borderRadius: '6px', background: activeTab === 'requests' ? '#3b82f6' : '#374151', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: '500', position: 'relative' }}>
                Requests
                {requests.length > 0 && (
                  <span style={{ position: 'absolute', top: '-5px', right: '-5px', background: '#ef4444', color: 'white', borderRadius: '50%', width: '20px', height: '20px', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{requests.length}</span>
                )}
              </button>
            </div>
          )}
        </div>

        <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
          {searchQuery ? (
            <div>
              <p style={{ color: '#9ca3af', fontSize: '0.9rem', marginBottom: '10px', paddingLeft: '5px' }}>Search Results</p>
              {isSearching ? <p style={{color: '#6b7280', textAlign: 'center', padding: '20px'}}>Searching...</p> : 
                searchResults.length === 0 ? <p style={{color: '#6b7280', textAlign: 'center', padding: '20px'}}>No users found</p> :
                searchResults.map(u => {
                  const isFriend = friends.some(f => f.username === u.username);
                  const canMessageDirectly = isFriend || authUser?.role === 'admin' || authUser?.role === 'superadmin';
                  
                  return (
                    <div key={u.username} style={{ display: 'flex', alignItems: 'center', padding: '12px', borderRadius: '8px', background: '#111827', marginBottom: '8px', gap: '12px' }}>
                      <div onClick={() => navigate(`/user/${u.username}`)} style={{ cursor: 'pointer', width: '40px', height: '40px', borderRadius: '50%', background: '#374151', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {u.profilePic ? <img src={u.profilePic} alt={u.username} style={{width: '100%', height: '100%', objectFit: 'cover'}}/> : <User size={20} color="#9ca3af" />}
                      </div>
                      <div style={{ flex: 1, overflow: 'hidden' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <h4 onClick={() => navigate(`/user/${u.username}`)} style={{ margin: 0, fontSize: '1rem', cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.username}</h4>
                          <span className={`badge badge-${u.role || 'user'}`}>{(u.role || 'USER').toUpperCase()}</span>
                        </div>
                      </div>
                      <div style={{ flexShrink: 0, display: 'flex', gap: '8px' }}>
                        {canMessageDirectly && (
                          <button onClick={() => openChat(u)} style={{ background: '#10b981', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '4px' }}><MessageCircle size={14}/> Message</button>
                        )}
                        {(!isFriend && authUser?.role !== 'superadmin' && u.role !== 'superadmin') && (
                          u.hasSentRequest ? (
                            <button disabled style={{ background: '#374151', color: '#9ca3af', border: 'none', padding: '6px 12px', borderRadius: '6px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={14}/> Pending</button>
                          ) : (
                            <button onClick={() => sendFriendRequest(u.username)} style={{ background: '#3b82f6', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' }}>Add Friend</button>
                          )
                        )}
                      </div>
                    </div>
                  );
                })
              }
            </div>
          ) : activeTab === 'requests' ? (
            <div>
              {requests.length === 0 ? <p style={{color: '#6b7280', textAlign: 'center', padding: '20px'}}>No pending requests</p> : 
                requests.map(req => (
                  <div key={req.username} style={{ display: 'flex', flexDirection: 'column', padding: '16px', borderRadius: '8px', background: '#111827', marginBottom: '12px', border: '1px solid #374151' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                      <div onClick={() => navigate(`/user/${req.username}`)} style={{ cursor: 'pointer', width: '48px', height: '48px', borderRadius: '50%', background: '#374151', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {req.profilePic ? <img src={req.profilePic} alt={req.username} style={{width: '100%', height: '100%', objectFit: 'cover'}}/> : <User size={24} color="#9ca3af" />}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <h4 onClick={() => navigate(`/user/${req.username}`)} style={{ margin: 0, fontSize: '1.1rem', cursor: 'pointer' }}>{req.username}</h4>
                          <span className={`badge badge-${req.role || 'user'}`}>{(req.role || 'USER').toUpperCase()}</span>
                        </div>
                        <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>Wants to be friends</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={() => respondToRequest(req.username, 'accept')} style={{ flex: 1, background: '#10b981', color: 'white', border: 'none', padding: '8px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', fontWeight: '500' }}><Check size={16}/> Accept</button>
                      <button onClick={() => respondToRequest(req.username, 'decline')} style={{ flex: 1, background: '#ef4444', color: 'white', border: 'none', padding: '8px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', fontWeight: '500' }}><X size={16}/> Decline</button>
                    </div>
                  </div>
                ))
              }
            </div>
          ) : (
            <div>
              {friends.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#6b7280' }}>
                  <MessageCircle size={40} style={{ marginBottom: '10px', opacity: 0.5 }} />
                  <p>Your inbox is empty.</p>
                </div>
              ) : (
                friends.map(f => (
                  <div key={f.username} onClick={() => openChat(f)} style={{ position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: '0', borderRadius: '12px', background: activeChatUser?.username === f.username ? '#374151' : '#1f2937', cursor: 'pointer', transition: 'transform 0.2s, box-shadow 0.2s', marginBottom: '12px', border: activeChatUser?.username === f.username ? '1px solid #8b5cf6' : '1px solid #374151', boxShadow: activeChatUser?.username === f.username ? '0 0 10px rgba(139, 92, 246, 0.3)' : '0 4px 6px rgba(0,0,0,0.3)' }} onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 12px rgba(0,0,0,0.5)'; }} onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = activeChatUser?.username === f.username ? '0 0 10px rgba(139, 92, 246, 0.3)' : '0 4px 6px rgba(0,0,0,0.3)'; }}>
                    
                    {/* Banner Background */}
                    <div style={{ height: '60px', width: '100%', backgroundImage: f.bannerImage ? `url(${f.bannerImage})` : 'linear-gradient(135deg, #6366f1, #a855f7, #ec4899)', backgroundSize: 'cover', backgroundPosition: 'center', position: 'relative' }}>
                       <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(31, 41, 55, 0), rgba(31, 41, 55, 1))' }}></div>
                    </div>

                    {/* Content overlapping banner */}
                    <div style={{ padding: '0 12px 12px 12px', display: 'flex', alignItems: 'flex-end', marginTop: '-30px', position: 'relative', zIndex: 2 }}>
                      <div style={{ position: 'relative', marginRight: '12px' }}>
                        <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#374151', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '3px solid #1f2937', boxShadow: '0 4px 8px rgba(0,0,0,0.6)' }}>
                          {f.profilePic ? <img src={f.profilePic} alt={f.username} style={{width: '100%', height: '100%', objectFit: 'cover'}}/> : <User size={28} color="#9ca3af" />}
                        </div>
                        {unreadCounts[f.username] > 0 && (
                          <div style={{ position: 'absolute', bottom: '2px', right: '2px', width: '14px', height: '14px', borderRadius: '50%', background: '#3b82f6', border: '2px solid #1f2937', boxShadow: '0 0 5px rgba(59,130,246,0.5)' }}></div>
                        )}
                      </div>
                      <div style={{ flex: 1, overflow: 'hidden', paddingBottom: '4px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                          <h4 style={{ margin: 0, fontSize: '1.15rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#fff', textShadow: '2px 2px 0px #000, -1px -1px 0px rgba(255,255,255,0.3), 0px 4px 4px rgba(0,0,0,0.8)', fontWeight: '800', letterSpacing: '0.5px' }}>{f.username}</h4>
                          <span className={`badge badge-${f.role || 'user'}`} style={{transform: 'scale(0.85)', transformOrigin: 'left center'}}>{(f.role || 'USER').toUpperCase()}</span>
                        </div>
                        <span style={{ fontSize: '0.8rem', color: '#9ca3af', display: 'block', textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>{unreadCounts[f.username] > 0 ? <strong style={{color: '#3b82f6'}}>{unreadCounts[f.username]} new messages</strong> : 'Tap to chat'}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right Chat Area */}
      <div className="messages-main" style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#111827', position: 'relative' }}>
        {activeChatUser ? (
          <>
            {/* Chat Header */}
            <div style={{ padding: '16px 24px', borderBottom: '1px solid #374151', display: 'flex', alignItems: 'center', background: '#1f2937', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <button 
                  className="mobile-back-btn"
                  onClick={() => { setActiveChatUser(null); setChatHistory([]); }} 
                  style={{ display: 'none', background: 'transparent', border: 'none', color: '#9ca3af', marginRight: '12px', cursor: 'pointer', padding: '4px' }}
                >
                  <ArrowLeft size={24} />
                </button>
                <div onClick={() => navigate(`/user/${activeChatUser.username}`)} style={{ cursor: 'pointer', width: '40px', height: '40px', borderRadius: '50%', background: '#4b5563', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {activeChatUser.profilePic ? <img src={activeChatUser.profilePic} alt={activeChatUser.username} style={{width: '100%', height: '100%', objectFit: 'cover'}}/> : <User size={20} color="#9ca3af" />}
                </div>
                <div style={{ marginLeft: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h3 onClick={() => navigate(`/user/${activeChatUser.username}`)} style={{ margin: 0, cursor: 'pointer' }}>{activeChatUser.username}</h3>
                    <span className={`badge badge-${activeChatUser.role || 'user'}`}>{(activeChatUser.role || 'USER').toUpperCase()}</span>
                  </div>
                </div>
              </div>
              
              <div style={{ position: 'relative' }} ref={chatMenuRef}>
                <button onClick={() => setShowChatMenu(!showChatMenu)} style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: '8px', borderRadius: '50%', transition: 'background 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.background = '#374151'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                  <MoreVertical size={20} />
                </button>
                {showChatMenu && (
                  <div style={{ position: 'absolute', top: '40px', right: '0', background: '#1f2937', border: '1px solid #374151', borderRadius: '8px', boxShadow: '0 4px 15px rgba(0, 0, 0, 0.5)', zIndex: 50, width: '160px', overflow: 'hidden' }}>
                    {authUser?.role !== 'superadmin' && activeChatUser?.role !== 'superadmin' && friends.some(f => f.username === activeChatUser?.username && f.isFriend) && (
                      <button onClick={handleUnfriend} style={{ width: '100%', textAlign: 'left', padding: '12px 16px', background: 'transparent', border: 'none', borderBottom: '1px solid #374151', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem' }} onMouseEnter={(e) => e.currentTarget.style.background = '#374151'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                        <UserMinus size={16} /> Unfriend
                      </button>
                    )}
                    {authUser?.role === 'superadmin' && (
                      <button onClick={handleClearChat} style={{ width: '100%', textAlign: 'left', padding: '12px 16px', background: 'transparent', border: 'none', borderBottom: '1px solid #374151', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem' }} onMouseEnter={(e) => e.currentTarget.style.background = '#374151'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                        <Trash2 size={16} /> Clear Chat
                      </button>
                    )}
                    {activeChatUser?.role !== 'superadmin' && (
                      <button onClick={handleReport} style={{ width: '100%', textAlign: 'left', padding: '12px 16px', background: 'transparent', border: 'none', color: '#f3f4f6', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem' }} onMouseEnter={(e) => e.currentTarget.style.background = '#374151'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                        <AlertTriangle size={16} color="#eab308" /> Report User
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Chat Messages */}
            <div ref={chatScrollRef} className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {isFetchingChat ? (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: '#9ca3af' }}>Loading messages...</div>
              ) : chatHistory.length === 0 ? (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: '#6b7280', flexDirection: 'column', gap: '10px' }}>
                  <MessageCircle size={48} style={{ opacity: 0.5 }} />
                  <p>Say hi to {activeChatUser.username}!</p>
                </div>
              ) : (
                chatHistory.map((msg, idx) => {
                  const isMe = msg.sender === authUser.username;
                  return (
                    <div key={msg.id || idx} style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start', marginBottom: '16px', alignItems: 'center', gap: '8px' }}>
                      
                      {authUser?.role === 'superadmin' && !isMe && (
                        <button onClick={() => handleUnsend(msg.id)} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px', opacity: 0.7 }} title="Delete Message" onMouseEnter={(e) => e.currentTarget.style.opacity = 1} onMouseLeave={(e) => e.currentTarget.style.opacity = 0.7}>
                          <Trash2 size={16} />
                        </button>
                      )}
                      
                      {isMe && ((authUser?.role === 'admin') || (authUser?.role === 'superadmin')) && (
                        <button onClick={() => handleUnsend(msg.id)} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px', opacity: 0.7 }} title="Unsend Message" onMouseEnter={(e) => e.currentTarget.style.opacity = 1} onMouseLeave={(e) => e.currentTarget.style.opacity = 0.7}>
                          <Trash2 size={16} />
                        </button>
                      )}

                      <div style={{ 
                        maxWidth: '70%', 
                        padding: '10px 16px', 
                        borderRadius: '16px',
                        background: isMe ? 'linear-gradient(135deg, #4f46e5, #7c3aed)' : 'rgba(30, 41, 59, 0.85)',
                        backdropFilter: isMe ? 'none' : 'blur(8px)',
                        color: '#fff',
                        borderBottomRightRadius: isMe ? '4px' : '16px',
                        borderBottomLeftRadius: isMe ? '16px' : '4px',
                        wordWrap: 'break-word',
                        boxShadow: '0 4px 15px rgba(0,0,0,0.2)',
                        border: isMe ? 'none' : '1px solid rgba(255, 255, 255, 0.1)',
                        position: 'relative',
                        overflow: 'hidden'
                      }}>
                        
                        <div style={{ filter: msg.isTimeCapsule && currentTime < new Date(msg.deliverAt) ? 'blur(10px)' : 'none', userSelect: msg.isTimeCapsule && currentTime < new Date(msg.deliverAt) ? 'none' : 'auto', transition: 'filter 0.5s ease' }}>
                          {msg.isTimeCapsule && currentTime >= new Date(msg.deliverAt) && (
                            <div style={{ fontSize: '0.75rem', color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px' }}>
                              <Clock size={12} /> Time Capsule Unlocked
                            </div>
                          )}
                          {msg.type === 'image' && (
                            <div style={{ marginBottom: '8px', borderRadius: '8px', overflow: 'hidden', cursor: 'pointer' }} onClick={() => { if (!(msg.isTimeCapsule && currentTime < new Date(msg.deliverAt))) setPreviewMedia({url: msg.fileUrl, type: 'image'}) }}>
                              <img src={msg.fileUrl} alt="attachment" style={{ maxWidth: '100%', maxHeight: '250px', display: 'block', borderRadius: '8px', transition: 'transform 0.2s' }} />
                            </div>
                          )}
                          {msg.type === 'video' && (
                            <div style={{ marginBottom: '8px', borderRadius: '8px', overflow: 'hidden', position: 'relative', cursor: 'pointer' }} onClick={() => { if (!(msg.isTimeCapsule && currentTime < new Date(msg.deliverAt))) setPreviewMedia({url: msg.fileUrl, type: 'video'}) }}>
                              <video src={msg.fileUrl} style={{ maxWidth: '100%', maxHeight: '250px', display: 'block', borderRadius: '8px', background: '#000' }} />
                              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'rgba(0,0,0,0.5)', borderRadius: '50%', padding: '10px', pointerEvents: 'none' }}>
                                <Play size={24} color="white" fill="white" />
                              </div>
                            </div>
                          )}
                          {msg.type === 'audio' && (
                            <div style={{ marginBottom: '8px' }}>
                              <audio src={msg.fileUrl} controls style={{ maxWidth: '250px', display: 'block', pointerEvents: (msg.isTimeCapsule && currentTime < new Date(msg.deliverAt)) ? 'none' : 'auto' }} />
                            </div>
                          )}
                          
                          {msg.text && <p style={{ margin: 0, fontSize: '0.95rem', lineHeight: '1.4', whiteSpace: 'pre-wrap' }}>{renderFormattedText(msg.text)}</p>}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
                          {msg.isTimeCapsule && currentTime < new Date(msg.deliverAt) && (
                            <div 
                              style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(251, 191, 36, 0.15)', padding: '3px 8px', borderRadius: '12px', border: '1px solid rgba(251, 191, 36, 0.3)' }} 
                              title={`Unlocks at: ${new Date(msg.deliverAt).toLocaleString()}`}
                            >
                              <Lock size={10} color="#fbbf24" style={{ filter: 'drop-shadow(0 0 2px rgba(251, 191, 36, 0.6))' }} />
                              <span style={{ fontSize: '0.6rem', color: '#fbbf24', fontWeight: '600', letterSpacing: '0.5px' }}>
                                {new Date(msg.deliverAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          )}
                          <span style={{ fontSize: '0.65rem', color: isMe ? '#bfdbfe' : '#9ca3af', opacity: 0.9 }}>
                            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              {isUploading && (
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                   <div style={{ padding: '10px 16px', borderRadius: '16px', background: '#3b82f6', color: '#fff', opacity: 0.7 }}>
                     <span style={{ fontSize: '0.9rem' }}>Sending...</span>
                   </div>
                </div>
              )}
            </div>

            {/* Audio Recorder Preview */}
            {audioBlob && (
              <div className="chat-input-area" style={{ padding: '16px 24px', background: '#1f2937', borderTop: '1px solid #374151', display: 'flex', alignItems: 'center', gap: '16px' }}>
                <audio src={URL.createObjectURL(audioBlob)} controls style={{ flex: 1, height: '40px' }} />
                <button onClick={discardAudioMessage} style={{ background: '#374151', border: 'none', color: '#ef4444', width: '45px', height: '45px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }} title="Discard">
                  <Trash2 size={20} />
                </button>
                <button onClick={sendAudioMessage} style={{ background: '#10b981', border: 'none', color: '#fff', width: '45px', height: '45px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }} title="Send">
                  <Send size={20} style={{ marginLeft: '2px' }} />
                </button>
              </div>
            )}

            {/* Chat Input */}
            {!audioBlob && (
              <div className="chat-input-area" style={{ padding: '20px 24px', background: '#1f2937', borderTop: '1px solid #374151', position: 'relative' }}>
                
                {/* GIF Picker Popover */}
                {showGifPicker && (
                  <div ref={gifPickerRef} style={{ position: 'absolute', bottom: '100%', left: '24px', marginBottom: '10px', background: '#1f2937', border: '1px solid #374151', borderRadius: '12px', width: '300px', height: '350px', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 10px 25px rgba(0,0,0,0.5)', zIndex: 100 }}>
                    <div style={{ padding: '10px', borderBottom: '1px solid #374151' }}>
                      <input type="text" placeholder="Search GIFs..." value={gifSearchQuery} onChange={(e) => setGifSearchQuery(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: '24px', border: '1px solid #4b5563', background: '#111827', color: '#f3f4f6', outline: 'none' }} />
                    </div>
                    <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      {gifs.map(gif => (
                        <img key={gif.id} src={gif.images.fixed_height_small.url} alt="GIF" onClick={() => sendGif(gif.images.original.url)} style={{ width: '100%', height: '100px', objectFit: 'cover', borderRadius: '8px', cursor: 'pointer' }} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Emoji Picker Popover */}
                {showEmojiPicker && (
                  <div ref={emojiPickerRef} style={{ position: 'absolute', bottom: '100%', right: '80px', marginBottom: '10px', zIndex: 100, boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}>
                    <EmojiPicker onEmojiClick={onEmojiClick} theme="dark" />
                  </div>
                )}

                <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*,video/*" style={{ display: 'none' }} />

                <form onSubmit={sendMessage} style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  
                  <button type="button" onClick={() => fileInputRef.current?.click()} style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: '8px', borderRadius: '50%', transition: 'background 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onMouseEnter={(e) => e.currentTarget.style.background = '#374151'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                    <Paperclip size={20} />
                  </button>

                  <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', background: '#111827', borderRadius: '24px', border: '1px solid #4b5563' }}>
                    {isRecording ? (
                      <div style={{ flex: 1, padding: '12px 20px', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.95rem' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444', animation: 'pulse 1.5s infinite' }}></div>
                        Recording... {formatDuration(recordingDuration)}
                      </div>
                    ) : (
                      <input 
                        type="text" 
                        placeholder="Type a message..." 
                        value={messageInput}
                        onChange={(e) => setMessageInput(e.target.value)}
                        style={{ flex: 1, padding: '12px 20px', background: 'transparent', color: '#f3f4f6', outline: 'none', border: 'none', fontSize: '0.95rem' }}
                      />
                    )}
                    
                    {!isRecording && (
                      <div style={{ display: 'flex', alignItems: 'center', paddingRight: '8px' }}>
                        <div ref={timeCapsuleRef} style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                          {isTimeCapsule && (
                            <div style={{ position: 'absolute', bottom: '100%', right: '0', marginBottom: '15px', background: '#1f2937', border: '1px solid #374151', borderRadius: '12px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px', boxShadow: '0 10px 25px rgba(0,0,0,0.5)', zIndex: 100, minWidth: '200px' }}>
                              <span style={{fontSize: '0.85rem', color: '#10b981', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px'}}>
                                <Clock size={14} /> Time Capsule
                              </span>
                              <input 
                                type="datetime-local" 
                                value={deliverAt} 
                                onChange={(e) => setDeliverAt(e.target.value)} 
                                style={{ background: '#111827', color: '#f3f4f6', border: '1px solid #4b5563', borderRadius: '8px', padding: '8px 10px', outline: 'none', fontSize: '0.85rem', colorScheme: 'dark', width: '100%', boxSizing: 'border-box' }}
                                required
                              />
                            </div>
                          )}
                          <button type="button" onClick={() => setIsTimeCapsule(!isTimeCapsule)} style={{ background: 'transparent', border: 'none', color: isTimeCapsule ? '#10b981' : '#9ca3af', cursor: 'pointer', padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Send as Time Capsule">
                            <Clock size={20} />
                          </button>
                        </div>
                        <button type="button" onClick={() => setShowGifPicker(!showGifPicker)} style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: '8px', fontSize: '0.8rem', fontWeight: 'bold' }}>
                          GIF
                        </button>
                        <button type="button" onClick={() => setShowEmojiPicker(!showEmojiPicker)} style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Smile size={20} />
                        </button>
                      </div>
                    )}
                  </div>

                  {!messageInput.trim() && !isRecording && (
                    <button type="button" onClick={toggleRecording} style={{ background: '#374151', color: '#9ca3af', border: 'none', borderRadius: '50%', width: '45px', height: '45px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s' }} onMouseEnter={(e) => {e.currentTarget.style.background = '#ef4444'; e.currentTarget.style.color = '#fff';}} onMouseLeave={(e) => {e.currentTarget.style.background = '#374151'; e.currentTarget.style.color = '#9ca3af';}}>
                      <Mic size={18} />
                    </button>
                  )}

                  {isRecording && (
                    <button type="button" onClick={toggleRecording} style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: '50%', width: '45px', height: '45px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', animation: 'pulse 1.5s infinite' }}>
                      <Square size={16} fill="currentColor" />
                    </button>
                  )}

                  {messageInput.trim() && (
                    <button type="submit" style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '50%', width: '45px', height: '45px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'background 0.2s' }}>
                      <Send size={18} style={{ marginLeft: '2px' }} />
                    </button>
                  )}
                </form>
              </div>
            )}
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#6b7280' }}>
            <div style={{ width: '80px', height: '80px', borderRadius: '50%', border: '2px solid #374151', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px' }}>
              <MessageCircle size={40} />
            </div>
            <h3 style={{ margin: '0 0 10px 0', color: '#f3f4f6' }}>Your Messages</h3>
            <p style={{ margin: 0 }}>Send private messages, photos, GIFs, and voice notes.</p>
          </div>
        )}
      </div>

      {showReportModal && (
        <div id="report-modal-wrapper" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#1f2937', padding: '30px', borderRadius: '12px', width: '90%', maxWidth: '450px', border: '1px solid #374151' }}>
            <h3 style={{ margin: '0 0 20px 0', color: '#f3f4f6', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <AlertTriangle size={24} color="#ef4444" />
              Report User
            </h3>
            
            <p style={{ color: '#9ca3af', marginBottom: '20px', fontSize: '0.9rem', lineHeight: '1.5' }}>
              Are you sure you want to report <strong>{activeChatUser?.username}</strong>? Our system will automatically capture a screenshot of your current chat for the moderation team to review.
            </p>

            <div style={{ marginBottom: '25px' }}>
              <label style={{ display: 'block', color: '#d1d5db', marginBottom: '8px', fontSize: '0.9rem' }}>Reason for reporting:</label>
              <select 
                value={reportReason} 
                onChange={(e) => setReportReason(e.target.value)}
                style={{ width: '100%', padding: '12px', background: '#111827', border: '1px solid #374151', color: '#f3f4f6', borderRadius: '8px', outline: 'none' }}
              >
                <option value="">Select a reason...</option>
                <option value="Harassment or bullying">Harassment or bullying</option>
                <option value="Inappropriate content">Inappropriate content</option>
                <option value="Spam or scams">Spam or scams</option>
                <option value="Impersonation">Impersonation</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button 
                onClick={() => setShowReportModal(false)}
                disabled={isSubmittingReport}
                style={{ padding: '10px 16px', background: 'transparent', border: '1px solid #4b5563', color: '#d1d5db', borderRadius: '8px', cursor: isSubmittingReport ? 'not-allowed' : 'pointer' }}
              >
                Cancel
              </button>
              <button 
                onClick={submitReport}
                disabled={isSubmittingReport || !reportReason}
                style={{ padding: '10px 16px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '8px', cursor: isSubmittingReport || !reportReason ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '8px', opacity: isSubmittingReport || !reportReason ? 0.7 : 1 }}
              >
                {isSubmittingReport ? 'Capturing & Submitting...' : 'Confirm Report'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
          70% { box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); }
          100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
        }
      `}</style>
      </div>
    </div>
  );
};

export default Messages;
