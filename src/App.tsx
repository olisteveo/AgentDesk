import type { FC } from 'react';
import OfficeCanvas from './components/OfficeCanvas';
import PixelOffice from './components/PixelOffice';
import { useState } from 'react';
import './App.css';

const App: FC = () => {
  const [showPixelArt, setShowPixelArt] = useState(false);
  const [isPro, setIsPro] = useState(false);

  return (
    <div className="app">
      <div className="mode-toggle">
        <button 
          className={!showPixelArt ? 'active' : ''} 
          onClick={() => setShowPixelArt(false)}
        >
          Full App
        </button>
        <button 
          className={showPixelArt ? 'active' : ''} 
          onClick={() => setShowPixelArt(true)}
        >
          Pixel Art Preview
        </button>
        <div className="tier-toggle">
          <button 
            className={!isPro ? 'active' : ''} 
            onClick={() => setIsPro(false)}
          >
            Free
          </button>
          <button 
            className={isPro ? 'active' : ''} 
            onClick={() => setIsPro(true)}
          >
            Pro
          </button>
        </div>
      </div>
      
      {showPixelArt ? (
        <div className="pixel-preview">
          <PixelOffice isPro={isPro} />
        </div>
      ) : (
        <OfficeCanvas />
      )}
    </div>
  );
};

export default App;