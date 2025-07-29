// src/App.js
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import HostPage from './pages/HostPage';
import ViewerPage from './pages/ViewerPage';
import Home from './pages/Home';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/host" element={<HostPage />} />
        <Route path="/viewer" element={<ViewerPage />} />
        <Route path="*" element={<div>404 Not Found</div>} />
      </Routes>
    </Router>
  );
}

export default App;
