import React, { useState } from 'react';
import { X, Upload } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

const ContactSupportModal = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const [subject, setSubject] = useState('');
  const [issue, setIssue] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setError('Image must be less than 5MB');
        return;
      }
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!subject.trim() || !issue.trim()) {
      setError('Please fill in all fields');
      return;
    }

    setLoading(true);
    setError('');

    try {
      let imageUrl = '';
      const token = localStorage.getItem('token');

      if (imageFile) {
        // Upload image first
        const formData = new FormData();
        formData.append('file', imageFile);

        const uploadRes = await fetch(`${backendUrl}/api/upload`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          },
          body: formData
        });
        
        if (uploadRes.ok) {
          const uploadData = await uploadRes.json();
          if (uploadData.url) imageUrl = uploadData.url;
        } else {
          setLoading(false);
          setError('Failed to upload image. Please try again.');
          return;
        }
      }

      // Submit ticket
      const res = await fetch(`${backendUrl}/api/support`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ subject, message: issue, imageUrl })
      });

      if (res.ok) {
        setSuccess(true);
        setTimeout(() => {
          onClose();
          setSuccess(false);
          setSubject('');
          setIssue('');
          setImageFile(null);
          setImagePreview('');
        }, 2000);
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to submit ticket');
      }
    } catch (err) {
      setError('Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content support-modal">
        <div className="modal-header">
          <h2>Contact Support</h2>
          <button className="icon-btn" onClick={onClose}><X size={20} color="#fff" /></button>
        </div>
        
        {success ? (
          <div className="support-success">
            <h3>Ticket Submitted Successfully!</h3>
            <p>Our team will look into your issue soon.</p>
          </div>
        ) : (
          <form className="support-form" onSubmit={handleSubmit}>
            {error && <div className="error-text">{error}</div>}
            
            <div className="form-group">
              <label>Subject</label>
              <input 
                type="text" 
                value={subject} 
                onChange={e => setSubject(e.target.value)} 
                className="auth-input"
                placeholder="Brief summary of issue"
                disabled={loading}
              />
            </div>
            
            <div className="form-group">
              <label>Issue Description</label>
              <textarea 
                value={issue} 
                onChange={e => setIssue(e.target.value)} 
                className="auth-input"
                rows="4"
                placeholder="Provide detailed description..."
                disabled={loading}
              ></textarea>
            </div>

            <div className="form-group">
              <label>Attachment (Optional, Image only)</label>
              <div className="upload-area">
                <input 
                  type="file" 
                  accept="image/*" 
                  id="ticket-image" 
                  onChange={handleImageChange}
                  disabled={loading}
                  style={{display: 'none'}}
                />
                <label htmlFor="ticket-image" className="upload-btn-label">
                  <Upload size={16} /> Choose Image
                </label>
                {imageFile && <span className="file-name">{imageFile.name}</span>}
              </div>
              {imagePreview && (
                <div className="image-preview-container">
                  <img src={imagePreview} alt="Preview" className="ticket-img-preview" />
                  <button type="button" className="remove-img-btn" onClick={() => {setImagePreview(''); setImageFile(null);}}>
                    <X size={14} />
                  </button>
                </div>
              )}
            </div>

            <button type="submit" className="btn-gradient" disabled={loading}>
              {loading ? 'Submitting...' : 'Submit Ticket'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default ContactSupportModal;
