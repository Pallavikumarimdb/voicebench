import { WebSocket } from 'ws';
import { Session } from './Session';
import { metrics } from './metrics';

const MAX_BUFFERED_BYTES = parseInt(process.env.MAX_BUFFERED_BYTES || '524288', 10);

/**
 * Drop-oldest backpressure policy:
 * Checks ws.bufferedAmount rather than maintaining an unbounded queue in RAM.
 * If the downstream STT service connection buffer exceeds the limit, frame is dropped
 * and metrics.droppedFrames is incremented.
 */
export function forwardAudioFrame(session: Session, frame: Buffer): boolean {
  if (!session.sttWs || session.sttWs.readyState !== WebSocket.OPEN) {
    session.audioChannelDepth = 0;
    return false;
  }

  // Update gauge for monitoring
  session.audioChannelDepth = session.sttWs.bufferedAmount;
  metrics.queueDepth.set({ stage: 'stt' }, session.audioChannelDepth);

  if (session.sttWs.bufferedAmount > MAX_BUFFERED_BYTES) {
    metrics.droppedFrames.inc({ session: session.id });
    return false; // Drop frame to shed load
  }

  session.sttWs.send(frame);
  return true;
}
