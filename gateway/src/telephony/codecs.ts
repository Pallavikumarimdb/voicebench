/**
 * G.711 mu-law (PCMU) <-> 16-bit Linear PCM Codec & Resampler
 * 
 * Standards compliant ITU-T G.711 mu-law implementation with
 * zero external native dependencies. Performs bidirectional transcoding
 * between telephony standard (8kHz 8-bit mu-law) and voice AI pipeline
 * standard (16kHz 16-bit Linear PCM).
 */

// Precomputed 256-entry lookup table for ultra-fast mu-law to linear 16-bit PCM conversion
const MULAW_TO_LINEAR_TABLE = new Int16Array(256);
for (let i = 0; i < 256; i++) {
  let mu = ~i & 0xff;
  let sign = mu & 0x80;
  let exponent = (mu >> 4) & 0x07;
  let mantissa = mu & 0x0f;
  let sample = ((mantissa << 3) + 0x84) << exponent;
  sample -= 0x84;
  MULAW_TO_LINEAR_TABLE[i] = sign !== 0 ? -sample : sample;
}

/**
 * Encodes a 16-bit linear PCM sample into an 8-bit mu-law byte.
 */
export function linearToMuLawSample(sample: number): number {
  const CLIP = 32635;
  const BIAS = 0x84;

  let sign = (sample >> 8) & 0x80;
  if (sign !== 0) sample = -sample;
  if (sample > CLIP) sample = CLIP;
  sample += BIAS;

  let exponent = 7;
  for (let expMask = 0x4000; (sample & expMask) === 0 && exponent > 0; expMask >>= 1) {
    exponent--;
  }

  let mantissa = (sample >> (exponent + 3)) & 0x0f;
  let muLawByte = ~(sign | (exponent << 4) | mantissa) & 0xff;
  return muLawByte;
}

/**
 * Decodes an 8-bit mu-law byte into a 16-bit linear PCM sample.
 */
export function muLawToLinearSample(muLawByte: number): number {
  return MULAW_TO_LINEAR_TABLE[muLawByte & 0xff];
}

/**
 * Transcodes 8kHz mu-law audio buffer (Twilio standard) to 16kHz 16-bit Linear PCM buffer (AI Pipeline standard).
 * Uses linear interpolation for smooth, artifact-free upsampling.
 */
export function decodeMuLaw8kToPcm16k(muLawBuffer: Buffer): Buffer {
  const inLength = muLawBuffer.length;
  // 8kHz mu-law (1 byte/sample) -> 16kHz 16-bit PCM (2 bytes/sample * 2 samples = 4 bytes per input byte)
  const outPcm = Buffer.alloc(inLength * 4);
  let outOffset = 0;

  for (let i = 0; i < inLength; i++) {
    const s0 = MULAW_TO_LINEAR_TABLE[muLawBuffer[i]];
    const nextByte = i + 1 < inLength ? muLawBuffer[i + 1] : muLawBuffer[i];
    const s1 = MULAW_TO_LINEAR_TABLE[nextByte];
    const interpolated = Math.round((s0 + s1) / 2);

    // Sample 0
    outPcm.writeInt16LE(s0, outOffset);
    outOffset += 2;
    // Sample 1 (interpolated)
    outPcm.writeInt16LE(interpolated, outOffset);
    outOffset += 2;
  }

  return outPcm;
}

/**
 * Transcodes 16kHz or 24kHz 16-bit Linear PCM buffer (TTS output) to 8kHz mu-law buffer (Twilio / SIP standard).
 */
export function encodePcmToMuLaw8k(pcmBuffer: Buffer, inputSampleRate: number = 16000): Buffer {
  const numSamples = Math.floor(pcmBuffer.length / 2);
  const ratio = inputSampleRate / 8000;
  const outLength = Math.floor(numSamples / ratio);
  const muLawBuffer = Buffer.alloc(outLength);

  for (let i = 0; i < outLength; i++) {
    const srcIndex = Math.floor(i * ratio) * 2;
    if (srcIndex + 1 < pcmBuffer.length) {
      const pcmSample = pcmBuffer.readInt16LE(srcIndex);
      muLawBuffer[i] = linearToMuLawSample(pcmSample);
    } else {
      muLawBuffer[i] = 0xff; // silence in mu-law
    }
  }

  return muLawBuffer;
}
