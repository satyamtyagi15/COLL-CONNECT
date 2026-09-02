import React, { useState, useEffect, useCallback } from 'react';
import { useSocket } from '../../contexts/SocketContext';
import { useToast } from '../../contexts/ToastContext';
import ImageModal from '../ImageModal';

const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

const SupportTickets = () => {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState(null);
  const { socket } = useSocket();
  const { showConfirm } = useToast();

  const fetchTickets = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${backendUrl}/api/support`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setTickets(await res.json());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  useEffect(() => {
    if (socket) {
      socket.on('refresh-support-tickets', fetchTickets);
    }
    return () => {
      if (socket) socket.off('refresh-support-tickets', fetchTickets);
    };
  }, [socket, fetchTickets]);

  const resolveTicket = async (id) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${backendUrl}/api/support/${id}/resolve`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) fetchTickets();
    } catch (err) {
      console.error(err);
    }
  };

  const performDismiss = async (id) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${backendUrl}/api/support/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) fetchTickets();
    } catch (err) {
      console.error(err);
    }
  };

  const dismissTicket = (id) => {
    showConfirm('Are you sure you want to delete this ticket?', () => performDismiss(id));
  };

  return (
    <div className="manage-users-container">
      <h2>Support Tickets</h2>
      {loading ? <p style={{color: '#9ca3af'}}>Loading tickets...</p> : tickets.length === 0 ? (
        <p style={{color: '#9ca3af'}}>No support tickets found.</p>
      ) : (
        <div className="ticket-list">
          {tickets.map(ticket => (
            <div key={ticket._id} className={`ticket-card ${ticket.status === 'resolved' ? 'resolved' : ''}`} style={{flexShrink: 0}}>
              <div className="ticket-header">
                <div>
                  <span className="ticket-subject">{ticket.subject}</span>
                  <span className={`badge ${ticket.status === 'resolved' ? 'badge-user' : 'badge-admin'}`}>
                    {ticket.status.toUpperCase()}
                  </span>
                </div>
                <div className="ticket-date">{new Date(ticket.createdAt).toLocaleString()}</div>
              </div>
              <div className="ticket-meta">
                From: <strong>{ticket.username}</strong> ({ticket.email})
              </div>
              <div className="ticket-body">
                <p className="custom-scrollbar" style={{margin: 0, color: '#e5e7eb', fontSize: '0.9rem', whiteSpace: 'pre-wrap', lineHeight: '1.4', wordBreak: 'break-word', overflowWrap: 'break-word', maxHeight: '150px', overflowY: 'auto', overflowX: 'hidden', width: '100%', maxWidth: '100%', minWidth: 0, paddingRight: '5px', display: 'block', flexShrink: 0}}>
                  {ticket.message}
                </p>
                {ticket.imageUrl && (
                  <div className="announcement-image-wrapper" onClick={() => setSelectedImage(ticket.imageUrl)} style={{cursor: 'pointer', marginTop: '10px'}}>
                    <img src={ticket.imageUrl} alt="Attachment" className="announcement-image" style={{maxHeight: '200px', objectFit: 'cover', width: '100%', borderRadius: '8px'}} />
                    <div style={{textAlign: 'center', fontSize: '0.8rem', color: '#9ca3af', marginTop: '4px'}}>Tap to view full image</div>
                  </div>
                )}
              </div>
              <div className="ticket-actions mt-2" style={{display: 'flex', gap: '10px'}}>
                {ticket.status !== 'resolved' && (
                  <button className="btn-action btn-blue" onClick={() => resolveTicket(ticket._id)}>Mark as Resolved</button>
                )}
                <button className="btn-action btn-red" onClick={() => dismissTicket(ticket._id)}>
                  {ticket.status === 'resolved' ? 'Delete Ticket Data' : 'Dismiss Invalid Ticket'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <ImageModal imageUrl={selectedImage} onClose={() => setSelectedImage(null)} />
    </div>
  );
};

export default SupportTickets;
