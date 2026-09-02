import React, { useState, useRef, useEffect } from 'react';
import ReactCrop, { centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { X } from 'lucide-react';
import '../index.css';

function centerAspectCrop(mediaWidth, mediaHeight, aspect) {
  return centerCrop(
    makeAspectCrop(
      {
        unit: '%',
        width: 90,
      },
      aspect,
      mediaWidth,
      mediaHeight
    ),
    mediaWidth,
    mediaHeight
  );
}

const ImageCropperModal = ({ isOpen, onClose, imageSrc, aspect, onCropComplete }) => {
  const [crop, setCrop] = useState();
  const [completedCrop, setCompletedCrop] = useState(null);
  const imgRef = useRef(null);

  useEffect(() => {
    if (!isOpen) {
      setCrop(undefined);
      setCompletedCrop(null);
    }
  }, [isOpen]);

  function onImageLoad(e) {
    if (aspect) {
      const { width, height } = e.currentTarget;
      setCrop(centerAspectCrop(width, height, aspect));
    }
  }

  const handleSave = async () => {
    if (completedCrop && imgRef.current) {
      const image = imgRef.current;
      const scaleX = image.naturalWidth / image.width;
      const scaleY = image.naturalHeight / image.height;

      const cropX = completedCrop.x * scaleX;
      const cropY = completedCrop.y * scaleY;
      const cropWidth = completedCrop.width * scaleX;
      const cropHeight = completedCrop.height * scaleY;

      onCropComplete({
        x: cropX,
        y: cropY,
        width: cropWidth,
        height: cropHeight
      });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" style={{zIndex: 9999}}>
      <div className="modal-content" style={{maxWidth: '600px', width: '90%', padding: '20px'}}>
        <div className="modal-header">
          <h3>Crop Image</h3>
          <button className="close-btn" onClick={onClose}><X size={24} color="#e0e0e0" /></button>
        </div>
        <div className="modal-body" style={{display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
          {imageSrc ? (
            <ReactCrop
              crop={crop}
              onChange={(_, percentCrop) => setCrop(percentCrop)}
              onComplete={(c) => setCompletedCrop(c)}
              aspect={aspect}
              circularCrop={aspect === 1} // if 1:1, show circle crop guide
            >
              <img
                ref={imgRef}
                alt="Crop me"
                src={imageSrc}
                onLoad={onImageLoad}
                style={{maxHeight: '60vh'}}
              />
            </ReactCrop>
          ) : (
            <p>Loading image...</p>
          )}
        </div>
        <div className="modal-footer" style={{marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '10px'}}>
          <button className="btn-cancel" onClick={onClose}>Cancel</button>
          <button className="btn-save" onClick={handleSave} disabled={!completedCrop?.width || !completedCrop?.height}>Apply Crop</button>
        </div>
      </div>
    </div>
  );
};

export default ImageCropperModal;
