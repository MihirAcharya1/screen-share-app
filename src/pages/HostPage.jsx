import React, { useEffect, useRef, useState } from 'react';
import { socket } from '../socket';
import ViewerPage from './ViewerPage';

const peerConnections = {};

const HostPage = () => {
  const [isHost, setIshost] = useState(false);
  const [isView, setIsView] = useState(false);
  const videoRef = useRef(null);
  const [roomId, setRoomId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [stream, setStream] = useState(null);
  const [resolution, setResolution] = useState("3840x2160");
  const [viewers, setViewers] = useState([]);

  const isMobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  const createPC = (targetId) => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit('ice-candidate', { targetId, candidate: e.candidate });
      }
    };

    peerConnections[targetId] = pc;
    return pc;
  };

  const handleViewerJoined = async (viewerId) => {
    const pc = createPC(viewerId);
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('offer', { targetId: viewerId, sdp: offer });

    const sender = pc.getSenders().find(s => s.track.kind === 'video');
    if (sender) {
      const params = sender.getParameters();
      if (!params.encodings) params.encodings = [{}];
      params.encodings[0].maxBitrate = 50000000;
      await sender.setParameters(params);
    }
  };

  const startSharing = async () => {
    if (isMobile()) {
      setError("Screen sharing is not supported on mobile.");
      return;
    }

    socket.emit('create-room', { roomId, password });

    const [width, height] = resolution.split('x').map(Number);

    try {
      const mediaStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: width },
          height: { ideal: height },
          frameRate: { ideal: 60, max: 144 },
        },
        audio: true,
      });

      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      console.error(err);
      setError("Failed to start screen sharing.");
    }
  };

  const stopSharing = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
      socket.emit('host-stopped');

      Object.values(peerConnections).forEach(pc => pc.close());
      for (const id in peerConnections) delete peerConnections[id];

      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    }
  };

  // ✅ Setup socket handlers ONCE
  useEffect(() => {
    socket.on('viewer-joined', handleViewerJoined);

    socket.on('answer', ({ from, sdp }) => {
      peerConnections[from]?.setRemoteDescription(new RTCSessionDescription(sdp));
    });

    socket.on('ice-candidate', ({ from, candidate }) => {
      peerConnections[from]?.addIceCandidate(new RTCIceCandidate(candidate));
    });

    socket.on('update-viewers', setViewers);
    socket.on('error-message', setError);

    return () => {
      socket.off('viewer-joined', handleViewerJoined);
      socket.off('answer');
      socket.off('ice-candidate');
      socket.off('update-viewers');
      socket.off('error-message');
    };
  }, [stream]); // rebind when stream changes

  return (
    isHost ? (
      <div style={{ padding: '20px' }}>
        <button onClick={() => {
          setIshost(false);
          setIsView(false)
        }}>back</button>
        <h2>Host Screen</h2>
        <input placeholder="Room ID" value={roomId} onChange={e => setRoomId(e.target.value)} />
        <input placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} />
        <select value={resolution} onChange={e => setResolution(e.target.value)}>
          <option value="1280x720">720p</option>
          <option value="1920x1080">1080p</option>
          <option value="3840x2160">4K</option>
        </select>
        <button onClick={startSharing}>Start Sharing</button>
        {stream && (
          <button onClick={() => {
            const enabled = !audioEnabled;
            stream.getAudioTracks().forEach(t => t.enabled = enabled);
            setAudioEnabled(enabled);
          }}>
            {audioEnabled ? "Mute Audio" : "Unmute Audio"}
          </button>
        )}
        {stream && (
          <button onClick={stopSharing} className="bg-red-600 text-white px-4 py-2 rounded mt-4">
            🛑 Stop Sharing
          </button>
        )}
        {error && <p style={{ color: 'red' }}>{error}</p>}
        <video ref={videoRef} autoPlay playsInline muted style={{ width: "100%" }} />
        <ul>
          {viewers.map(id => <li key={id}>{id}</li>)}
        </ul>
      </div>) : isView ? (
        <div style={{ padding: '20px' }}>
          <button onClick={() => {
            setIshost(false);
            setIsView(false)
          }}>back</button>
          <ViewerPage />
        </div>
      ) : (
      <div style={{ padding: '20px' }}>

        <h2>Welcome to Screen Share App</h2>
        <button onClick={() => setIshost(true)}>Host Screen</button>
        <button onClick={() => setIsView(true)}>Join as Viewer</button>
      </div>
    )
  );
};

export default HostPage;
