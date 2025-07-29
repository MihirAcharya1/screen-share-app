import React, { useRef, useState } from 'react';
import { socket } from '../socket';
import './ViewerPage.css';

let currentPC = null;

const ViewerPage = () => {
  const videoRef = useRef(null);
  const [roomId, setRoomId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [mute, setMute] = useState(true);
  const [playbackError, setPlaybackError] = useState(false);

  const joinRoom = () => {
    if (!roomId) return;

    if (currentPC) {
      currentPC.close();
      currentPC = null;
    }

    socket.off('offer');
    socket.off('ice-candidate');
    socket.off('host-stopped');
    socket.off('host-disconnected');
    socket.off('error-message');

    socket.emit('join-room', { roomId, password });

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        // Add TURN here if needed
      ],
    });

    currentPC = pc;
    const pendingCandidates = [];
    let remoteSet = false;
    let attachedStream = null;

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit('ice-candidate', { targetId: 'host', candidate: e.candidate });
      }
    };

    pc.ontrack = (event) => {
      const stream = event.streams?.[0];

      if (videoRef.current && stream && stream !== attachedStream) {
        attachedStream = stream;

        console.log('Track received via ontrack');
        console.log('Stream tracks:', stream.getTracks().map(t => `${t.kind}:${t.enabled}`));

        videoRef.current.srcObject = stream;

        videoRef.current.onloadedmetadata = () => {
          videoRef.current
            .play()
            .then(() => {
              console.log('Playback started');
              setPlaybackError(false);
            })
            .catch((err) => {
              console.error('Playback failed:', err);
              setPlaybackError(true);
            });
        };
      }
    };

    socket.on('offer', async ({ sdp, from }) => {
      try {
        console.log('Received offer');
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        remoteSet = true;

        pendingCandidates.forEach(c => pc.addIceCandidate(new RTCIceCandidate(c)));
        pendingCandidates.length = 0;

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit('answer', {
          targetId: from,
          sdp: answer,
          type: "answer",
          from: socket.id
        });
      } catch (err) {
        console.error('Error handling offer:', err);
      }
    });

    socket.on('ice-candidate', ({ from, candidate }) => {
      if (remoteSet) {
        pc.addIceCandidate(new RTCIceCandidate(candidate));
      } else {
        pendingCandidates.push(candidate);
      }
    });

    socket.on('host-stopped', () => {
      if (videoRef.current) videoRef.current.srcObject = null;
      pc.close();
    });

    socket.on('host-disconnected', () => {
      setError("Host disconnected.");
      pc.close();
    });

    socket.on('error-message', setError);
  };

  const retryPlayback = () => {
    if (videoRef.current) {
      videoRef.current
        .play()
        .then(() => {
          console.log('Manual playback succeeded');
          setPlaybackError(false);
        })
        .catch((err) => {
          console.error('Manual playback failed:', err);
          setPlaybackError(true);
        });
    }
  };

  return (
    <div className="viewer-container">
      <h2 className="viewer-title">Viewer</h2>

      <div className="form-section">
        <input
          className="input-field"
          placeholder="Room ID"
          value={roomId}
          onChange={e => setRoomId(e.target.value)}
        />
        <input
          className="input-field"
          placeholder="Password"
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
        />
        <div className="button-group">
          <button className="button primary" onClick={joinRoom}>Join</button>
          <button className="button secondary" onClick={() => setMute(!mute)}>
            {mute ? 'Unmute' : 'Mute'}
          </button>
        </div>
        {error && <p className="error-message">{error}</p>}
      </div>

      <div className="video-wrapper">
        <video
          id="remoteVideo"
          ref={videoRef}
          autoPlay
          playsInline
          muted={mute}
          className="video-player"
          style={{ width: '100%', backgroundColor: 'black' }}
        />
        {playbackError && (
          <div className="playback-fallback">
            <button onClick={retryPlayback} className="button fallback-btn">
              ▶ Tap to Play Video
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ViewerPage;
