import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import LandingPage from './components/LandingPage.tsx';
import { LAUNCH_URL } from './constants.ts';

const Root: React.FC = () => {
  const [started, setStarted] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('cinesynth-started') === 'true';
    }
    return false;
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('cinesynth-started', started ? 'true' : 'false');
    }
  }, [started]);

  const handleGetStarted = () => {
    if (LAUNCH_URL) {
      window.location.href = LAUNCH_URL;
    } else {
      setStarted(true);
    }
  };

  const handleBackToLanding = () => {
    setStarted(false);
  };

  return started ? (
    <App onBackToLanding={handleBackToLanding} />
  ) : (
    <LandingPage onGetStarted={handleGetStarted} />
  );
};

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find root element to mount to');
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
