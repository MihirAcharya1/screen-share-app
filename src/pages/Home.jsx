import React, { useState } from 'react';
import HostPage from './HostPage';
import ViewerPage from './ViewerPage';
import './Home.css';

const Home = () => {
  const [host, setHost] = useState(false);
  const [viewer, setViewer] = useState(false);

  return (
    <div className="home-container">
      <h1 className="home-title">Welcome to Screen Sharing App</h1>

      {!host && !viewer ? (
        <div className="home-buttons">
          <button className="button primary" onClick={() => setHost(true)}>Host</button>
          <button className="button secondary" onClick={() => setViewer(true)}>Viewer</button>
        </div>
      ) : (
        <div className="home-buttons">
          <button className="button danger" onClick={() => {
            setHost(false);
            setViewer(false);
          }}>Back</button>
        </div>
      )}

      {host && <HostPage />}
      {viewer && <ViewerPage />}
    </div>
  );
};

export default Home;
