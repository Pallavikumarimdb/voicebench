import { metrics } from '../metrics';
import { BrainRequest, BrainResponse } from '@voice/protocol';

export class AgentClient {
  private serviceUrl: string;
  private timeoutMs: number;

  constructor(
    serviceUrl: string = process.env.AGENT_SERVICE_URL || 'http://localhost:8003/turn',
    timeoutMs = 30000
  ) {
    this.serviceUrl = serviceUrl;
    this.timeoutMs = timeoutMs;
  }

  async turn(req: BrainRequest, externalSignal?: AbortSignal): Promise<BrainResponse | null> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    const onExternalAbort = () => controller.abort();
    if (externalSignal) {
      if (externalSignal.aborted) {
        controller.abort();
      } else {
        externalSignal.addEventListener('abort', onExternalAbort, { once: true });
      }
    }

    try {
      const response = await fetch(this.serviceUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Agent service returned status ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as BrainResponse;
      return data;
    } catch (err: any) {
      if (err?.name === 'AbortError' || controller.signal.aborted) {
        console.log(`[AgentClient] Turn cancelled for session ${req.sessionId}`);
      } else {
        console.error(`[AgentClient] Error communicating with Agent service for session ${req.sessionId}:`, err?.message || err);
      }
      return null;
    } finally {
      clearTimeout(timeoutId);
      if (externalSignal) {
        externalSignal.removeEventListener('abort', onExternalAbort);
      }
    }
  }

  async cancelTurn(sessionId: string, uttId?: number): Promise<any> {
    const cancelUrl = this.serviceUrl.replace(/\/turn$/, '/turn/cancel');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    try {
      const response = await fetch(cancelUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, uttId }),
        signal: controller.signal,
      });
      if (response.ok) {
        return await response.json();
      }
    } catch (err: any) {
      // Best-effort cancel notification
    } finally {
      clearTimeout(timeoutId);
    }
    return null;
  }

  async endSession(sessionId: string): Promise<any> {
    const endUrl = this.serviceUrl.replace(/\/turn$/, '/session/end');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(endUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
        signal: controller.signal,
      });
      if (response.ok) {
        return await response.json();
      }
    } catch (err: any) {
      console.warn(`[AgentClient] Error ending session ${sessionId}:`, err?.message || err);
    } finally {
      clearTimeout(timeoutId);
    }
    return null;
  }
}
