import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createWavHeader, computePeaks, CallRecorder, generateSyntheticCallAudio } from '../src/recorder.ts';

describe('Dual-Channel Audio Recorder & Waveform Engine', () => {
  it('creates valid 44-byte RIFF/WAVE header for 16kHz 16-bit stereo', () => {
    const dataLen = 64000; // 1 second of stereo 16kHz 16-bit PCM
    const header = createWavHeader(dataLen, 16000, 2, 16);

    assert.strictEqual(header.length, 44);
    assert.strictEqual(header.toString('utf-8', 0, 4), 'RIFF');
    assert.strictEqual(header.readUInt32LE(4), 36 + dataLen);
    assert.strictEqual(header.toString('utf-8', 8, 12), 'WAVE');
    assert.strictEqual(header.toString('utf-8', 12, 16), 'fmt ');
    assert.strictEqual(header.readUInt32LE(16), 16); // PCM fmt chunk size
    assert.strictEqual(header.readUInt16LE(20), 1); // PCM format
    assert.strictEqual(header.readUInt16LE(22), 2); // 2 channels (stereo)
    assert.strictEqual(header.readUInt32LE(24), 16000); // 16kHz
    assert.strictEqual(header.readUInt32LE(28), 64000); // Byte rate (16000 * 2 * 2)
    assert.strictEqual(header.readUInt16LE(32), 4); // Block align (4 bytes per sample frame)
    assert.strictEqual(header.readUInt16LE(34), 16); // Bits per sample
    assert.strictEqual(header.toString('utf-8', 36, 40), 'data');
    assert.strictEqual(header.readUInt32LE(40), dataLen);
  });

  it('records caller and agent streams and produces stereo WAV', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'voice_rec_test_'));
    const sessionId = 'test_call_rec_001';
    const recorder = new CallRecorder(sessionId, tempDir);

    // 100ms of caller speech at 440Hz
    const callerSamples = 1600;
    const callerPcm = Buffer.alloc(callerSamples * 2);
    for (let i = 0; i < callerSamples; i++) {
      callerPcm.writeInt16LE(Math.floor(Math.sin((2 * Math.PI * 440 * i) / 16000) * 10000), i * 2);
    }
    recorder.recordCaller(callerPcm);

    // 100ms of agent speech at 880Hz
    const agentSamples = 1600;
    const agentPcm = Buffer.alloc(agentSamples * 2);
    for (let i = 0; i < agentSamples; i++) {
      agentPcm.writeInt16LE(Math.floor(Math.sin((2 * Math.PI * 880 * i) / 16000) * 12000), i * 2);
    }
    recorder.recordAgent(agentPcm);

    const result = recorder.finalize();
    assert.ok(result);
    assert.ok(fs.existsSync(result.filePath));

    const stat = fs.statSync(result.filePath);
    assert.ok(stat.size > 44, 'WAV file must contain audio data beyond header');

    // Verify WAV format signature
    const header = Buffer.alloc(44);
    const fd = fs.openSync(result.filePath, 'r');
    fs.readSync(fd, header, 0, 44, 0);
    fs.closeSync(fd);

    assert.strictEqual(header.toString('utf-8', 0, 4), 'RIFF');
    assert.strictEqual(header.toString('utf-8', 8, 12), 'WAVE');
    assert.strictEqual(header.readUInt16LE(22), 2); // stereo

    // Verify peaks file was generated
    const peaksFile = path.join(tempDir, `${sessionId}_peaks.json`);
    assert.ok(fs.existsSync(peaksFile));
    const peaksData = JSON.parse(fs.readFileSync(peaksFile, 'utf-8'));
    assert.strictEqual(peaksData.channels, 2);
    assert.strictEqual(peaksData.sampleRate, 16000);
    assert.ok(Array.isArray(peaksData.peaks));
    assert.ok(peaksData.peaks.length > 0);

    // Cleanup
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('computes normalized amplitude envelope peaks correctly', () => {
    // Generate 1600 samples (100ms) with known amplitude peak 16384 (50%)
    const pcm = Buffer.alloc(3200);
    for (let i = 0; i < 1600; i++) {
      pcm.writeInt16LE(16384, i * 2);
    }
    const peaks = computePeaks(pcm, 10);
    assert.strictEqual(peaks.length, 10);
    for (const p of peaks) {
      assert.ok(p >= 0.49 && p <= 0.51, `Peak ${p} should be ~0.50`);
    }
  });

  it('generates synthetic audio for simulated call logs', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synth_rec_test_'));
    const sessionId = 'sim_synth_001';
    const auditLog = [
      { stage: 'user_utterance', payload: { text: 'Hello, this is Alex speaking.' } },
      { stage: 'agent_utterance', payload: { final: 'Good morning Alex, calling from Mirae Finance.' } },
    ];

    const wavPath = generateSyntheticCallAudio(sessionId, auditLog, tempDir);
    assert.ok(fs.existsSync(wavPath));

    const stat = fs.statSync(wavPath);
    assert.ok(stat.size > 10000, 'Synthetic audio file should have multiple seconds of audio');

    // Check peaks file
    const peaksPath = path.join(tempDir, `${sessionId}_peaks.json`);
    assert.ok(fs.existsSync(peaksPath));
    const peaks = JSON.parse(fs.readFileSync(peaksPath, 'utf-8'));
    assert.ok(peaks.durationSec >= 4);
    assert.ok(peaks.peaks.length > 0);

    fs.rmSync(tempDir, { recursive: true, force: true });
  });
});
