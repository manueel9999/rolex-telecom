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

    this.iceServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
    ];
  }

  /**
   * Initialize WebRTC connection
   * @param {object} opts - { role, deviceId, ws }
   */
  async init({ role, deviceId, wsInstance }) {
    this.role = role;
    this.deviceId = deviceId;
    this.ws = wsInstance;

    // Listen for signaling messages from the WebSocket
    this.ws.on('rtc_offer', (msg) => this._handleOffer(msg));
    this.ws.on('rtc_answer', (msg) => this._handleAnswer(msg));
    this.ws.on('rtc_ice', (msg) => this._handleIceCandidate(msg));
    this.ws.on('rtc_ready', (msg) => this._handleReady(msg));
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
   * Stop audio connection
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
    this.isConnected = false;
    if (this.onConnectionChange) this.onConnectionChange(false);
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

  // =============================================
  // PRIVATE: WebRTC Peer Connection
  // =============================================

  async _createPeerConnection() {
    if (this.peerConnection) {
      this.peerConnection.close();
    }

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
        if (this.onConnectionChange) this.onConnectionChange(true);
      } else if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        this.isConnected = false;
        if (this.onConnectionChange) this.onConnectionChange(false);
      }
    };

    this.peerConnection.oniceconnectionstatechange = () => {
      console.log('[WebRTC] ICE state:', this.peerConnection?.iceConnectionState);
    };
  }

  async _createOffer() {
    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);

    this.ws.send({
      type: 'rtc_offer',
      sdp: offer,
      role: this.role,
      deviceId: this.deviceId,
    });

    console.log('[WebRTC] Sent offer');
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
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(msg.sdp));

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
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(msg.sdp));
  }

  async _handleIceCandidate(msg) {
    // Only handle ICE from the other role
    if (msg.role === this.role) return;

    if (this.peerConnection && msg.candidate) {
      try {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(msg.candidate));
      } catch (e) {
        console.error('[WebRTC] Failed to add ICE candidate:', e);
      }
    }
  }
}

export const webrtc = new WebRTCService();
