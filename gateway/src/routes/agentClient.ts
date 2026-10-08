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

  async turn(req: BrainRequest): Promise<BrainResponse | null> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

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
      console.error(`[AgentClient] Error communicating with Agent service for session ${req.sessionId}:`, err?.message || err);
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
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
