/**
 * WebRTC Audio Service — peer-to-peer voice between operator and bridge
 * Uses the existing WebSocket server for signaling
 */

export class WebRTCService {
  constructor() {
    this.peerConnection = null;
    this.localStream = null;
    this.remoteStream = null;
    this.ws = null;
    this.role = null; // 'operator' or 'bridge'
    this.deviceId = null;
    this.onRemoteStream = null;
    this.onConnectionChange = null;
    this.onError = null;
    this.isConnected = false;
    this.selectedOutputDeviceId = null;
    this.remoteAudioEl = null;

    // ICE candidate queue — buffer candidates until remoteDescription is set
    this._pendingIceCandidates = [];
    this._hasRemoteDescription = false;

    // Listener unsubscribe functions for cleanup
    this._wsUnsubscribers = [];

    // ICE restart tracking
    this._iceRestartAttempts = 0;
    this._maxIceRestarts = 3;

    this.iceServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:72.56.236.204:3478' },
      {
        urls: 'turn:72.56.236.204:3478',
        username: 'rolex',
        credential: 'telecomsecret'
      }
    ];
  }

  /**
   * Initialize WebRTC connection
   * @param {object} opts - { role, deviceId, wsInstance }
   */
  async init({ role, deviceId, wsInstance }) {
    // Clean up previous listeners to prevent duplication
    this._cleanupWsListeners();

    this.role = role;
    this.deviceId = deviceId;
    this.ws = wsInstance;
    this._iceRestartAttempts = 0;

    // Listen for signaling messages from the WebSocket
    this._wsUnsubscribers.push(
      this.ws.on('rtc_offer', (msg) => this._handleOffer(msg)),
      this.ws.on('rtc_answer', (msg) => this._handleAnswer(msg)),
      this.ws.on('rtc_ice', (msg) => this._handleIceCandidate(msg)),
      this.ws.on('rtc_ready', (msg) => this._handleReady(msg))
    );
  }

  /**
   * Clean up WS listeners to prevent duplication on re-init
   */
  _cleanupWsListeners() {
    this._wsUnsubscribers.forEach(unsub => {
      if (typeof unsub === 'function') unsub();
    });
    this._wsUnsubscribers = [];
  }

  /**
   * Start audio — capture mic and signal readiness
   * @param {string} audioDeviceId - specific mic device ID (optional)
   */
  async startAudio(audioDeviceId) {
    try {
      const constraints = {
        audio: audioDeviceId ? { deviceId: { exact: audioDeviceId } } : true,
        video: false,
      };

      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log('[WebRTC] Got local audio stream');

      // Signal that we're ready
      this.ws.send({
        type: 'rtc_ready',
        role: this.role,
        deviceId: this.deviceId,
      });

      // If operator, create offer
      if (this.role === 'operator') {
        await this._createPeerConnection();
        await this._createOffer();
      }

      return true;
    } catch (err) {
      console.error('[WebRTC] Error getting audio:', err);
      if (this.onError) this.onError(err);
      return false;
    }
  }

  /**
   * Stop audio connection and clean up
   */
  stop() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(t => t.stop());
      this.localStream = null;
    }
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    this._pendingIceCandidates = [];
    this._hasRemoteDescription = false;
    this.isConnected = false;
    if (this.onConnectionChange) this.onConnectionChange(false);
  }

  /**
   * Fully destroy — stop + remove all WS listeners
   */
  destroy() {
    this.stop();
    this._cleanupWsListeners();
  }

  /**
   * Get list of audio input devices
   */
  async getAudioInputDevices() {
    try {
      // Need permission first
      const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      tempStream.getTracks().forEach(t => t.stop());

      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter(d => d.kind === 'audioinput');
    } catch (e) {
      console.error('[WebRTC] Cannot enumerate devices:', e);
      return [];
    }
  }

  /**
   * Get list of audio output devices
   */
  async getAudioOutputDevices() {
    try {
      const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      tempStream.getTracks().forEach(t => t.stop());

      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter(d => d.kind === 'audiooutput');
    } catch (e) {
      console.error('[WebRTC] Cannot enumerate output devices:', e);
      return [];
    }
  }

  /**
   * Set audio output device for remote audio
   */
  async setOutputDevice(deviceId) {
    this.selectedOutputDeviceId = deviceId;
    if (this.remoteAudioEl && typeof this.remoteAudioEl.setSinkId === 'function') {
      try {
        await this.remoteAudioEl.setSinkId(deviceId);
        console.log('[WebRTC] Output device set to:', deviceId);
      } catch (e) {
        console.error('[WebRTC] setSinkId failed:', e);
      }
    }
  }

  /**
   * Mute/unmute local mic
   */
  setMuted(muted) {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(t => {
        t.enabled = !muted;
      });
    }
  }

  /**
   * Change microphone while connected
   */
  async changeMic(deviceId) {
    try {
      const constraints = {
        audio: deviceId ? { deviceId: { exact: deviceId } } : true,
        video: false,
      };
      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      const newTrack = newStream.getAudioTracks()[0];

      // Replace track in peer connection
      if (this.peerConnection) {
        const sender = this.peerConnection.getSenders().find(s => s.track?.kind === 'audio');
        if (sender) {
          await sender.replaceTrack(newTrack);
        }
      }

      // Stop old tracks
      if (this.localStream) {
        this.localStream.getAudioTracks().forEach(t => t.stop());
      }
      this.localStream = newStream;
      console.log('[WebRTC] Mic changed to:', deviceId);
    } catch (e) {
      console.error('[WebRTC] Failed to change mic:', e);
    }
  }

  // =============================================
  // PRIVATE: WebRTC Peer Connection
  // =============================================

  async _createPeerConnection() {
    if (this.peerConnection) {
      this.peerConnection.close();
    }

    // Reset ICE queue state for new connection
    this._pendingIceCandidates = [];
    this._hasRemoteDescription = false;

    this.peerConnection = new RTCPeerConnection({
      iceServers: this.iceServers,
    });

    // Add local tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        this.peerConnection.addTrack(track, this.localStream);
      });
    }

    // Handle remote tracks
    this.peerConnection.ontrack = (event) => {
      console.log('[WebRTC] Got remote track');
      this.remoteStream = event.streams[0];

      // Create audio element to play remote audio
      if (!this.remoteAudioEl) {
        this.remoteAudioEl = new Audio();
        this.remoteAudioEl.autoplay = true;
      }
      this.remoteAudioEl.srcObject = this.remoteStream;

      // Set output device if selected
      if (this.selectedOutputDeviceId && typeof this.remoteAudioEl.setSinkId === 'function') {
        this.remoteAudioEl.setSinkId(this.selectedOutputDeviceId).catch(e => {
          console.warn('[WebRTC] setSinkId failed:', e);
        });
      }

      if (this.onRemoteStream) this.onRemoteStream(this.remoteStream);
    };

    // Handle ICE candidates
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.ws.send({
          type: 'rtc_ice',
          candidate: event.candidate,
          role: this.role,
          deviceId: this.deviceId,
        });
      }
    };

    // Handle connection state
    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection?.connectionState;
      console.log('[WebRTC] Connection state:', state);

      if (state === 'connected') {
        this.isConnected = true;
        this._iceRestartAttempts = 0;
        if (this.onConnectionChange) this.onConnectionChange(true);
      } else if (state === 'failed') {
        this.isConnected = false;
        if (this.onConnectionChange) this.onConnectionChange(false);
        // Attempt ICE restart
        this._attemptIceRestart();
      } else if (state === 'disconnected' || state === 'closed') {
        this.isConnected = false;
        if (this.onConnectionChange) this.onConnectionChange(false);
      }
    };

    this.peerConnection.oniceconnectionstatechange = () => {
      const iceState = this.peerConnection?.iceConnectionState;
      console.log('[WebRTC] ICE state:', iceState);

      if (iceState === 'failed') {
        this._attemptIceRestart();
      }
    };
  }

  /**
   * Attempt ICE restart when connection fails
   */
  async _attemptIceRestart() {
    if (this._iceRestartAttempts >= this._maxIceRestarts) {
      console.warn('[WebRTC] Max ICE restart attempts reached, giving up');
      return;
    }

    this._iceRestartAttempts++;
    console.log(`[WebRTC] Attempting ICE restart (attempt ${this._iceRestartAttempts})`);

    try {
      if (this.peerConnection && this.role === 'operator') {
        const offer = await this.peerConnection.createOffer({ iceRestart: true });
        await this.peerConnection.setLocalDescription(offer);

        this.ws.send({
          type: 'rtc_offer',
          sdp: offer,
          role: this.role,
          deviceId: this.deviceId,
        });
        console.log('[WebRTC] ICE restart offer sent');
      }
    } catch (e) {
      console.error('[WebRTC] ICE restart failed:', e);
    }
  }

  async _createOffer() {
    try {
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);

      this.ws.send({
        type: 'rtc_offer',
        sdp: offer,
        role: this.role,
        deviceId: this.deviceId,
      });

      console.log('[WebRTC] Sent offer');
    } catch (e) {
      console.error('[WebRTC] Failed to create offer:', e);
    }
  }

  /**
   * Apply any queued ICE candidates after remoteDescription is set
   */
  async _drainIceCandidateQueue() {
    if (!this.peerConnection || !this._hasRemoteDescription) return;

    const candidates = [...this._pendingIceCandidates];
    this._pendingIceCandidates = [];

    for (const candidate of candidates) {
      try {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        console.log('[WebRTC] Applied queued ICE candidate');
      } catch (e) {
        console.error('[WebRTC] Failed to apply queued ICE candidate:', e);
      }
    }
  }

  // =============================================
  // PRIVATE: Signaling handlers
  // =============================================

  async _handleReady(msg) {
    console.log('[WebRTC] Peer ready:', msg.role);

    // If bridge becomes ready and we're operator, send a new offer
    if (this.role === 'operator' && msg.role === 'bridge' && this.localStream) {
      await this._createPeerConnection();
      await this._createOffer();
    }
  }

  async _handleOffer(msg) {
    if (this.role === 'operator') return; // Only bridge handles offers

    console.log('[WebRTC] Received offer');

    await this._createPeerConnection();

    // Reset ICE queue for new negotiation
    this._pendingIceCandidates = [];
    this._hasRemoteDescription = false;

    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(msg.sdp));
    this._hasRemoteDescription = true;

    // Drain any ICE candidates that arrived before remoteDescription was set
    await this._drainIceCandidateQueue();

    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);

    this.ws.send({
      type: 'rtc_answer',
      sdp: answer,
      role: this.role,
      deviceId: this.deviceId,
    });

    console.log('[WebRTC] Sent answer');
  }

  async _handleAnswer(msg) {
    if (this.role === 'bridge') return; // Only operator handles answers

    console.log('[WebRTC] Received answer');

    if (!this.peerConnection) {
      console.warn('[WebRTC] No peer connection for answer, ignoring');
      return;
    }

    try {
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(msg.sdp));
      this._hasRemoteDescription = true;

      // Drain any ICE candidates that arrived before remoteDescription was set
      await this._drainIceCandidateQueue();
    } catch (e) {
      console.error('[WebRTC] Failed to set remote description:', e);
    }
  }

  async _handleIceCandidate(msg) {
    // Only handle ICE from the other role
    if (msg.role === this.role) return;

    if (!msg.candidate) return;

    // If peerConnection doesn't exist or remoteDescription not yet set, queue it
    if (!this.peerConnection || !this._hasRemoteDescription) {
      console.log('[WebRTC] Queuing ICE candidate (no remote description yet)');
      this._pendingIceCandidates.push(msg.candidate);
      return;
    }

    try {
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(msg.candidate));
    } catch (e) {
      console.error('[WebRTC] Failed to add ICE candidate:', e);
    }
  }
}

export const webrtc = new WebRTCService();
