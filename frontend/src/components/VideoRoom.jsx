import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useSocket } from '../contexts/SocketContext';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useNavigate, useLocation } from 'react-router-dom';
import EmojiPicker from 'emoji-picker-react';
import html2canvas from 'html2canvas';
import { Smile, Send } from 'lucide-react';

const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

const VideoRoom = () => {
  const { socket } = useSocket();
  const { user, globalProfileData } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  
  const [partnerConnected, setPartnerConnected] = useState(false);
  const [partnerUsername, setPartnerUsername] = useState('');
  const [partnerRole, setPartnerRole] = useState('USER');
  const [partnerBlurred, setPartnerBlurred] = useState(true);

  const location = useLocation();
  const interestedIn = location.state?.interestedIn || 'Any';
  const myGender = globalProfileData?.gender && globalProfileData.gender !== 'Not Specified' ? globalProfileData.gender : 'Any';
  const hasStartedSearching = useRef(false);

  const [mediaError, setMediaError] = useState(false);
  
  // Local controls state
  const [micOn, setMicOn] = useState(true);
  const [videoOn, setVideoOn] = useState(true);
  const [isBlurred, setIsBlurred] = useState(true);

  // Report System States
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);

  // Friend status: 'none', 'sent', 'received', 'friends'
  const [friendStatus, setFriendStatus] = useState('none');

  // Ad banner state
  const [showAd, setShowAd] = useState(true);

  // Chat height state
  const [chatHeight, setChatHeight] = useState(250);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const chatMessagesRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const emojiPickerRef = useRef(null);

  // Swipe logic
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);
  const minSwipeDistance = 50;

  const onTouchStartEvent = (e) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMoveEvent = (e) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEndEvent = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    if (distance > minSwipeDistance || distance < -minSwipeDistance) {
      handleNext();
    }
  };

  // Close emoji picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target)) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Stop media tracks when leaving the page
  useEffect(() => {
    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
      }
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }
      if (socket) {
        socket.emit('skip');
      }
    };
  }, [socket]);

  // Request camera access on mount
  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then((stream) => {
        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      })
      .catch(err => {
        console.error("Media error:", err);
        setMediaError(true);
      });
  }, []);

  const createPeerConnection = useCallback(() => {
    if (peerConnectionRef.current) peerConnectionRef.current.close();
    
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });
    peerConnectionRef.current = pc;

    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit('ice-candidate', event.candidate);
      }
    };

    pc.ontrack = (event) => {
      if (remoteVideoRef.current && event.streams[0]) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current);
      });
    }
  }, [socket]);

  useEffect(() => {
    if (!socket) return;

    socket.on('partner-found', () => {
      setPartnerConnected(true);
      setShowAd(false);
      setMessages([{ text: "You're now chatting with stranger.", system: true }]);
      setPartnerBlurred(true);
      setFriendStatus('none');
    });

    socket.on('partner-username', (data) => {
      setPartnerUsername(data.username);
      setPartnerRole(data.role || 'user');
      setMessages([{ text: `You're now chatting with ${data.username}.`, system: true }]);
    });

    socket.on('chat-message', (msg) => {
      setMessages(prev => [...prev, { text: msg, sender: 'stranger' }]);
      scrollToBottom();
    });

    socket.on('blur-state-change', (blurred) => {
      setPartnerBlurred(blurred);
    });

    socket.on('friend-request-received', (fromUsername) => {
      if (partnerUsername === fromUsername || partnerConnected) {
        setFriendStatus('received');
        showToast(`${fromUsername} sent you a friend request!`);
      }
    });

    socket.on('friend-request-accepted', (fromUsername) => {
      if (partnerUsername === fromUsername || partnerConnected) {
        setFriendStatus('friends');
        showToast(`You and ${fromUsername} are now friends!`);
      }
    });

    socket.on('friend-request-declined', (fromUsername) => {
      if (partnerUsername === fromUsername || partnerConnected) {
        setFriendStatus('none');
        showToast(`${fromUsername} declined your friend request.`);
      }
    });

    socket.on('initiate-offer', async () => {
      createPeerConnection();
      try {
        const offer = await peerConnectionRef.current.createOffer();
        await peerConnectionRef.current.setLocalDescription(offer);
        socket.emit('offer', offer);
      } catch (err) { console.error(err); }
    });

    socket.on('offer', async (offer) => {
      createPeerConnection();
      try {
        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnectionRef.current.createAnswer();
        await peerConnectionRef.current.setLocalDescription(answer);
        socket.emit('answer', answer);
      } catch (err) { console.error(err); }
    });

    socket.on('answer', async (answer) => {
      if (peerConnectionRef.current && peerConnectionRef.current.signalingState !== 'stable') {
        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
      }
    });

    socket.on('ice-candidate', async (candidate) => {
      if (peerConnectionRef.current) {
        await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      }
    });

    socket.on('partner-disconnected', () => {
      handlePartnerDisconnect();
    });

    const handleRoleChanged = (data) => {
      if (data.username?.toLowerCase() === partnerUsername?.toLowerCase()) {
        setPartnerRole(data.newRole || data.role || 'user');
      }
    };

    socket.on('user-role-changed', handleRoleChanged);
    socket.on('user-promoted', handleRoleChanged);
    socket.on('user-demoted', handleRoleChanged);

    return () => {
      socket.off('partner-found');
      socket.off('partner-username');
      socket.off('chat-message');
      socket.off('blur-state-change');
      socket.off('friend-request-received');
      socket.off('friend-request-accepted');
      socket.off('friend-request-declined');
      socket.off('initiate-offer');
      socket.off('offer');
      socket.off('answer');
      socket.off('ice-candidate');
      socket.off('partner-disconnected');
      socket.off('user-role-changed', handleRoleChanged);
      socket.off('user-promoted', handleRoleChanged);
      socket.off('user-demoted', handleRoleChanged);
    };
  }, [socket, createPeerConnection, partnerConnected, partnerUsername, showToast]);

  const handlePartnerDisconnect = () => {
    setPartnerConnected(false);
    setPartnerUsername('');
    setPartnerRole('USER');
    setFriendStatus('none');
    setShowAd(true);
    setMessages([{ text: 'Stranger has disconnected.', system: true }]);
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
  };

  const handleNext = useCallback(() => {
    if (socket && user) {
      socket.emit('skip');
      handlePartnerDisconnect();
      setMessages([{ text: 'Looking for a stranger...', system: true }]);
      socket.emit('find-partner', { myGender, interestedIn, username: user.username, role: user.role });
    }
  }, [socket, user, myGender, interestedIn]);

  useEffect(() => {
    if (socket && user && !hasStartedSearching.current) {
      hasStartedSearching.current = true;
      handleNext();
    }
  }, [socket, user, handleNext]);

  const handleStop = () => {
    if (socket) {
      socket.emit('skip');
      handlePartnerDisconnect();
      setMessages([{ text: 'You have disconnected.', system: true }]);
    }
    navigate('/');
  };

  const handleReportClick = () => {
    if (!partnerConnected) {
      showToast("You are not connected to anyone to report.");
      return;
    }
    if (partnerRole === 'superadmin') {
      showToast("Superadmins cannot be reported.");
      return;
    }
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
      const localVideo = localVideoRef.current;
      const remoteVideo = remoteVideoRef.current;
      const localWasBlurred = localVideo?.classList.contains('blurred-video');
      const remoteWasBlurred = remoteVideo?.classList.contains('blurred-video');
      
      if (localVideo) localVideo.classList.remove('blurred-video');
      if (remoteVideo) remoteVideo.classList.remove('blurred-video');
      
      await new Promise(resolve => setTimeout(resolve, 100));

      const chatArea = document.querySelector('.video-room-container') || document.body;
      const canvas = await html2canvas(chatArea, { 
        useCORS: true, 
        allowTaint: false,
        ignoreElements: (element) => element.id === 'report-modal-wrapper'
      });
      screenshotData = canvas.toDataURL('image/jpeg', 0.6);

      if (localWasBlurred && localVideo) localVideo.classList.add('blurred-video');
      if (remoteWasBlurred && remoteVideo) remoteVideo.classList.add('blurred-video');
    } catch (err) {
      console.error('Failed to capture screenshot', err);
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
          reportedUser: partnerUsername,
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

  // Keyboard shortcut for Next (Spacebar)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'SELECT') {
        e.preventDefault();
        handleNext();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [socket, user, myGender, interestedIn, partnerConnected]); // Dependencies for handleNext

  const toggleMic = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !micOn;
      });
      setMicOn(!micOn);
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach(track => {
        track.enabled = !videoOn;
      });
      setVideoOn(!videoOn);
    }
  };

  const toggleBlur = () => {
    const newBlurState = !isBlurred;
    setIsBlurred(newBlurState);
    if (socket && partnerConnected) {
      socket.emit('blur-state-change', newBlurState);
    }
  };

  const scrollToBottom = () => {
    if (chatMessagesRef.current) {
      setTimeout(() => {
        chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight;
      }, 50);
    }
  };

  const sendMessage = (e) => {
    e.preventDefault();
    if (inputMessage.trim() && partnerConnected) {
      socket.emit('chat-message', inputMessage);
      setMessages(prev => [...prev, { text: inputMessage, sender: 'self' }]);
      setInputMessage('');
      setShowEmojiPicker(false);
      scrollToBottom();
    }
  };

  const onEmojiClick = (emojiObject) => {
    setInputMessage(prevInput => prevInput + emojiObject.emoji);
  };

  // Friend Request Functions
  const sendFriendRequest = async () => {
    if (!partnerUsername) return;
    try {
      const res = await fetch(`${backendUrl}/api/friend-request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ targetUsername: partnerUsername })
      });
      const data = await res.json();
      if (res.ok) {
        setFriendStatus('sent');
        showToast('Friend request sent!');
      } else {
        showToast(data.error || 'Failed to send request', 'error');
      }
    } catch (err) { console.error(err); }
  };

  const acceptFriendRequest = async () => {
    if (!partnerUsername) return;
    try {
      const res = await fetch(`${backendUrl}/api/friend-accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ targetUsername: partnerUsername })
      });
      if (res.ok) {
        setFriendStatus('friends');
        showToast(`You and ${partnerUsername} are now friends!`);
      }
    } catch (err) { console.error(err); }
  };

  const declineFriendRequest = async () => {
    if (!partnerUsername) return;
    try {
      const res = await fetch(`${backendUrl}/api/friend-decline`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ targetUsername: partnerUsername })
      });
      if (res.ok) {
        setFriendStatus('none');
        showToast('Request declined.');
      }
    } catch (err) { console.error(err); }
  };

  const handleReport = () => {
    if (!partnerUsername) return;
    // Assuming Report Modal triggers somehow, could pass via context or state
    // Let's use a simple prompt for now, or you can implement the full screenshot logic if needed
    const reason = window.prompt(`Report ${partnerUsername} for what reason?`);
    if (reason && socket) {
      socket.emit('report-user', { reason, partnerUsername, screenshot: null });
      showToast('Report submitted successfully.');
    }
  };

  return (
    <div className="video-room-container">
      <div className="video-section">
        <div className="video-grid">
          {/* Local Video Box (Left) */}
          <div className="video-box local-video">
            <div className="user-badge">
              <span style={{ fontSize: '0.85rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                {user?.username}
                {user?.role && (
                  <span className={`badge badge-${user.role.toLowerCase()}`}>
                    {user.role.toUpperCase()}
                  </span>
                )}
              </span>
            </div>
            {mediaError ? (
              <div className="video-error-text">
                Camera/Microphone Error.<br/>Check permissions.
              </div>
            ) : (
              <video 
                ref={localVideoRef} 
                autoPlay 
                playsInline 
                muted 
                className={isBlurred ? 'blurred-video' : ''}
              />
            )}
          </div>

          {/* Remote Video Box (Right) */}
          <div 
            className="video-box remote-video"
            onTouchStart={onTouchStartEvent}
            onTouchMove={onTouchMoveEvent}
            onTouchEnd={onTouchEndEvent}
          >
            {!partnerConnected ? (
              <div className="waiting-overlay">
                <div className="spinner"></div>
                <div className="waiting-text">
                  <h3>Chatting with Stranger</h3>
                  <p>Looking for a stranger...</p>
                </div>
              </div>
            ) : (
              <>
                <div className="user-badge">
                  <span style={{ fontSize: '0.85rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {partnerUsername || 'Waiting...'} 
                    {partnerConnected && (
                      <span className={`badge badge-${partnerRole.toLowerCase()}`}>
                        {partnerRole.toUpperCase()}
                      </span>
                    )}
                  </span>
                </div>
                <video 
                  ref={remoteVideoRef} 
                  autoPlay 
                  playsInline 
                  className={partnerBlurred ? 'blurred-video' : ''}
                />
              </>
            )}
          </div>
        </div>



        {/* Controls Row */}
        <div className="video-controls">
          <button 
            className={`control-btn ${micOn ? 'btn-purple' : 'btn-red'}`} 
            onClick={toggleMic}
          >
            {micOn ? 'MIC ON' : 'MIC OFF'}
          </button>
          
          <button 
            className={`control-btn ${videoOn ? 'btn-purple' : 'btn-red'}`} 
            onClick={toggleVideo}
          >
            {videoOn ? 'VIDEO ON' : 'VIDEO OFF'}
          </button>
          
          <button 
            className={`control-btn ${isBlurred ? 'btn-red' : 'btn-purple'}`} 
            onClick={toggleBlur}
          >
            {isBlurred ? 'UNBLUR FACE' : 'BLUR FACE'}
          </button>

          {/* Friend Request Logic */}
          {partnerConnected && partnerUsername && user?.role?.toLowerCase() !== 'superadmin' && partnerRole?.toLowerCase() !== 'superadmin' && (
            <>
              {friendStatus === 'none' && (
                <button className="control-btn btn-yellow" onClick={sendFriendRequest}>ADD FRIEND</button>
              )}
              {friendStatus === 'sent' && (
                <button className="control-btn btn-gray" disabled>REQUEST SENT</button>
              )}
              {friendStatus === 'received' && (
                <>
                  <button className="control-btn btn-blue" onClick={acceptFriendRequest}>ACCEPT REQUEST</button>
                  <button className="control-btn btn-red" onClick={declineFriendRequest}>DECLINE</button>
                </>
              )}
              {friendStatus === 'friends' && (
                <button className="control-btn btn-green" disabled>FRIENDS</button>
              )}
            </>
          )}

          <button className="control-btn btn-red" onClick={handleReportClick}>REPORT</button>
          <button className="control-btn btn-red" onClick={handleStop}>STOP</button>
          <button className="control-btn btn-purple" onClick={handleNext}>NEXT (SPACE)</button>
        </div>
      </div>

      {/* Chat Section */}
      <div className="chat-section" style={{ height: `${chatHeight}px` }}>
        <div className="chat-resizer">
          <label>Chat Size: </label>
          <input 
            type="range" 
            min="150" 
            max="600" 
            value={chatHeight} 
            onChange={(e) => setChatHeight(e.target.value)}
            style={{ width: '150px' }}
          />
        </div>
        {showAd ? (
          <div className="ad-banner">
            <p>Google Ads Placeholder</p>
            <span>Advertisement</span>
          </div>
        ) : (
          <div className="chat-messages" ref={chatMessagesRef}>
            {messages.map((msg, idx) => (
              msg.system ? (
                <div key={idx} className="system-msg">{msg.text}</div>
              ) : (
                <div key={idx} className={`chat-msg ${msg.sender}`}>
                  <span className="msg-bubble">{msg.text}</span>
                </div>
              )
            ))}
          </div>
        )}
        
        <form className="chat-input-area" style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '10px' }} onSubmit={sendMessage}>
          <div style={{ position: 'relative' }} ref={emojiPickerRef}>
            <button type="button" onClick={() => setShowEmojiPicker(!showEmojiPicker)} style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: '8px', borderRadius: '50%', transition: 'background 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onMouseEnter={(e) => e.currentTarget.style.background = '#374151'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'} title="Emojis">
              <Smile size={20} />
            </button>
            {showEmojiPicker && (
              <div style={{ position: 'absolute', bottom: '50px', left: '0', zIndex: 1000, boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}>
                <EmojiPicker onEmojiClick={onEmojiClick} theme="dark" />
              </div>
            )}
          </div>
          <button type="button" className="icon-btn gif-btn">GIF</button>
          <input
            type="text"
            className="chat-input"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            placeholder="Type a message..."
            disabled={!partnerConnected}
            style={{ width: '100%', padding: '12px 16px', borderRadius: '24px', border: '1px solid #4b5563', background: '#111827', color: '#f3f4f6', outline: 'none' }}
          />
          <button type="submit" disabled={!inputMessage.trim() || !partnerConnected} style={{ background: inputMessage.trim() && partnerConnected ? '#3b82f6' : '#374151', border: 'none', color: inputMessage.trim() && partnerConnected ? '#fff' : '#6b7280', cursor: inputMessage.trim() && partnerConnected ? 'pointer' : 'default', width: '40px', height: '40px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.2s', flexShrink: 0 }}>
            <Send size={18} style={{ marginLeft: '2px' }} />
          </button>
        </form>
      </div>

      {showReportModal && (
        <div id="report-modal-wrapper" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: '#1f2937', padding: '24px', borderRadius: '12px', width: '90%', maxWidth: '400px', border: '1px solid #374151' }}>
            <h3 style={{ margin: '0 0 16px 0', color: '#f3f4f6' }}>Report User</h3>
            <textarea
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              placeholder="Please provide details about the violation..."
              style={{ width: '100%', height: '100px', padding: '12px', borderRadius: '8px', border: '1px solid #4b5563', background: '#111827', color: '#f3f4f6', resize: 'none', marginBottom: '16px', boxSizing: 'border-box' }}
            />
            <p style={{ fontSize: '0.8rem', color: '#9ca3af', marginBottom: '16px' }}>* A screenshot of the chat and video will be securely sent with this report for review.</p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button 
                onClick={() => setShowReportModal(false)}
                style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: '#374151', color: '#f3f4f6', cursor: 'pointer' }}
                disabled={isSubmittingReport}
              >Cancel</button>
              <button 
                onClick={submitReport}
                style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: '#ef4444', color: '#fff', cursor: 'pointer', opacity: isSubmittingReport ? 0.7 : 1 }}
                disabled={isSubmittingReport}
              >
                {isSubmittingReport ? 'Submitting...' : 'Submit Report'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoRoom;
