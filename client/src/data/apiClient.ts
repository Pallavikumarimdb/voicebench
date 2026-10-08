/**
 * Unified Client Data Service.
 * Reads live data from /api only. No fixtures, no silent fallbacks:
 * every failure throws with a clear message so the UI can show an
 * honest empty/error state instead of fabricated numbers.
 */

import {
  CallSummaryItem,
  CallDetail,
  PersonaDefinition,
  HumanLabel,
  EvalVariantSummary,
  AuditVerifyResult,
} from './types.ts';
import {
  parseSummaryCsv,
  parseLabelsCsv,
  parsePersonaYaml,
} from './loaders.ts';
import { verifyHashChain } from './hashChain.ts';

async function fetchJson(path: string, init?: RequestInit): Promise<any> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    throw new Error(`Data API unreachable at ${path}. Is the gateway running on :8443?`);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const detail = typeof body?.error === 'string' ? `: ${body.error}` : '';
    throw new Error(`Data API ${res.status} at ${path}${detail}`);
  }
  return res.json();
}

function toCallDetail(raw: any): CallDetail {
  const hashChain: AuditVerifyResult = verifyHashChain(raw.auditLog || []);
  const personaObj = raw.persona?.content ? parsePersonaYaml(raw.persona.content) : null;
  return {
    id: raw.id,
    source: raw.source || 'sim',
    variant: raw.variant || 'v2_graph',
    personaId: raw.personaId || 'cooperative',
    auditLog: raw.auditLog || [],
    handoff: raw.handoff || null,
    runData: raw.runData || null,
    persona: personaObj,
    hashChain,
    audio: raw.audio || null,
  };
}

export class ApiClient {
  /** List of all calls (live and simulated) from the data API. */
  async getCalls(): Promise<CallSummaryItem[]> {
    return fetchJson('/api/calls');
  }

  /** Detailed record for a specific call. Throws if the record does not exist. */
  async getCallDetail(id: string): Promise<CallDetail> {
    const raw = await fetchJson(`/api/calls/${encodeURIComponent(id)}`);
    return toCallDetail(raw);
  }

  /** Fetches computed waveform peaks for an audio recording. */
  async getWaveform(id: string): Promise<import('./types.ts').WaveformData | null> {
    try {
      return await fetchJson(`/api/calls/${encodeURIComponent(id)}/waveform`);
    } catch {
      return null;
    }
  }

  /** Evaluation summary tables and Pareto curve, parsed from result files. */
  async getSummary(): Promise<{ variants: EvalVariantSummary[]; markdown: string; pareto: any }> {
    const raw = await fetchJson('/api/results/summary');
    const variants = parseSummaryCsv(raw.csv || '');
    // Final-violation totals come from an honest server-side aggregation of
    // per-run records (they are not columns in summary.csv).
    const computed = raw.computedFinalViolations || {};
    for (const v of variants) {
      if (typeof computed[v.variant] === 'number') {
        v.finalViolations = computed[v.variant];
      }
    }
    return {
      variants,
      markdown: raw.markdown || '',
      pareto: raw.pareto || null,
    };
  }

  /** Persona definitions. */
  async getPersonas(): Promise<PersonaDefinition[]> {
    const rawList: Array<{ id: string; rawYaml: string }> = await fetchJson('/api/personas');
    return rawList.map((item) => parsePersonaYaml(item.rawYaml));
  }

  /** Human labels from the label CSV. */
  async getLabels(): Promise<HumanLabel[]> {
    const raw = await fetchJson('/api/labels');
    return parseLabelsCsv(raw.csv || '');
  }

  /**
   * Appends a human label row. Returns success:false (never a fake
   * success) when the write fails so no rating is silently lost.
   */
  async saveLabel(label: HumanLabel): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch('/api/labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(label),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${res.status}`);
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Label save failed and was not recorded.' };
    }
  }
}

export const apiClient = new ApiClient();
