import { WORKLET_CODE } from '../audio/worklet';
import { packAudioFrame, GatewayMessage, AgentConfig } from '@voice/protocol';

export type SessionState = 'idle' | 'connecting' | 'streaming' | 'reconnecting';

export interface SessionCallbacks {
  onStateChange: (state: SessionState) => void;
  onMessage: (msg: GatewayMessage) => void;
  onError: (err: string) => void;
}

export class SessionManager {
  private ws: WebSocket | null = null;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private state: SessionState = 'idle';
  private seq = 0;
  private gatewayUrl: string;
  private callbacks: SessionCallbacks;
  private activeSources: AudioBufferSourceNode[] = [];
  private nextPlayTime = 0;

  constructor(gatewayUrl: string, callbacks: SessionCallbacks) {
    this.gatewayUrl = gatewayUrl;
    this.callbacks = callbacks;
  }

  private setState(state: SessionState) {
    this.state = state;
    this.callbacks.onStateChange(state);
  }

  async start(
    srcLang = 'ja',
    tgtLang = 'en',
    mode: 'translate' | 'agent' = 'agent',
    config?: AgentConfig
  ): Promise<void> {
    if (this.state !== 'idle') return;

    this.setState('connecting');
    this.seq = 0;

    try {
      this.ws = new WebSocket(this.gatewayUrl);
      this.ws.binaryType = 'arraybuffer';

      this.ws.onopen = async () => {
        // Send start control message
        this.ws?.send(
          JSON.stringify({
            type: 'start',
            mode,
            srcLang,
            tgtLang,
            sampleRate: 16000,
            config,
          })
        );
        await this.initAudioCapture();
        this.setState('streaming');
      };

      this.ws.onmessage = (event) => {
        try {
          if (typeof event.data === 'string') {
            const msg = JSON.parse(event.data) as GatewayMessage;
            if (msg.type === 'agent_audio_chunk') {
              this.playPcm16Chunk(msg.pcm16Base64);
            } else if (msg.type === 'interrupt') {
              console.log('[Client] Barge-in interrupt received; flushing audio queue.');
              this.flushPlaybackQueue();
            }
            this.callbacks.onMessage(msg);
          }
        } catch (e) {
          console.error('[Client] Error parsing gateway message:', e);
        }
      };

      this.ws.onerror = () => {
        this.callbacks.onError('Gateway WebSocket connection error');
      };

      this.ws.onclose = () => {
        if (this.state !== 'idle') {
          console.warn('[Client] Gateway connection closed.');
          this.callbacks.onError('Voice connection disconnected. Please click Start Call to reconnect.');
          this.stop();
        }
      };
    } catch (err: any) {
      this.callbacks.onError(err.message || 'Failed to connect');
      this.stop();
    }
  }

  private async initAudioCapture(): Promise<void> {
    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: 16000,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    this.audioContext = new AudioContext({ sampleRate: 16000 });
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    const blob = new Blob([WORKLET_CODE], { type: 'application/javascript' });
    const workletUrl = URL.createObjectURL(blob);
    try {
      await this.audioContext.audioWorklet.addModule(workletUrl);
    } finally {
      URL.revokeObjectURL(workletUrl);
    }

    const source = this.audioContext.createMediaStreamSource(this.mediaStream);
    this.workletNode = new AudioWorkletNode(this.audioContext, 'audio-capture-processor');

    this.workletNode.port.onmessage = (e) => {
      if (this.state === 'streaming' && this.ws?.readyState === WebSocket.OPEN) {
        // Acoustic Echo Suppression: drop mic frames strictly while active audio sources are playing
        const isAgentSpeaking = this.activeSources.length > 0;
        if (isAgentSpeaking) {
          return;
        }

        const { pcm16, tCapture } = e.data;
        const pcmArray = new Int16Array(pcm16);
        const frame = packAudioFrame(pcmArray, this.seq++, tCapture);
        this.ws.send(frame);
      }
    };

    // Chromium requires an active path to destination to keep pulling AudioWorklet frames
    const muteNode = this.audioContext.createGain();
    muteNode.gain.setValueAtTime(0, this.audioContext.currentTime);

    source.connect(this.workletNode);
    this.workletNode.connect(muteNode);
    muteNode.connect(this.audioContext.destination);
  }

  private playPcm16Chunk(base64: string): void {
    if (!this.audioContext) return;
    try {
      const binary = atob(base64);
      const len = binary.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const int16 = new Int16Array(bytes.buffer);
      const float32 = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) {
        float32[i] = int16[i] / 32768.0;
      }

      const audioBuffer = this.audioContext.createBuffer(1, float32.length, 16000);
      audioBuffer.getChannelData(0).set(float32);

      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioContext.destination);

      const now = this.audioContext.currentTime;
      if (this.nextPlayTime < now) {
        this.nextPlayTime = now;
      }

      source.start(this.nextPlayTime);
      this.nextPlayTime += audioBuffer.duration;

      this.activeSources.push(source);
      source.onended = () => {
        const idx = this.activeSources.indexOf(source);
        if (idx !== -1) {
          this.activeSources.splice(idx, 1);
        }
        if (this.activeSources.length === 0) {
          this.nextPlayTime = 0;
        }
      };
    } catch (err) {
      console.error('[SessionManager] Error decoding audio chunk:', err);
    }
  }

  public flushPlaybackQueue(): void {
    for (const src of this.activeSources) {
      try {
        src.stop();
        src.disconnect();
      } catch {}
    }
    this.activeSources = [];
    this.nextPlayTime = 0;
  }

  stop(): void {
    this.flushPlaybackQueue();

    if (this.ws) {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'stop' }));
        this.ws.close();
      }
      this.ws = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.setState('idle');
  }
}
