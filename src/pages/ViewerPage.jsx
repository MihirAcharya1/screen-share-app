import React, { useRef, useState } from 'react';
import { socket } from '../socket';

let currentPC = null;

const ViewerPage = () => {
  const videoRef = useRef(null);
  const [roomId, setRoomId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const joinRoom = () => {
    if (!roomId) return;

    // Cleanup previous peer connection
    if (currentPC) {
      currentPC.close();
      currentPC = null;
    }

    // Remove previous listeners
    socket.off('offer');
    socket.off('ice-candidate');
    socket.off('host-stopped');
    socket.off('host-disconnected');
    socket.off('error-message');

    socket.emit('join-room', { roomId, password });

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    currentPC = pc;

    const pendingCandidates = [];
    let remoteSet = false;

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit('ice-candidate', { targetId: 'host', candidate: e.candidate });
      }
    };

    pc.ontrack = (event) => {
      const stream = event.streams?.[0];
      const track = event.track;

      console.log("Track received:", track);

      // Wait for real media frames to flow
      track.onunmute = () => {
        console.log("Track unmuted:", track);

        if (videoRef.current && stream) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(err => console.error("Video playback failed", err));
        }

        // Extra debug
        setTimeout(() => {
          if (videoRef.current) {
            const v = videoRef.current;
            console.log("Video element state:", {
              readyState: v.readyState,
              srcObject: v.srcObject,
              videoTracks: v.srcObject?.getVideoTracks()
            });
          }
        }, 2000);
      };
    };

    socket.on('offer', async ({ sdp, from }) => {
      console.log("Received offer from:", from, sdp);
      if (pc.signalingState !== 'stable') {
        console.warn('Skipping offer: not in stable state', pc.signalingState);
        return;
      }

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        remoteSet = true;

        // Apply queued ICE
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
      } catch (error) {
        console.error('Error handling offer:', error);
      }
    });

    socket.on('ice-candidate', ({ from, candidate }) => {
      console.log("Received ICE candidate from:", from, candidate);
      if (remoteSet) {
        pc.addIceCandidate(new RTCIceCandidate(candidate));
      } else {
        pendingCandidates.push(candidate);
      }
    });

    socket.on('host-stopped', () => {
      console.log("Host stopped screen sharing");
      const videoEl = videoRef.current;
      if (videoEl) videoEl.srcObject = null;
      pc.close();
    });

    socket.on('host-disconnected', () => {
      setError("Host disconnected.");
      pc.close();
    });

    socket.on('error-message', setError);
  };

  return (
    <div>
      <h2>Viewer</h2>
      <input placeholder="Room ID" value={roomId} onChange={e => setRoomId(e.target.value)} />
      <input placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} />
      <button onClick={joinRoom}>Join</button>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <video
        id="remoteVideo"
        ref={videoRef}
        autoPlay
        playsInline
        muted={false}
        controls
        style={{ width: "100%", backgroundColor: "#000" }}
      />
    </div>
  );
};

export default ViewerPage;
