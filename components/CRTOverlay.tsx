import React from 'react';

const CRTOverlay: React.FC = () => {
  return (
    <div className="pointer-events-none absolute inset-0 z-50 overflow-hidden h-full w-full">
      {/* Scanlines */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] z-10 bg-[length:100%_2px,3px_100%] pointer-events-none"></div>
      
      {/* Vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_50%,rgba(0,0,0,0.4)_100%)] z-20 pointer-events-none"></div>
    </div>
  );
};

export default CRTOverlay;