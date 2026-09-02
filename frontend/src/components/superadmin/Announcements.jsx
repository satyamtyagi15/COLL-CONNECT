import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useSocket } from '../../contexts/SocketContext';
import { useToast } from '../../contexts/ToastContext';
import { Image as ImageIcon } from 'lucide-react';
import ImageModal from '../ImageModal';

const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

const Announcements = () => {
  const [announcements, setAnnouncements] = useState([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const { socket } = useSocket();
  const { showToast, showConfirm } = useToast();

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  useEffect(() => {
    if (socket) {
      socket.on('new-announcement', (ann) => {
        setAnnouncements(prev => [ann, ...prev]);
      });
      socket.on('delete-announcement', (id) => {
        setAnnouncements(prev => prev.filter(a => a._id !== id));
      });
    }
    return () => {
      if (socket) {
        socket.off('new-announcement');
        socket.off('delete-announcement');
      }
    }
  }, [socket]);

  const fetchAnnouncements = async () => {
    try {
      const res = await fetch(`${backendUrl}/api/announcements`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) setAnnouncements(await res.json());
    } catch (err) {
      console.error(err);
    }
  };

  const handleImageChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 5 * 1024 * 1024) return showToast('Image must be less than 5MB');
      
      setImageFile(file);
      const reader = new FileReader();
      reader.onload = (ev) => setImagePreview(ev.target.result);
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title || !content) return showToast('Title and content are required');
    setLoading(true);
    
    try {
      let imageUrl = '';
      if (imageFile) {
        const formData = new FormData();
        formData.append('file', imageFile);

        const uploadRes = await fetch(`${backendUrl}/api/upload`, {
          method: 'POST',
          body: formData
        });
        
        if (uploadRes.ok) {
          const uploadData = await uploadRes.json();
          imageUrl = uploadData.url;
        } else {
          setLoading(false);
          return showToast('Failed to upload image. Please try again or check Cloudinary keys.');
        }
      }

      const res = await fetch(`${backendUrl}/api/announcements`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ title, content, imageUrl })
      });
      
      if (res.ok) {
        setTitle('');
        setContent('');
        setImageFile(null);
        setImagePreview('');
        // fetchAnnouncements(); // No longer need to fetch, socket handles it
        showToast('Announcement sent to all users!');
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to send announcement');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const performDelete = async (id) => {
    try {
      const res = await fetch(`${backendUrl}/api/announcements/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      // if (res.ok) fetchAnnouncements(); // Handled by socket
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = (id) => {
    showConfirm('Are you sure you want to delete this announcement?', () => performDelete(id));
  };

  return (
    <div className="manage-users-container">
      <h2>Announcements Hub</h2>
      <p style={{color: '#9ca3af', marginBottom: '20px'}}>Broadcast system-wide messages to all registered users.</p>

      <form className="auth-form" onSubmit={handleSubmit} style={{maxWidth: '600px', marginBottom: '40px', background: '#1f2937', padding: '20px', borderRadius: '12px', border: '1px solid #374151'}}>
        <div className="form-group" style={{marginBottom: '15px'}}>
          <label style={{color: '#d1d5db', marginBottom: '5px', display: 'block'}}>Announcement Title</label>
          <input 
            type="text" 
            placeholder="e.g. Scheduled Maintenance" 
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="auth-input"
            style={{width: '100%', boxSizing: 'border-box'}}
          />
        </div>
        
        <div className="form-group" style={{marginBottom: '15px'}}>
          <label style={{color: '#d1d5db', marginBottom: '5px', display: 'block'}}>Detailed Message</label>
          <textarea 
            placeholder="Write your long announcement here..." 
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="auth-input"
            style={{minHeight: '150px', resize: 'vertical', width: '100%', boxSizing: 'border-box'}}
          />
        </div>

        <div className="form-group" style={{marginBottom: '20px'}}>
          <label style={{color: '#d1d5db', marginBottom: '5px', display: 'block'}}>Attach Image (Optional)</label>
          <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
            <label style={{cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', padding: '8px 12px', background: '#374151', borderRadius: '6px', color: '#e5e7eb'}}>
              <ImageIcon size={18} />
              <span>Choose Image</span>
              <input type="file" accept="image/*" style={{display: 'none'}} onChange={handleImageChange} />
            </label>
            {imagePreview && <span style={{color: '#10b981', fontSize: '0.9rem'}}>Image Selected ✓</span>}
          </div>
          {imagePreview && (
            <div style={{marginTop: '10px'}}>
              <img src={imagePreview} alt="Preview" style={{maxHeight: '100px', borderRadius: '8px', border: '1px solid #4b5563'}} />
            </div>
          )}
        </div>

        <button type="submit" className="btn-gradient" disabled={loading} style={{width: '100%', padding: '12px', fontSize: '1rem', fontWeight: 'bold'}}>
          {loading ? 'BROADCASTING...' : 'BROADCAST ANNOUNCEMENT'}
        </button>
      </form>

      <h3 className="section-heading blue-heading">Past Announcements</h3>
      <div className="user-list" style={{maxHeight: '600px', overflowY: 'auto', paddingRight: '10px'}}>
        {announcements.length === 0 ? <p style={{color: '#9ca3af'}}>No announcements yet.</p> : announcements.map(ann => (
          <div key={ann._id} className="user-card" style={{display: 'flex', flexDirection: 'column', wordWrap: 'break-word', borderLeft: '4px solid #ef4444', flexShrink: 0}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%', wordBreak: 'break-word'}}>
              <h4 style={{margin: '0 0 10px 0', color: '#60a5fa', wordBreak: 'break-word', paddingRight: '10px'}}>{ann.title}</h4>
              <button className="btn-action btn-red" onClick={() => handleDelete(ann._id)} style={{padding: '4px 8px', flexShrink: 0}}>Delete</button>
            </div>
            {ann.imageUrl && (
              <div className="announcement-image-wrapper" onClick={() => setSelectedImage(ann.imageUrl)} style={{cursor: 'pointer'}}>
                <img src={ann.imageUrl} alt="Announcement" className="announcement-image" style={{maxHeight: '200px', objectFit: 'cover', width: '100%', borderRadius: '8px'}} />
                <div style={{textAlign: 'center', fontSize: '0.8rem', color: '#9ca3af', marginTop: '4px'}}>Tap to view full image</div>
              </div>
            )}
            <p className="custom-scrollbar" style={{margin: 0, color: '#e5e7eb', fontSize: '0.9rem', whiteSpace: 'pre-wrap', lineHeight: '1.4', wordBreak: 'break-word', overflowWrap: 'break-word', maxHeight: '150px', overflowY: 'auto', overflowX: 'hidden', width: '100%', maxWidth: '100%', minWidth: 0, paddingRight: '5px', display: 'block', flexShrink: 0}}>{ann.content}</p>
            <span style={{fontSize: '0.75rem', color: '#6b7280', marginTop: '10px'}}>{new Date(ann.timestamp).toLocaleString()}</span>
          </div>
        ))}
      </div>
      <ImageModal imageUrl={selectedImage} onClose={() => setSelectedImage(null)} />
    </div>
  );
};

export default Announcements;
