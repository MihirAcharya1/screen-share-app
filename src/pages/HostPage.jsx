import React, { useEffect, useRef, useState } from 'react';
import { socket } from '../socket';
import './HostPage.css';

const peerConnections = {};

const HostPage = () => {
  const videoRef = useRef(null);
  const [roomId, setRoomId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [stream, setStream] = useState(null);
  const [resolution, setResolution] = useState('1280x720');
  const [viewers, setViewers] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);

  const isMobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  const createPC = (targetId) => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' },
      {
          urls: 'turn:10.74.173.210:3479',
          username: 'webrtc',
          credential: 'secret'
        }
      ],
    });

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit('ice-candidate', { targetId, candidate: e.candidate });
      }
    };

    peerConnections[targetId] = pc;
    return pc;
  };

  const filterToVp8Only = (sdp) => {
    const allowedPayloads = new Set(['96', '97']);
    const lines = sdp.split('\r\n');
    const filtered = [];

    for (const line of lines) {
      if (line.startsWith('m=video')) {
        filtered.push('m=video 9 UDP/TLS/RTP/SAVPF 96 97');
      } else if (/^a=(rtpmap|fmtp|rtcp-fb):(\d+)/.test(line)) {
        const pt = line.match(/^a=(?:rtpmap|fmtp|rtcp-fb):(\d+)/)?.[1];
        if (allowedPayloads.has(pt)) filtered.push(line);
      } else {
        filtered.push(line);
      }
    }

    return filtered.join('\r\n');
  };

  const handleViewerJoined = async (viewerId) => {
    const pc = createPC(viewerId);
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const filteredSDP = filterToVp8Only(offer.sdp);

    socket.emit('offer', {
      targetId: viewerId,
      sdp: { sdp: filteredSDP, type: 'offer' },
    });

    const sender = pc.getSenders().find((s) => s.track.kind === 'video');
    if (sender) {
      const params = sender.getParameters();
      if (!params.encodings) params.encodings = [{}];
      params.encodings[0].maxBitrate = 5_000_000;
      await sender.setParameters(params);
    }
  };

  const startSharing = async () => {
    if (isMobile()) {
      setError('Screen sharing is not supported on mobile.');
      return;
    }

    if (!roomId) {
      setError('Room ID is required.');
      return;
    }

    try {
      const [width, height] = resolution.split('x').map(Number);
      const mediaStream = await navigator.mediaDevices.getDisplayMedia({
        video: { width: { ideal: width }, height: { ideal: height }, frameRate: 30 },
        audio: true,
      });

      setStream(mediaStream);
      videoRef.current.srcObject = mediaStream;
      socket.emit('create-room', { roomId, password });
      setIsStreaming(true);
    } catch (err) {
      console.error(err);
      setError('Failed to start screen sharing.');
    }
  };

  const stopSharing = () => {
    stream?.getTracks().forEach((t) => t.stop());
    Object.values(peerConnections).forEach((pc) => pc.close());
    Object.keys(peerConnections).forEach((id) => delete peerConnections[id]);

    setStream(null);
    videoRef.current.srcObject = null;
    setIsStreaming(false);
    socket.emit('host-stopped');
  };

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
  }, [stream]);

  return (
    <div className="host-container">
      <h2>🎥 Host Screen Sharing</h2>

      <div className="form-group">
        <input
          type="text"
          placeholder="Room ID"
          value={roomId}
          onChange={(e) => setRoomId(e.target.value)}
        />
        <input
          type="password"
          placeholder="Room Password (optional)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <select value={resolution} onChange={(e) => setResolution(e.target.value)}>
          <option value="1280x720">720p</option>
          <option value="1920x1080">1080p</option>
          <option value="2560x1440">2K</option>
          <option value="3840x2160">4K</option>
        </select>
        {!isStreaming ? (
          <button onClick={startSharing}>Start Sharing</button>
        ) : (
          <button className="stop-btn" onClick={stopSharing}>
            Stop Sharing
          </button>
        )}
      </div>

      {error && <p className="error">{error}</p>}

      <video ref={videoRef} autoPlay controls playsInline muted className="video-preview" />

      <div className="viewer-list">
        <h3>👀 Viewers: {viewers.length}</h3>
        <ul>
          {viewers.map((v, i) => (
            <li key={i}>{v}</li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default HostPage;
