/**
 * Dual-Channel Call Audio Recorder & WAV Formatter.
 * Captures live audio streams from caller (Left channel) and agent (Right channel),
 * interleaves 16kHz 16-bit PCM, and produces production-grade stereo WAV recordings.
 */

import fs from 'fs';
import path from 'path';

export interface WaveformSummary {
  durationSec: number;
  sampleRate: number;
  channels: number;
  peaks: number[]; // Normalized [0, 1] amplitude envelope for visual scrubbing
}

/**
 * Creates standard 44-byte RIFF/WAVE header for linear PCM audio.
 */
export function createWavHeader(
  dataLength: number,
  sampleRate = 16000,
  numChannels = 2,
  bitsPerSample = 16
): Buffer {
  const header = Buffer.alloc(44);
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;

  // RIFF Chunk
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataLength, 4);
  header.write('WAVE', 8);

  // Subchunk 1: fmt
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  header.writeUInt16LE(1, 20); // AudioFormat (1 for PCM)
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);

  // Subchunk 2: data
  header.write('data', 36);
  header.writeUInt32LE(dataLength, 40);

  return header;
}

/**
 * Computes a normalized amplitude envelope (peaks) from 16-bit PCM buffer.
 */
export function computePeaks(pcmBuffer: Buffer, targetPoints = 120): number[] {
  const totalSamples = Math.floor(pcmBuffer.length / 2);
  if (totalSamples === 0) return Array(targetPoints).fill(0);

  const blockSize = Math.max(1, Math.floor(totalSamples / targetPoints));
  const peaks: number[] = [];

  for (let i = 0; i < targetPoints; i++) {
    const startSample = i * blockSize;
    const endSample = Math.min(totalSamples, startSample + blockSize);
    let maxAmp = 0;

    for (let s = startSample; s < endSample; s++) {
      const val = Math.abs(pcmBuffer.readInt16LE(s * 2));
      if (val > maxAmp) maxAmp = val;
    }
    // Normalize to [0.05, 1.0] for rich visual rendering
    peaks.push(Math.min(1.0, Math.max(0.04, Math.round((maxAmp / 32768) * 100) / 100)));
  }

  return peaks;
}

export class CallRecorder {
  private sessionId: string;
  private startTime: number;
  private callerChunks: { offsetMs: number; pcm16: Buffer }[] = [];
  private agentChunks: { offsetMs: number; pcm16: Buffer }[] = [];
  private sampleRate = 16000;
  private recordingsDir: string;

  constructor(sessionId: string, recordingsDir: string) {
    this.sessionId = sessionId;
    this.startTime = Date.now();
    this.recordingsDir = recordingsDir;
    if (!fs.existsSync(this.recordingsDir)) {
      fs.mkdirSync(this.recordingsDir, { recursive: true });
    }
  }

  recordCaller(pcm16: Buffer, timestamp = Date.now()) {
    if (!pcm16 || pcm16.length === 0) return;
    const offsetMs = Math.max(0, timestamp - this.startTime);
    this.callerChunks.push({ offsetMs, pcm16 });
  }

  recordAgent(pcm16: Buffer, timestamp = Date.now()) {
    if (!pcm16 || pcm16.length === 0) return;
    const offsetMs = Math.max(0, timestamp - this.startTime);
    this.agentChunks.push({ offsetMs, pcm16 });
  }

  finalize(): { filePath: string; durationSec: number } | null {
    const now = Date.now();
    let maxOffsetMs = Math.max(1000, now - this.startTime);

    for (const c of this.callerChunks) {
      const endOffset = c.offsetMs + (c.pcm16.length / 2 / this.sampleRate) * 1000;
      if (endOffset > maxOffsetMs) maxOffsetMs = endOffset;
    }
    for (const a of this.agentChunks) {
      const endOffset = a.offsetMs + (a.pcm16.length / 2 / this.sampleRate) * 1000;
      if (endOffset > maxOffsetMs) maxOffsetMs = endOffset;
    }

    const durationSec = Math.max(1, Math.round(maxOffsetMs / 1000));
    const totalSamples = Math.floor(durationSec * this.sampleRate);

    // Left Channel = Caller, Right Channel = Agent
    const leftChannel = new Int16Array(totalSamples);
    const rightChannel = new Int16Array(totalSamples);

    for (const chunk of this.callerChunks) {
      const startIdx = Math.floor((chunk.offsetMs / 1000) * this.sampleRate);
      const samplesInChunk = Math.floor(chunk.pcm16.length / 2);
      for (let i = 0; i < samplesInChunk; i++) {
        if (startIdx + i < totalSamples) {
          leftChannel[startIdx + i] = chunk.pcm16.readInt16LE(i * 2);
        }
      }
    }

    for (const chunk of this.agentChunks) {
      const startIdx = Math.floor((chunk.offsetMs / 1000) * this.sampleRate);
      const samplesInChunk = Math.floor(chunk.pcm16.length / 2);
      for (let i = 0; i < samplesInChunk; i++) {
        if (startIdx + i < totalSamples) {
          rightChannel[startIdx + i] = chunk.pcm16.readInt16LE(i * 2);
        }
      }
    }

    // Interleave stereo PCM16
    const interleaved = Buffer.alloc(totalSamples * 4);
    for (let i = 0; i < totalSamples; i++) {
      interleaved.writeInt16LE(leftChannel[i], i * 4);
      interleaved.writeInt16LE(rightChannel[i], i * 4 + 2);
    }

    const wavHeader = createWavHeader(interleaved.length, this.sampleRate, 2, 16);
    const finalBuffer = Buffer.concat([wavHeader, interleaved]);

    const filePath = path.join(this.recordingsDir, `${this.sessionId}.wav`);
    fs.writeFileSync(filePath, finalBuffer);

    // Also persist waveform peaks JSON for instant UI rendering
    const peaks = computePeaks(interleaved, 140);
    const peaksPath = path.join(this.recordingsDir, `${this.sessionId}_peaks.json`);
    fs.writeFileSync(
      peaksPath,
      JSON.stringify({
        durationSec,
        sampleRate: this.sampleRate,
        channels: 2,
        peaks,
      })
    );

    return { filePath, durationSec };
  }
}

/**
 * Generates an audible synthetic stereo WAV for simulated calls so they can be
 * previewed, scrubbed, and played back directly in Call Inspector.
 */
export function generateSyntheticCallAudio(
  sessionId: string,
  auditLog: any[],
  recordingsDir: string
): string {
  if (!fs.existsSync(recordingsDir)) {
    fs.mkdirSync(recordingsDir, { recursive: true });
  }

  const filePath = path.join(recordingsDir, `${sessionId}.wav`);
  if (fs.existsSync(filePath)) {
    return filePath;
  }

  const sampleRate = 16000;
  const turns = (auditLog || []).filter(
    (r) => r.stage === 'user_utterance' || r.stage === 'agent_utterance'
  );
  const numTurns = Math.max(1, turns.length);
  // Allocate ~2.5 seconds per turn
  const totalDurationSec = Math.max(4, numTurns * 2.5);
  const totalSamples = Math.floor(totalDurationSec * sampleRate);

  const leftChannel = new Int16Array(totalSamples);
  const rightChannel = new Int16Array(totalSamples);

  let currentSample = Math.floor(0.5 * sampleRate);

  for (let idx = 0; idx < turns.length; idx++) {
    const t = turns[idx];
    const isCaller = t.stage === 'user_utterance';
    const textLen = (t.payload?.text || t.payload?.final || '').length;
    const duration = Math.min(4.0, Math.max(1.2, textLen * 0.06));
    const samples = Math.floor(duration * sampleRate);

    // Generate harmonic vocal-like tone with envelope
    const baseFreq = isCaller ? 220 : 340; // Caller lower pitch, Agent edge neural pitch
    for (let s = 0; s < samples; s++) {
      if (currentSample + s < totalSamples) {
        const timeSec = s / sampleRate;
        // Modulate with speech-like harmonics and envelope
        const envelope = Math.sin((Math.PI * s) / samples);
        const harmonic1 = Math.sin(2 * Math.PI * baseFreq * timeSec);
        const harmonic2 = 0.5 * Math.sin(2 * Math.PI * (baseFreq * 2) * timeSec);
        const harmonic3 = 0.25 * Math.sin(2 * Math.PI * (baseFreq * 3) * timeSec);
        const sampleVal = Math.floor((harmonic1 + harmonic2 + harmonic3) * 6000 * envelope);

        if (isCaller) {
          leftChannel[currentSample + s] = sampleVal;
        } else {
          rightChannel[currentSample + s] = sampleVal;
        }
      }
    }
    currentSample += samples + Math.floor(0.5 * sampleRate);
  }

  // Interleave
  const interleaved = Buffer.alloc(totalSamples * 4);
  for (let i = 0; i < totalSamples; i++) {
    interleaved.writeInt16LE(leftChannel[i], i * 4);
    interleaved.writeInt16LE(rightChannel[i], i * 4 + 2);
  }

  const header = createWavHeader(interleaved.length, sampleRate, 2, 16);
  const fullWav = Buffer.concat([header, interleaved]);
  fs.writeFileSync(filePath, fullWav);

  const peaks = computePeaks(interleaved, 140);
  const peaksPath = path.join(recordingsDir, `${sessionId}_peaks.json`);
  fs.writeFileSync(
    peaksPath,
    JSON.stringify({
      durationSec: Math.round(totalDurationSec),
      sampleRate,
      channels: 2,
      peaks,
    })
  );

  return filePath;
}
