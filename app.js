/**
 * MeetSpace — app.js
 * Zoom-like video conferencing via WebRTC (PeerJS)
 * Works on GitHub Pages — no backend required!
 */

'use strict';

// ─── Config ────────────────────────────────────────────────
const MAX_PARTICIPANTS = 10;

const PEER_CONFIG = {
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      {
        urls: 'turn:openrelay.metered.ca:80',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      },
      {
        urls: 'turn:openrelay.metered.ca:443',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      }
    ]
  }
};

// ─── URL Params ─────────────────────────────────────────────
const params = new URLSearchParams(window.location.search);
const ROOM_ID = (params.get('room') || '').toUpperCase();
const MY_NAME = params.get('name') || 'Misafir';
const IS_HOST = params.get('host') === '1';

// ─── State ──────────────────────────────────────────────────
let myStream = null;
let peer = null;
let myPeerId = null;
let micEnabled = true;
let camEnabled = true;
let screenSharing = false;
let originalStream = null;

// peers map: peerId → { call, stream, name, conn, tileCreated }
const peers = new Map();

// Track which remote streams we've already displayed
const displayedStreams = new Set();

// ─── DOM References ─────────────────────────────────────────
const videoGrid = document.getElementById('videoGrid');
const roomCodeDisplay = document.getElementById('roomCodeDisplay');
const participantCount = document.getElementById('participantCount');
const connStatus = document.getElementById('connStatus');
const connStatusText = document.getElementById('connStatusText');
const toastContainer = document.getElementById('toastContainer');
const micBtn = document.getElementById('micBtn');
const camBtn = document.getElementById('camBtn');
const screenBtn = document.getElementById('screenBtn');
const endBtn = document.getElementById('endBtn');
const copyBtn = document.getElementById('copyBtn');
const shareBtn = document.getElementById('shareBtn');

// ─── Focus Mode Styles & Context Menu ───────────────────────
const focusStyle = document.createElement('style');
focusStyle.innerHTML = `
#videoGrid.focus-mode {
  display: flex !important;
  flex-direction: row !important;
  flex-wrap: wrap !important;
  justify-content: center !important;
  align-items: flex-end !important;
  padding-bottom: 20px !important;
  gap: 15px !important;
  position: relative;
  overflow: hidden;
  height: 100%;
}
#videoGrid.focus-mode .video-tile.focused {
  position: absolute !important;
  top: 0 !important; left: 0 !important; right: 0 !important; bottom: 0 !important;
  width: 100% !important; height: 100% !important;
  max-width: none !important; max-height: none !important;
  z-index: 1 !important;
  background: #000 !important;
  margin: 0 !important;
  padding: 0 !important;
  border-radius: 0 !important;
}
#videoGrid.focus-mode .video-tile.focused video {
  width: 100% !important; height: 100% !important;
  object-fit: contain !important;
}
#videoGrid.focus-mode .video-tile:not(.focused) {
  position: relative !important;
  z-index: 10 !important;
  width: 110px !important;
  height: 110px !important;
  min-width: 110px !important;
  min-height: 110px !important;
  border-radius: 50% !important;
  border: 3px solid #fff !important;
  overflow: hidden !important;
  box-shadow: 0 4px 15px rgba(0,0,0,0.6) !important;
  flex-shrink: 0 !important;
  cursor: pointer !important;
  margin: 0 !important;
  padding: 0 !important;
  transition: transform 0.2s !important;
}
#videoGrid.focus-mode .video-tile:not(.focused):hover {
  transform: scale(1.05) !important;
}
#videoGrid.focus-mode .video-tile:not(.focused) video {
  width: 100% !important; height: 100% !important;
  object-fit: cover !important;
  position: absolute !important;
  top: 0 !important; left: 0 !important;
}
#videoGrid.focus-mode .video-tile:not(.focused) .tile-name {
  position: absolute !important;
  bottom: 0 !important; left: 0 !important; right: 0 !important;
  width: 100% !important;
  text-align: center !important;
  background: rgba(0,0,0,0.6) !important;
  font-size: 11px !important;
  padding: 4px 0 !important;
  color: #fff !important;
  z-index: 2 !important;
  border-radius: 0 0 50px 50px !important;
  border: none !important;
  margin: 0 !important;
}
#videoGrid.focus-mode .video-tile:not(.focused) .avatar-wrapper { z-index: 1 !important; }
`;
document.head.appendChild(focusStyle);

const contextMenu = document.createElement('div');
contextMenu.id = 'custom-context-menu';
contextMenu.style.cssText = `
  position: fixed; background: #2a2d3e; color: #fff; padding: 8px 0;
  border-radius: 8px; box-shadow: 0 5px 15px rgba(0,0,0,0.5); z-index: 99999;
  display: none; border: 1px solid #3f445e; min-width: 160px;
  font-family: sans-serif; font-size: 14px;
`;
contextMenu.innerHTML = `
  <div class="menu-item" style="padding: 10px 15px; cursor: pointer; display: flex; align-items: center; gap: 8px;" onmouseover="this.style.background='#3f445e'" onmouseout="this.style.background='transparent'">
    <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
    <span>Odakla / Büyüt</span>
  </div>
`;
document.body.appendChild(contextMenu);

let currentTileForMenu = null;
let currentTileNameForMenu = '';

document.addEventListener('click', () => {
  contextMenu.style.display = 'none';
});

contextMenu.querySelector('.menu-item').addEventListener('click', () => {
  if (!currentTileForMenu) return;
  const isFocused = currentTileForMenu.classList.contains('focused');
  if (isFocused) {
    currentTileForMenu.classList.remove('focused');
    videoGrid.classList.remove('focus-mode');
    showToast('Eski görünüme dönüldü', 'info', 2000);
  } else {
    document.querySelectorAll('.video-tile.focused').forEach(t => t.classList.remove('focused'));
    currentTileForMenu.classList.add('focused');
    videoGrid.classList.add('focus-mode');
    showToast(`${currentTileNameForMenu} odaklandı`, 'info', 2000);
  }
  contextMenu.style.display = 'none';
});

// ─── Avatar color palette ───────────────────────────────────
const AVATAR_COLORS = [
  '#6C63FF', '#3ECFCF', '#FF6584', '#F7B731',
  '#20BF6B', '#FC5C65', '#45AAF2', '#FD9644',
  '#A55EEA', '#26DE81'
];

function avatarColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function initials(name) {
  return name.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

// ─── Logging ────────────────────────────────────────────────
function log(...args) {
  console.log('[MeetSpace]', ...args);
}

// ─── Toast notifications ────────────────────────────────────
function showToast(msg, type = 'info', duration = 3500) {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${msg}</span>`;
  toastContainer.appendChild(el);
  setTimeout(() => {
    el.classList.add('removing');
    el.addEventListener('animationend', () => el.remove());
  }, duration);
}

// ─── Status bar ─────────────────────────────────────────────
function setStatus(state, text) {
  const dot = connStatus.querySelector('.status-dot');
  dot.className = `status-dot ${state}`;
  connStatusText.textContent = text;
}

// ─── Update grid layout ──────────────────────────────────────
function updateGrid() {
  const count = videoGrid.children.length;
  videoGrid.setAttribute('data-count', Math.min(count, 10));
  participantCount.textContent = count;
}

// ─── Create a video tile ────────────────────────────────────
function createTile(stream, name, peerId, isLocal = false) {
  // Don't create duplicate tiles
  if (document.getElementById(`tile-${peerId}`)) {
    log('Tile already exists for', peerId);
    return;
  }

  const tile = document.createElement('div');
  tile.className = 'video-tile' + (isLocal ? ' local-tile' : '');
  tile.id = `tile-${peerId}`;

  const video = document.createElement('video');
  video.autoplay = true;
  video.playsInline = true;
  if (isLocal) {
    video.muted = true;
    video.autoPictureInPicture = true;
    video.setAttribute('autopictureinpicture', 'true');
    video.setAttribute('playsinline', 'true');
  }
  video.srcObject = stream;

  const wrapper = document.createElement('div');
  wrapper.className = 'avatar-wrapper';

  const circle = document.createElement('div');
  circle.className = 'avatar-circle';
  circle.style.background = avatarColor(name);
  circle.textContent = initials(name);

  const nameText = document.createElement('div');
  nameText.className = 'avatar-name-text';
  nameText.textContent = name;

  wrapper.appendChild(circle);
  wrapper.appendChild(nameText);

  const badge = document.createElement('div');
  badge.className = 'tile-name';
  badge.innerHTML = `
    <span class="tile-muted-icon" id="mute-icon-${peerId}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
        <line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6M17 16.95A7 7 0 0 1 5 12v-2"/>
      </svg>
    </span>
    <span>${name}${isLocal ? ' (Sen)' : ''}</span>
  `;

  tile.appendChild(video);
  tile.appendChild(wrapper);
  tile.appendChild(badge);

  videoGrid.appendChild(tile);
  updateGrid();

  // Focus functionality
  const toggleFocus = () => {
    if (tile.classList.contains('focused')) {
      tile.classList.remove('focused');
      videoGrid.classList.remove('focus-mode');
      showToast('Eski görünüme dönüldü', 'info', 2000);
    } else {
      document.querySelectorAll('.video-tile.focused').forEach(t => t.classList.remove('focused'));
      tile.classList.add('focused');
      videoGrid.classList.add('focus-mode');
      showToast(`${name} odaklandı. Çıkmak için çift tıklayın.`, 'info', 3000);
    }
  };

  tile.addEventListener('dblclick', toggleFocus);
  tile.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    currentTileForMenu = tile;
    currentTileNameForMenu = name;
    const isFocused = tile.classList.contains('focused');
    contextMenu.querySelector('span').textContent = isFocused ? 'Eski Görünüme Dön' : 'Odakla / Büyüt';

    // Prevent menu from overflowing screen bounds
    const maxLeft = window.innerWidth - 180;
    const maxTop = window.innerHeight - 80;
    contextMenu.style.left = Math.min(e.pageX, maxLeft) + 'px';
    contextMenu.style.top = Math.min(e.pageY, maxTop) + 'px';
    contextMenu.style.display = 'block';
  });

  log('Created tile for', name, peerId);
  return tile;
}

// ─── Remove a tile ──────────────────────────────────────────
function removeTile(peerId) {
  const tile = document.getElementById(`tile-${peerId}`);
  if (tile) {
    const video = tile.querySelector('video');
    if (video) {
      try {
        if (video.srcObject) {
          video.srcObject.getTracks().forEach(t => t.stop());
          video.srcObject = null;
        }
      } catch (e) { }
    }
    const wasFocused = tile.classList.contains('focused');
    tile.remove();
    if (wasFocused) {
      videoGrid.classList.remove('focus-mode');
      showToast('Odaklanan kişi ayrıldı, eski görünüme dönüldü', 'info');
    }
    updateGrid();
  }
}

// ─── Set camera off overlay ─────────────────────────────────
function setTileVideoState(peerId, hasVideo) {
  const tile = document.getElementById(`tile-${peerId}`);
  if (!tile) return;
  tile.classList.toggle('no-video', !hasVideo);
}

// ─── Metadata channel (share name, mic state) ───────────────
function sendMeta(conn) {
  if (conn && conn.open) {
    conn.send({ type: 'meta', name: MY_NAME, micEnabled, camEnabled, peerId: myPeerId });
  }
}

function handleDataMessage(peerId, data) {
  log('Data from', peerId, ':', data.type);

  if (data.type === 'meta') {
    const p = peers.get(peerId);
    if (p && data.name) {
      p.name = data.name;
      const badge = document.querySelector(`#tile-${peerId} .tile-name span:last-child`);
      if (badge) badge.textContent = data.name;
    }
    const muteIcon = document.getElementById(`mute-icon-${peerId}`);
    if (muteIcon) muteIcon.classList.toggle('active', !data.micEnabled);
    setTileVideoState(peerId, data.camEnabled);
  }

  if (data.type === 'peer-list') {
    log('Received peer-list:', data.peers);
    data.peers.forEach(pid => {
      if (pid !== myPeerId && !peers.has(pid)) {
        const name = (data.names && data.names[pid]) || 'Katılımcı';
        log('Calling peer from list:', pid, name);
        mediaCallPeer(pid, name);
      }
    });
  }

  if (data.type === 'new-peer') {
    log('New peer announced:', data.peerId, data.name);
    if (data.peerId !== myPeerId && !peers.has(data.peerId)) {
      mediaCallPeer(data.peerId, data.name || 'Katılımcı');
    }
  }

  if (data.type === 'room-full') {
    showToast('Oda dolu (max 10 kişi)', 'info');
    endCall(false);
  }
}

// ─── Make a media call to a peer ─────────────────────────────
function mediaCallPeer(remotePeerId, remoteName) {
  if (peers.has(remotePeerId)) {
    // Already have this peer — check if we need to add a media call
    const existing = peers.get(remotePeerId);
    if (existing.call) {
      log('Already have call to', remotePeerId);
      return;
    }
  }

  if (peers.size >= MAX_PARTICIPANTS - 1) {
    log('Room full, cannot call', remotePeerId);
    return;
  }

  log('Making media call to', remotePeerId, remoteName);

  const call = peer.call(remotePeerId, myStream, {
    metadata: { name: MY_NAME, room: ROOM_ID }
  });

  if (!call) {
    log('Call failed for', remotePeerId);
    return;
  }

  // Merge with existing peer entry or create new
  const existing = peers.get(remotePeerId);
  if (existing) {
    existing.call = call;
    existing.name = remoteName;
  } else {
    peers.set(remotePeerId, { call, stream: null, name: remoteName, conn: null });
  }

  call.on('stream', remoteStream => {
    log('Got stream from', remotePeerId);
    const entry = peers.get(remotePeerId);
    if (entry && !entry.stream) {
      entry.stream = remoteStream;
      createTile(remoteStream, entry.name || remoteName, remotePeerId, false);
      showToast(`📷 ${entry.name || remoteName} bağlandı`, 'join');

      // Detect when remote camera is paused (phone backgrounded)
      remoteStream.getVideoTracks().forEach(track => {
        track.onmute = () => setTileVideoState(remotePeerId, false);
        track.onunmute = () => setTileVideoState(remotePeerId, true);
      });
    }
  });

  call.on('close', () => {
    log('Call closed:', remotePeerId);
    removePeer(remotePeerId);
  });

  call.on('error', err => {
    log('Call error:', remotePeerId, err);
    removePeer(remotePeerId);
  });

  if (call.peerConnection) {
    call.peerConnection.addEventListener('iceconnectionstatechange', () => {
      const state = call.peerConnection.iceConnectionState;
      log('ICE state (out) for', remotePeerId, ':', state);
      if (state === 'failed' || state === 'closed') {
        removePeer(remotePeerId);
      } else if (state === 'disconnected') {
        setTimeout(() => {
          if (call && call.peerConnection && call.peerConnection.iceConnectionState === 'disconnected') {
            log('Peer still disconnected after 15s timeout, removing:', remotePeerId);
            removePeer(remotePeerId);
          }
        }, 15000); // 15 seconds grace period for returning from background
      }
    });
  }

  // Also open data channel if we don't have one
  const entry = peers.get(remotePeerId);
  if (!entry || !entry.conn) {
    const conn = peer.connect(remotePeerId, { reliable: true, metadata: { name: MY_NAME } });
    conn.on('open', () => {
      log('Data channel open to', remotePeerId);
      const e = peers.get(remotePeerId);
      if (e) e.conn = conn;
      sendMeta(conn);
    });
    conn.on('data', data => handleDataMessage(remotePeerId, data));
    conn.on('close', () => {
      log('Data channel closed:', remotePeerId);
      removePeer(remotePeerId);
    });
  }
}

function removePeer(peerId) {
  const p = peers.get(peerId);
  if (p) {
    showToast(`👋 ${p.name || 'Biri'} ayrıldı`, 'leave');

    if (p.stream) {
      try { p.stream.getTracks().forEach(t => t.stop()); } catch (e) { }
    }

    if (p.call) try { p.call.close(); } catch (e) { }
    if (p.conn) try { p.conn.close(); } catch (e) { }
    peers.delete(peerId);
    removeTile(peerId);
  }
}

// ─── PeerJS signaling ────────────────────────────────────────
const HOST_PEER_ID = `meetspace-${ROOM_ID}-host`;

function initPeer() {
  const myId = IS_HOST ? HOST_PEER_ID : undefined;
  log('Creating peer with id:', myId || '(random)');

  peer = new Peer(myId, PEER_CONFIG);

  peer.on('open', id => {
    myPeerId = id;
    log('My peer ID:', myPeerId, IS_HOST ? '(HOST)' : '(GUEST)');
    setStatus('connected', 'Bağlandı');

    if (IS_HOST) {
      showToast('🎉 Oda hazır! Linki paylaşın', 'info', 5000);
    } else {
      joinViaHost();
    }
  });

  // Answer incoming media calls
  peer.on('call', incomingCall => {
    const meta = incomingCall.metadata || {};
    const callerName = meta.name || 'Katılımcı';
    const callerId = incomingCall.peer;

    log('Incoming call from', callerId, callerName);

    if (peers.size >= MAX_PARTICIPANTS - 1 && !peers.has(callerId)) {
      incomingCall.close();
      return;
    }

    // Answer with our stream
    incomingCall.answer(myStream);

    // Merge with existing entry or create new
    const existing = peers.get(callerId);
    if (existing) {
      existing.call = incomingCall;
      if (callerName !== 'Katılımcı') existing.name = callerName;
    } else {
      peers.set(callerId, { call: incomingCall, stream: null, name: callerName, conn: null });
    }

    incomingCall.on('stream', remoteStream => {
      log('Got stream from incoming call:', callerId);
      const entry = peers.get(callerId);
      if (entry && !entry.stream) {
        entry.stream = remoteStream;
        const displayName = entry.name || callerName;
        createTile(remoteStream, displayName, callerId, false);
        showToast(`📷 ${displayName} bağlandı`, 'join');

        // Detect when remote camera is paused (phone backgrounded)
        remoteStream.getVideoTracks().forEach(track => {
          track.onmute = () => setTileVideoState(callerId, false);
          track.onunmute = () => setTileVideoState(callerId, true);
        });
      }
    });

    incomingCall.on('close', () => {
      log('Incoming call closed:', callerId);
      removePeer(callerId);
    });

    incomingCall.on('error', err => {
      log('Incoming call error:', callerId, err);
      removePeer(callerId);
    });

    if (incomingCall.peerConnection) {
      incomingCall.peerConnection.addEventListener('iceconnectionstatechange', () => {
        const state = incomingCall.peerConnection.iceConnectionState;
        log('ICE state (in) for', callerId, ':', state);
        if (state === 'failed' || state === 'closed') {
          removePeer(callerId);
        } else if (state === 'disconnected') {
          setTimeout(() => {
            if (incomingCall && incomingCall.peerConnection && incomingCall.peerConnection.iceConnectionState === 'disconnected') {
              log('Peer still disconnected after 15s timeout, removing:', callerId);
              removePeer(callerId);
            }
          }, 15000);
        }
      });
    }
  });

  // Accept incoming data connections
  peer.on('connection', conn => {
    const connPeerId = conn.peer;
    log('Incoming data connection from', connPeerId);

    conn.on('open', () => {
      log('Data connection open from', connPeerId);

      // Merge with existing entry or create new
      const existing = peers.get(connPeerId);
      if (existing) {
        existing.conn = conn;
      } else {
        peers.set(connPeerId, { call: null, stream: null, name: 'Katılımcı', conn });
      }

      // Send our metadata
      sendMeta(conn);

      // If we're host, send current peer list to new joiner
      if (IS_HOST) {
        const peerList = [...peers.keys()].filter(id => id !== connPeerId);
        const names = getPeerNames();
        log('Sending peer-list to', connPeerId, ':', peerList);
        conn.send({ type: 'peer-list', peers: peerList, names });
      }
    });

    conn.on('data', data => {
      handleDataMessage(connPeerId, data);

      // Host: when receiving meta from a new peer, broadcast to others
      if (data.type === 'meta' && IS_HOST) {
        const entry = peers.get(connPeerId);
        if (entry) entry.name = data.name;

        // Broadcast new peer to all other connected peers
        peers.forEach((p, pid) => {
          if (pid !== connPeerId && p.conn && p.conn.open) {
            log('Broadcasting new-peer', connPeerId, 'to', pid);
            p.conn.send({ type: 'new-peer', peerId: connPeerId, name: data.name });
          }
        });
      }
    });

    conn.on('close', () => {
      log('Data connection closed:', connPeerId);
      removePeer(connPeerId);
    });
  });

  peer.on('error', err => {
    console.error('Peer error:', err);
    if (err.type === 'unavailable-id') {
      setStatus('connected', 'Bağlandı');
    } else if (err.type === 'peer-unavailable') {
      showToast('Oda bulunamadı. Kodu kontrol edin.', 'info');
      setStatus('error', 'Oda bulunamadı');
    } else {
      setStatus('error', 'Bağlantı hatası');
      showToast('Bağlantı sorunu: ' + err.message, 'info');
    }
  });

  peer.on('disconnected', () => {
    setStatus('connecting', 'Yeniden bağlanıyor...');
    setTimeout(() => {
      if (peer && !peer.destroyed) peer.reconnect();
    }, 1000);
  });
}

function getPeerNames() {
  const names = {};
  peers.forEach((p, id) => { names[id] = p.name; });
  if (myPeerId) names[myPeerId] = MY_NAME;
  return names;
}

// Guest → connect to host
function joinViaHost() {
  log('Connecting to host:', HOST_PEER_ID);

  const hostConn = peer.connect(HOST_PEER_ID, {
    reliable: true,
    metadata: { name: MY_NAME }
  });

  hostConn.on('open', () => {
    log('Connected to host via data channel');

    // Store entry for host — DO NOT call mediaCallPeer yet,
    // wait for the host to answer our call
    peers.set(HOST_PEER_ID, { call: null, stream: null, name: 'Ev Sahibi', conn: hostConn });

    // Send our info
    sendMeta(hostConn);

    // Now make a media call to the host
    log('Calling host for media...');
    const call = peer.call(HOST_PEER_ID, myStream, {
      metadata: { name: MY_NAME, room: ROOM_ID }
    });

    if (call) {
      const entry = peers.get(HOST_PEER_ID);
      entry.call = call;

      call.on('stream', remoteStream => {
        log('Got host stream!');
        if (entry && !entry.stream) {
          entry.stream = remoteStream;
          createTile(remoteStream, entry.name || 'Ev Sahibi', HOST_PEER_ID, false);
          showToast(`📷 ${entry.name || 'Ev Sahibi'} bağlandı`, 'join');
        }
      });

      call.on('close', () => {
        log('Host call closed');
        removePeer(HOST_PEER_ID);
      });

      call.on('error', err => {
        log('Host call error:', err);
        removePeer(HOST_PEER_ID);
      });
    }
  });

  hostConn.on('data', data => {
    handleDataMessage(HOST_PEER_ID, data);
  });

  hostConn.on('close', () => {
    log('Host data connection closed');
    removePeer(HOST_PEER_ID);
  });

  hostConn.on('error', err => {
    log('Host connection error:', err);
    showToast('Odaya bağlanılamadı. Kod doğru mu?', 'info');
    setStatus('error', 'Bağlantı hatası');
  });
}

// ─── Screen share ────────────────────────────────────────────
let screenMixActive = false;
let screenCancelAnim = null;
let screenVideoEl = null;
let camVideoEl = null;
let activeScreenStream = null;

async function toggleScreenShare() {
  if (!screenSharing) {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      originalStream = myStream;
      activeScreenStream = screenStream;

      const screenTrack = screenStream.getVideoTracks()[0];
      const camTrack = originalStream.getVideoTracks()[0];

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      screenVideoEl = document.createElement('video');
      screenVideoEl.autoplay = true;
      screenVideoEl.muted = true;
      screenVideoEl.playsInline = true;
      screenVideoEl.srcObject = new MediaStream([screenTrack]);
      // Force hardware decode by attaching to DOM invisibly
      screenVideoEl.style.position = 'fixed';
      screenVideoEl.style.opacity = '0';
      screenVideoEl.style.width = '1px';
      screenVideoEl.style.height = '1px';
      screenVideoEl.style.pointerEvents = 'none';
      screenVideoEl.style.zIndex = '-9999';
      document.body.appendChild(screenVideoEl);
      screenVideoEl.play().catch(e => console.error('screen video play err:', e));

      camVideoEl = document.createElement('video');
      camVideoEl.autoplay = true;
      camVideoEl.muted = true;
      camVideoEl.playsInline = true;
      // Use original stream for camera picture-in-picture
      camVideoEl.srcObject = originalStream;
      // Force hardware decode
      camVideoEl.style.position = 'fixed';
      camVideoEl.style.opacity = '0';
      camVideoEl.style.width = '1px';
      camVideoEl.style.height = '1px';
      camVideoEl.style.pointerEvents = 'none';
      camVideoEl.style.zIndex = '-9999';
      document.body.appendChild(camVideoEl);
      camVideoEl.play().catch(e => console.error('cam video play err:', e));

      screenMixActive = true;

      const renderMix = () => {
        if (!screenMixActive) return;

        // Match screen share resolution
        let w = screenVideoEl.videoWidth || 1280;
        let h = screenVideoEl.videoHeight || 720;
        if (canvas.width !== w) canvas.width = w;
        if (canvas.height !== h) canvas.height = h;

        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        if (screenVideoEl.readyState >= 2) {
          ctx.drawImage(screenVideoEl, 0, 0, canvas.width, canvas.height);
        }

        // Overlay camera if enabled (Circular and smaller)
        if (camEnabled && camTrack && camVideoEl.readyState >= 2) {
          const pipR = Math.max(50, canvas.width * 0.07); // 7% radius (smaller)
          const padding = 20;
          const cx = canvas.width - pipR - padding;
          const cy = canvas.height - pipR - padding - 20; // Extra padding for badge

          ctx.save();
          // Shadow for circle
          ctx.beginPath();
          ctx.arc(cx, cy, pipR, 0, Math.PI * 2);
          ctx.shadowColor = 'rgba(0,0,0,0.6)';
          ctx.shadowBlur = 15;
          ctx.fill();

          ctx.shadowBlur = 0;
          ctx.clip(); // Mask camera into circle

          // Draw video with cover fit
          const vW = camVideoEl.videoWidth || 1;
          const vH = camVideoEl.videoHeight || 1;
          const scale = Math.max((pipR * 2) / vW, (pipR * 2) / vH);
          const drawW = vW * scale;
          const drawH = vH * scale;
          const drawX = cx - drawW / 2;
          const drawY = cy - drawH / 2;

          ctx.drawImage(camVideoEl, drawX, drawY, drawW, drawH);
          ctx.restore();

          // Draw border
          ctx.save();
          ctx.beginPath();
          ctx.arc(cx, cy, pipR, 0, Math.PI * 2);
          ctx.lineWidth = 3;
          ctx.strokeStyle = '#fff';
          ctx.stroke();
          ctx.restore();

          // Draw Badge Below
          ctx.save();
          ctx.font = '13px sans-serif';
          const textW = ctx.measureText(MY_NAME).width;
          const badgeW = textW + 16;
          const badgeX = cx - badgeW / 2;
          const badgeY = cy + pipR + 8;
          ctx.fillStyle = 'rgba(0,0,0,0.6)';
          // Rounded rect path
          ctx.beginPath();
          ctx.roundRect ? ctx.roundRect(badgeX, badgeY, badgeW, 22, 11) : ctx.rect(badgeX, badgeY, badgeW, 22);
          ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.fillText(MY_NAME, badgeX + 8, badgeY + 16);
          ctx.restore();
        }

        screenCancelAnim = requestAnimationFrame(renderMix);
      };

      renderMix();

      const mixStream = canvas.captureStream(30);
      const mixedTrack = mixStream.getVideoTracks()[0];

      // Keep existing mic audio instead of replacing it with screen audio
      const audioTrack = originalStream.getAudioTracks()[0];

      myStream = new MediaStream([mixedTrack]);
      if (audioTrack) {
        myStream.addTrack(audioTrack);
      }

      peers.forEach(p => {
        if (p.call && p.call.peerConnection) {
          const videoSender = p.call.peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
          if (videoSender) videoSender.replaceTrack(mixedTrack);

          if (audioTrack) {
            const audioSender = p.call.peerConnection.getSenders().find(s => s.track && s.track.kind === 'audio');
            // Safely swap audio track if available
            if (audioSender) audioSender.replaceTrack(audioTrack);
          }
        }
      });

      const localVideo = document.querySelector('#tile-local video');
      if (localVideo) localVideo.srcObject = myStream;

      screenBtn.classList.add('active');
      screenSharing = true;

      screenTrack.addEventListener('ended', () => stopScreenShare());
    } catch (e) {
      console.log('Screen share cancelled or error:', e);
    }
  } else {
    stopScreenShare();
  }
}

function stopScreenShare() {
  if (!screenSharing || !originalStream) return;

  screenMixActive = false;
  if (screenCancelAnim) cancelAnimationFrame(screenCancelAnim);

  if (screenVideoEl) {
    screenVideoEl.srcObject = null;
    if (screenVideoEl.parentNode) screenVideoEl.parentNode.removeChild(screenVideoEl);
  }
  if (camVideoEl) {
    camVideoEl.srcObject = null;
    if (camVideoEl.parentNode) camVideoEl.parentNode.removeChild(camVideoEl);
  }

  if (activeScreenStream) {
    activeScreenStream.getTracks().forEach(t => t.stop());
    activeScreenStream = null;
  }

  myStream = originalStream;

  const camTrack = myStream.getVideoTracks()[0];
  const camAudio = myStream.getAudioTracks()[0];

  peers.forEach(p => {
    if (p.call && p.call.peerConnection) {
      const videoSender = p.call.peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
      if (videoSender && camTrack) videoSender.replaceTrack(camTrack);

      const audioSender = p.call.peerConnection.getSenders().find(s => s.track && s.track.kind === 'audio');
      if (audioSender && camAudio) audioSender.replaceTrack(camAudio);
    }
  });

  const localVideo = document.querySelector('#tile-local video');
  if (localVideo) localVideo.srcObject = myStream;

  screenBtn.classList.remove('active');
  screenSharing = false;
  originalStream = null;
}

// ─── Controls ────────────────────────────────────────────────
micBtn.addEventListener('click', () => {
  micEnabled = !micEnabled;
  if (originalStream && screenSharing) {
    originalStream.getAudioTracks().forEach(t => t.enabled = micEnabled);
  }
  myStream.getAudioTracks().forEach(t => t.enabled = micEnabled);

  micBtn.classList.toggle('muted', !micEnabled);
  micBtn.querySelector('.mic-on').style.display = micEnabled ? '' : 'none';
  micBtn.querySelector('.mic-off').style.display = micEnabled ? 'none' : '';

  const muteIcon = document.getElementById('mute-icon-local');
  if (muteIcon) muteIcon.classList.toggle('active', !micEnabled);

  peers.forEach(p => {
    if (p.conn && p.conn.open) sendMeta(p.conn);
  });
});

camBtn.addEventListener('click', () => {
  camEnabled = !camEnabled;
  if (originalStream && screenSharing) {
    originalStream.getVideoTracks().forEach(t => t.enabled = camEnabled);
  } else {
    myStream.getVideoTracks().forEach(t => t.enabled = camEnabled);
  }

  camBtn.classList.toggle('muted', !camEnabled);
  camBtn.querySelector('.cam-on').style.display = camEnabled ? '' : 'none';
  camBtn.querySelector('.cam-off').style.display = camEnabled ? 'none' : '';

  setTileVideoState('local', camEnabled);

  peers.forEach(p => {
    if (p.conn && p.conn.open) sendMeta(p.conn);
  });
});

screenBtn.addEventListener('click', toggleScreenShare);

// ─── Fullscreen on first touch (mobile only) ──────────────────
const isMobileDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

if (isMobileDevice) {
  // Mobile browsers require a user gesture to enter fullscreen
  document.addEventListener('pointerdown', () => {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
    }
  }, { once: true });
}

// ─── Picture-in-Picture ────────────────────────────────────────
// Logic: Brave/Chrome automatically enters PiP on background if autopictureinpicture is true.
// As backup, MediaSession provides a PiP button in the notification shade.
let pipVideoEl = null;

function enterPip() {
  if (!document.pictureInPictureEnabled) return;
  const localVid = document.querySelector('#tile-local video');
  if (localVid && localVid.readyState >= 2) {
    localVid.requestPictureInPicture().catch(err => log('PiP failed:', err));
  }
}

function exitPip() {
  if (document.pictureInPictureElement) {
    document.exitPictureInPicture().catch(() => {});
  }
  pipVideoEl = null;
}

// When user returns to the page, exit PiP cleanly
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && document.pictureInPictureElement) {
    exitPip();
  }
});

endBtn.addEventListener('click', () => endCall(true));


function endCall(redirect = true) {
  peers.forEach((p, id) => {
    try { if (p.call) p.call.close(); } catch (e) { }
    try { if (p.conn) p.conn.close(); } catch (e) { }
  });
  peers.clear();

  if (myStream) myStream.getTracks().forEach(t => t.stop());
  if (peer) peer.destroy();
  if (redirect) window.location.href = 'index.html';
}

// Copy room code
copyBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(ROOM_ID).then(() => {
    copyBtn.textContent = '✓';
    setTimeout(() => {
      copyBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
    }, 2000);
  });
});

// Copy share link
shareBtn.addEventListener('click', () => {
  const baseUrl = location.href.split('room.html')[0];
  const shareUrl = `${baseUrl}index.html?room=${ROOM_ID}`;
  navigator.clipboard.writeText(shareUrl).then(() => {
    showToast('🔗 Katılım linki kopyalandı!', 'info');
  }).catch(() => {
    navigator.clipboard.writeText(ROOM_ID);
    showToast(`Oda kodu kopyalandı: ${ROOM_ID}`, 'info');
  });
});

// ─── Init ────────────────────────────────────────────────────
async function init() {
  if (!ROOM_ID) {
    window.location.href = 'index.html';
    return;
  }

  roomCodeDisplay.textContent = ROOM_ID;
  document.title = `MeetSpace — ${ROOM_ID}`;

  setStatus('connecting', 'Bağlanıyor...');

  // Get camera + mic
  try {
    myStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  } catch (e) {
    showToast('Kamera/mikrofon izni alınamadı. Sadece sesli katılının.', 'info', 6000);
    try {
      myStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
    } catch (e2) {
      showToast('Ses izni de alınamadı.', 'info', 5000);
      myStream = new MediaStream();
    }
  }

  // Create local tile
  createTile(myStream, MY_NAME, 'local', true);

  if (myStream.getVideoTracks().length === 0 || !myStream.getVideoTracks()[0].enabled) {
    setTileVideoState('local', false);
  }

  // Init peer connection
  initPeer();
}

// Handle page close
window.addEventListener('beforeunload', () => endCall(false));

// ─── MediaSession API ───────────────────────────────────
if ('mediaSession' in navigator) {
  navigator.mediaSession.metadata = new MediaMetadata({
    title: 'MeetSpace Toplantı',
    artist: `Oda: ${ROOM_ID}`,
    album: 'MeetSpace'
  });
  navigator.mediaSession.setActionHandler('stop', () => endCall(true));
  navigator.mediaSession.playbackState = 'playing';

  // 'enterpictureinpicture' MediaSession action:
  // Chrome/Brave Android adds a PiP button to the system media notification.
  // User taps it from the notification shade → enterPip() fires with a valid gesture.
  try {
    navigator.mediaSession.setActionHandler('enterpictureinpicture', () => {
      enterPip();
    });
  } catch (e) { /* not supported — ignore */ }
}

// Silent audio: forces MediaSession notification to appear on Android even
// when no remote audio is playing. Started on first user touch.
document.addEventListener('pointerdown', () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0.0001; // essentially inaudible
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
  } catch (e) { /* ignore */ }
}, { once: true });

// Start
init();

