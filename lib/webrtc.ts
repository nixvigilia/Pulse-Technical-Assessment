export type DescType = "offer" | "answer" | "ice";
export type PeerControl =
  | "video-request"
  | "video-accept"
  | "video-decline"
  | "video-end";

interface PeerCallbacks {
  onSignal: (type: DescType, payload: string) => void;
  onChat: (text: string) => void;
  onControl: (ctrl: PeerControl) => void;
  onRemoteStream: (stream: MediaStream | null) => void;
  onConnectionState: (state: RTCPeerConnectionState) => void;
  onChannelOpen: () => void;
}

const ICE_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

export class PeerSession {
  private pc: RTCPeerConnection;
  private dc: RTCDataChannel | null = null;
  private readonly polite: boolean;
  private makingOffer = false;
  private ignoreOffer = false;
  private localStream: MediaStream | null = null;
  private videoSender: RTCRtpSender | null = null;
  private audioSender: RTCRtpSender | null = null;
  private closed = false;
  private readonly cb: PeerCallbacks;
  private pendingCandidates: RTCIceCandidateInit[] = [];

  constructor(initiator: boolean, cb: PeerCallbacks) {
    this.cb = cb;
    this.polite = !initiator;
    this.pc = new RTCPeerConnection(ICE_CONFIG);

    this.pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        this.cb.onSignal("ice", JSON.stringify(candidate));
      }
    };

    this.pc.onnegotiationneeded = async () => {
      try {
        this.makingOffer = true;
        await this.pc.setLocalDescription();
        if (this.pc.localDescription) {
          this.cb.onSignal("offer", JSON.stringify(this.pc.localDescription));
        }
      } finally {
        this.makingOffer = false;
      }
    };

    this.pc.ontrack = ({ track }) => {
      track.addEventListener("unmute", () => {
        this.cb.onRemoteStream(this.remoteMediaStream());
      });
      this.cb.onRemoteStream(this.remoteMediaStream());
    };

    this.pc.onconnectionstatechange = () => {
      this.cb.onConnectionState(this.pc.connectionState);
    };

    if (initiator) {
      this.dc = this.pc.createDataChannel("chat");
      this.wireDataChannel(this.dc);
    } else {
      this.pc.ondatachannel = (e) => {
        this.dc = e.channel;
        this.wireDataChannel(this.dc);
      };
    }
  }

  private wireDataChannel(dc: RTCDataChannel) {
    dc.onopen = () => this.cb.onChannelOpen();
    dc.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data as string);
        if (msg.t === "chat" && typeof msg.text === "string") {
          this.cb.onChat(msg.text);
        } else if (msg.t === "ctrl" && typeof msg.ctrl === "string") {
          this.cb.onControl(msg.ctrl as PeerControl);
        }
      } catch {}
    };
  }

  async handleSignal(type: DescType, payload: string) {
    if (this.closed) return;
    const data = JSON.parse(payload);

    if (type === "ice") {
      if (!this.pc.remoteDescription) {
        this.pendingCandidates.push(data);
        return;
      }
      try {
        await this.pc.addIceCandidate(data);
      } catch {}
      return;
    }

    const desc = data as RTCSessionDescriptionInit;
    const offerCollision =
      desc.type === "offer" &&
      (this.makingOffer || this.pc.signalingState !== "stable");
    this.ignoreOffer = !this.polite && offerCollision;
    if (this.ignoreOffer) return;

    // Step 1: tell the browser what the other peer offered/answered.
    // Step 2: then apply any connection paths (ICE) we received earlier.
    // We used to apply paths first — the browser rejected them and you got "ICE failed".
    await this.pc.setRemoteDescription(desc);
    await this.flushPendingCandidates();
    if (desc.type === "offer") {
      await this.pc.setLocalDescription();
      if (this.pc.localDescription) {
        this.cb.onSignal("answer", JSON.stringify(this.pc.localDescription));
      }
    }
  }

  private async flushPendingCandidates() {
    if (this.pendingCandidates.length === 0) return;
    const queued = this.pendingCandidates;
    this.pendingCandidates = [];
    for (const candidate of queued) {
      try {
        await this.pc.addIceCandidate(candidate);
      } catch {}
    }
  }

  sendChat(text: string) {
    this.safeSend({ t: "chat", text });
  }

  sendControl(ctrl: PeerControl) {
    this.safeSend({ t: "ctrl", ctrl });
  }

  private safeSend(obj: unknown) {
    if (this.dc && this.dc.readyState === "open") {
      this.dc.send(JSON.stringify(obj));
    }
  }

  /** Live inbound tracks — needed after replaceTrack when ontrack may not refire. */
  remoteMediaStream(): MediaStream | null {
    const tracks = this.pc
      .getReceivers()
      .map((r) => r.track)
      .filter(
        (t): t is MediaStreamTrack => t !== null && t.readyState === "live",
      );
    if (!tracks.some((t) => t.kind === "video")) return null;
    return new MediaStream(tracks);
  }

  async startVideo(): Promise<MediaStream> {
    const live = this.localStream?.getTracks().some((track) => track.readyState === "live");
    if (this.localStream && live) {
      this.cb.onRemoteStream(this.remoteMediaStream());
      return this.localStream;
    }

    this.localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    const videoTrack = this.localStream.getVideoTracks()[0] ?? null;
    const audioTrack = this.localStream.getAudioTracks()[0] ?? null;

    if (videoTrack) {
      if (this.videoSender) {
        await this.videoSender.replaceTrack(videoTrack);
      } else {
        this.videoSender = this.pc.addTrack(videoTrack, this.localStream);
      }
    }
    if (audioTrack) {
      if (this.audioSender) {
        await this.audioSender.replaceTrack(audioTrack);
      } else {
        this.audioSender = this.pc.addTrack(audioTrack, this.localStream);
      }
    }
    this.cb.onRemoteStream(this.remoteMediaStream());
    return this.localStream;
  }

  stopVideo() {
    if (!this.localStream && !this.videoSender && !this.audioSender) return;
    for (const track of this.localStream?.getTracks() ?? []) track.stop();
    this.localStream = null;
    // Keep the senders so the other person can rejoin without a new peer connection.
    void this.videoSender?.replaceTrack(null);
    void this.audioSender?.replaceTrack(null);
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.stopVideo();
    if (this.dc) {
      try {
        this.dc.close();
      } catch {}
    }
    try {
      this.pc.close();
    } catch {}
  }
}
