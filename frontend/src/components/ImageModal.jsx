import React from 'react';
import { X } from 'lucide-react';

const ImageModal = ({ imageUrl, onClose }) => {
  if (!imageUrl) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      backgroundColor: 'rgba(0, 0, 0, 0.85)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 9999,
      backdropFilter: 'blur(5px)',
      padding: '20px',
      boxSizing: 'border-box'
    }} onClick={onClose}>
      <div style={{ position: 'relative', maxWidth: '90%', maxHeight: '90%' }}>
        <button 
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '-40px',
            right: 0,
            background: 'none',
            border: 'none',
            color: 'white',
            cursor: 'pointer',
            padding: '5px'
          }}
        >
          <X size={32} />
        </button>
        <img 
          src={imageUrl} 
          alt="Full screen" 
          style={{
            maxWidth: '100%',
            maxHeight: '85vh',
            objectFit: 'contain',
            borderRadius: '8px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.5)'
          }} 
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    </div>
  );
};

export default ImageModal;
