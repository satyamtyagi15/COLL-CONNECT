import React, { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext();

export const useToast = () => useContext(ToastContext);

export const ToastProvider = ({ children }) => {
  const [toastMessage, setToastMessage] = useState('');
  const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, message: '', onConfirm: null });

  const showToast = useCallback((msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  }, []);

  const showConfirm = useCallback((message, onConfirm) => {
    setConfirmDialog({
      isOpen: true,
      message,
      onConfirm
    });
  }, []);

  const closeConfirm = useCallback(() => {
    setConfirmDialog({ isOpen: false, message: '', onConfirm: null });
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, showConfirm }}>
      {children}
      
      {/* Toast Notification */}
      {toastMessage && (
        <div style={{
          position: 'fixed', 
          bottom: '24px', 
          left: '50%', 
          transform: 'translateX(-50%)', 
          backgroundColor: 'rgba(31, 41, 55, 0.95)', 
          backdropFilter: 'blur(8px)',
          color: '#f3f4f6', 
          padding: '12px 24px', 
          borderRadius: '12px', 
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)', 
          zIndex: 9999, 
          border: '1px solid #4b5563', 
          display: 'flex', 
          alignItems: 'center', 
          gap: '12px',
          animation: 'slideUpFade 0.3s ease-out forwards'
        }}>
          <div style={{width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981', boxShadow: '0 0 8px #10b981'}}></div>
          <span style={{fontWeight: 500, fontSize: '0.95rem'}}>{toastMessage}</span>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmDialog.isOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000
        }}>
          <div style={{
            backgroundColor: '#1f2937', padding: '24px', borderRadius: '12px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.5)', border: '1px solid #374151',
            maxWidth: '400px', width: '90%', textAlign: 'center',
            animation: 'slideUpFade 0.3s ease-out'
          }}>
            <h3 style={{color: '#f3f4f6', fontSize: '1.2rem', marginBottom: '16px', fontWeight: '600'}}>Confirm Action</h3>
            <p style={{color: '#d1d5db', marginBottom: '24px'}}>{confirmDialog.message}</p>
            <div style={{display: 'flex', justifyContent: 'center', gap: '16px'}}>
              <button onClick={closeConfirm} 
                style={{padding: '8px 24px', borderRadius: '8px', backgroundColor: '#374151', color: '#f3f4f6', border: 'none', cursor: 'pointer', fontWeight: '500'}}>
                Cancel
              </button>
              <button onClick={() => {
                if (confirmDialog.onConfirm) confirmDialog.onConfirm();
                closeConfirm();
              }} style={{padding: '8px 24px', borderRadius: '8px', backgroundColor: '#ef4444', color: 'white', border: 'none', cursor: 'pointer', fontWeight: '500'}}>
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
};
