/**
 * Read-Only Data API & Reviewer Endpoints for the Voice Agent Stack.
 * Implements Section 3 of UI_BUILD_PLAN.md:
 * - GET /api/calls
 * - GET /api/calls/:id
 * - GET /api/results/summary
 * - GET /api/results/runs
 * - GET /api/personas
 * - GET /api/labels
 * - POST /api/labels (append-only)
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import url from 'url';

// Root directories
const currentDir =
  typeof __dirname !== 'undefined'
    ? __dirname
    : path.resolve(process.cwd(), 'gateway/src/routes');
const REPO_ROOT = path.resolve(currentDir, '../../..');
const AUDIT_DIR = path.resolve(REPO_ROOT, 'services/agent/audit_logs');
const RESULTS_DIR = path.resolve(REPO_ROOT, 'eval/agent/results');
const PERSONAS_DIR = path.resolve(REPO_ROOT, 'eval/agent/personas');
const LABELING_DIR = path.resolve(REPO_ROOT, 'eval/agent/labeling');

// Whitelisted directories to prevent path traversal
const ALLOWED_DIRS = [AUDIT_DIR, RESULTS_DIR, PERSONAS_DIR, LABELING_DIR];

export function isPathSafe(filePath: string): boolean {
  const resolved = path.resolve(filePath);
  return ALLOWED_DIRS.some((dir) => {
    const rel = path.relative(dir, resolved);
    return !rel.startsWith('..') && !path.isAbsolute(rel);
  });
}

export function isValidId(id: string): boolean {
  return /^[a-zA-Z0-9_\-]+$/.test(id);
}

export function getCorsOrigin(req: http.IncomingMessage): string {
  const reqOrigin = req.headers.origin;
  const configured = (process.env.CORS_ORIGIN || 'http://localhost:5173,http://localhost:4173').split(',').map((s) => s.trim());
  if (configured.includes('*')) return '*';
  if (reqOrigin && configured.includes(reqOrigin)) return reqOrigin;
  // Allow localhost/127.0.0.1 on any port for local development & preview
  if (reqOrigin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(reqOrigin)) {
    return reqOrigin;
  }
  return configured[0] || 'http://localhost:5173';
}

function sendJson(res: http.ServerResponse, status: number, data: any, req?: http.IncomingMessage) {
  const origin = req ? getCorsOrigin(req) : (process.env.CORS_ORIGIN || 'http://localhost:5173');
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  });
  res.end(JSON.stringify(data));
}

function parseJsonBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1e6) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

/**
 * Handles incoming /api/* HTTP requests.
 * Returns true if handled, false otherwise.
 */
export async function handleDataApi(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<boolean> {
  const parsedUrl = url.parse(req.url || '', true);
  const pathname = parsedUrl.pathname || '';

  if (req.method === 'OPTIONS') {
    const origin = getCorsOrigin(req);
    res.writeHead(204, {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin',
    });
    res.end();
    return true;
  }

  // 0. GET /api/health - Unified downstream microservice health check
  if (req.method === 'GET' && pathname === '/api/health') {
    const probe = async (probeUrlStr: string): Promise<boolean> => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 1800);
      try {
        const r = await fetch(probeUrlStr, { signal: ctrl.signal });
        return r.ok;
      } catch {
        return false;
      } finally {
        clearTimeout(t);
      }
    };

    const [sttUp, mtUp, agentUp, ttsUp] = await Promise.all([
      probe(process.env.STT_HEALTH_URL || 'http://localhost:8001/health'),
      probe(process.env.MT_HEALTH_URL || 'http://localhost:8002/health'),
      probe(process.env.AGENT_HEALTH_URL || 'http://localhost:8003/healthz'),
      probe(process.env.TTS_HEALTH_URL || 'http://localhost:8004/health'),
    ]);

    let ollamaUp = false;
    let openaiUp = false;
    if (agentUp) {
      try {
        const agentCtrl = new AbortController();
        const at = setTimeout(() => agentCtrl.abort(), 1800);
        const r = await fetch(process.env.AGENT_HEALTH_URL || 'http://localhost:8003/healthz', { signal: agentCtrl.signal });
        clearTimeout(at);
        if (r.ok) {
          const j = await r.json();
          ollamaUp = j?.llm?.local === true;
          openaiUp = j?.llm?.openai === true;
        }
      } catch {}
    }

    sendJson(res, 200, {
      status: 'ok',
      services: {
        gateway: true,
        stt: sttUp,
        mt: mtUp,
        agent: agentUp,
        tts: ttsUp,
        ollama: ollamaUp,
        openai: openaiUp,
      },
    }, req);
    return true;
  }

  // 1. GET /api/calls
  if (req.method === 'GET' && pathname === '/api/calls') {
    try {
      const calls: any[] = [];
      const runVariants = ['v2_graph', 'v1_baseline', 'v1_no_guard', 'v2_graph_no_slow_path'];

      // Read from runs JSON files
      for (const variant of runVariants) {
        const runFile = path.join(RESULTS_DIR, `runs_${variant}.json`);
        if (fs.existsSync(runFile)) {
          const raw = fs.readFileSync(runFile, 'utf-8');
          const data = JSON.parse(raw);
          const runs = Array.isArray(data.runs) ? data.runs : [];
          for (const r of runs) {
            calls.push({
              id: r.session_id,
              source: 'sim',
              variant: r.variant || variant,
              persona: r.persona_id,
              outcome: r.judge?.outcome || (r.promise_to_pay ? 'promise_secured' : 'unresolved'),
              hardFailPassed: r.hard_fail?.passed ?? true,
              hasComplianceBlock: (r.hard_fail?.num_attempted || 0) > 0,
              hasEscalation: r.judge?.outcome?.includes('escalat') || false,
              totalTurns: r.total_turns || (r.latencies_ms?.length || 0),
              timestamp: parseInt(r.session_id.split('_').pop() || '0', 10) || Date.now(),
              promiseSecured: Boolean(r.promise_to_pay),
            });
          }
        }
      }

      // Also read live calls from audit logs directory
      if (fs.existsSync(AUDIT_DIR)) {
        const files = fs.readdirSync(AUDIT_DIR);
        for (const file of files) {
          if (!file.endsWith('.jsonl')) continue;
          const sessionId = file.replace('.jsonl', '');
          // Avoid duplicate if already loaded from sim runs
          if (calls.some((c) => c.id === sessionId)) continue;

          try {
            const content = fs.readFileSync(path.join(AUDIT_DIR, file), 'utf-8');
            const lines = content.split('\n').filter((l) => l.trim());
            let utteranceTurns = 0;
            let blocked = false;
            let firstTs = Date.now();
            let sawTs = false;
            for (const line of lines) {
              try {
                const rec = JSON.parse(line);
                if (!sawTs && typeof rec.ts === 'number') {
                  firstTs = rec.ts;
                  sawTs = true;
                }
                if (rec.stage === 'user_utterance' || rec.stage === 'agent_utterance') {
                  utteranceTurns += 1;
                }
                if (rec.stage === 'compliance_block') {
                  blocked = true;
                }
              } catch {}
            }
            calls.push({
              id: sessionId,
              source: sessionId.startsWith('sim_') ? 'sim' : 'live',
              variant: sessionId.includes('v2_graph') ? 'v2_graph' : sessionId.includes('v1_baseline') ? 'v1_baseline' : 'live_agent',
              persona: sessionId.includes('cooperative') ? 'cooperative' : sessionId.includes('hostile') ? 'hostile' : 'live_caller',
              outcome: 'recorded',
              // Raw audit rows were never run through the eval harness:
              // report unknown instead of a passing grade.
              hardFailPassed: null,
              hasComplianceBlock: blocked,
              hasEscalation: false,
              totalTurns: utteranceTurns,
              timestamp: firstTs,
              promiseSecured: false,
            });
          } catch {}
        }
      }

      // Newest first: live calls under test surface on page 1 instead of
      // being buried behind hundreds of historical sim rows.
      calls.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

      sendJson(res, 200, calls);
      return true;
    } catch (err: any) {
      sendJson(res, 500, { error: err.message });
      return true;
    }
  }

  // 2. GET /api/calls/:id
  if (req.method === 'GET' && pathname.startsWith('/api/calls/')) {
    const id = pathname.replace('/api/calls/', '').trim();
    if (!isValidId(id)) {
      sendJson(res, 400, { error: 'Invalid call session ID (path traversal denied)' });
      return true;
    }

    const auditFile = path.join(AUDIT_DIR, `${id}.jsonl`);
    let auditLog: any[] = [];
    if (fs.existsSync(auditFile)) {
      const lines = fs.readFileSync(auditFile, 'utf-8').split('\n');
      for (const line of lines) {
        if (line.trim()) {
          try {
            auditLog.push(JSON.parse(line));
          } catch {}
        }
      }
    }

    // Lookup matching run details if from simulation
    let runData: any = null;
    let personaId = '';
    let variant = 'unknown';

    const runVariants = ['v2_graph', 'v1_baseline', 'v1_no_guard', 'v2_graph_no_slow_path'];
    for (const v of runVariants) {
      const runFile = path.join(RESULTS_DIR, `runs_${v}.json`);
      if (fs.existsSync(runFile)) {
        try {
          const data = JSON.parse(fs.readFileSync(runFile, 'utf-8'));
          const found = (data.runs || []).find((r: any) => r.session_id === id);
          if (found) {
            runData = found;
            personaId = found.persona_id;
            variant = found.variant || v;
            break;
          }
        } catch {}
      }
    }

    // If personaId found, read persona YAML
    let persona: any = null;
    // [C6] Validate personaId before using it in a file path
    if (personaId && isValidId(personaId)) {
      const personaPath = path.join(PERSONAS_DIR, `${personaId}.yaml`);
      if (isPathSafe(personaPath) && fs.existsSync(personaPath)) {
        persona = {
          id: personaId,
          content: fs.readFileSync(personaPath, 'utf-8'),
        };
      }
    }

    // No audit trail and no eval run: the record genuinely does not exist.
    if (auditLog.length === 0 && !runData) {
      sendJson(res, 404, { error: `Call record '${id}' not found` }, req);
      return true;
    }

    let handoff: any = null;
    for (const entry of auditLog) {
      if (entry.stage === 'handoff' && entry.payload) {
        handoff = entry.payload;
        break;
      }
    }
    if (!handoff && runData) {
      handoff = {
        session_id: id,
        identity_verified: Boolean(runData.hard_fail?.passed),
        debtor_name: persona?.debtor_profile?.full_name || personaId || 'Simulated contact',
        recommended_next_action: runData.promise_to_pay
          ? `PAYMENT_MONITORING: Monitor payment schedule (${runData.promise_to_pay.amount ? '¥' + runData.promise_to_pay.amount.toLocaleString() : 'recorded'})`
          : runData.hard_fail?.passed
          ? 'FOLLOW_UP: Follow up in calling hours'
          : 'VERIFICATION_FAILED: Retry contact during approved hours',
        total_turns: runData.total_turns || (runData.latencies_ms?.length || 0),
      };
    }

    sendJson(res, 200, {
      id,
      source: id.startsWith('sim_') ? 'sim' : 'live',
      variant,
      personaId,
      auditLog,
      runData,
      persona,
      handoff,
    }, req);
    return true;
  }

  // 3. GET /api/results/summary
  if (req.method === 'GET' && pathname === '/api/results/summary') {
    try {
      const csvPath = path.join(RESULTS_DIR, 'summary.csv');
      const mdPath = path.join(RESULTS_DIR, 'summary.md');
      const paretoPath = path.join(RESULTS_DIR, 'latency_pareto.json');

      const csvContent = fs.existsSync(csvPath) ? fs.readFileSync(csvPath, 'utf-8') : '';
      const mdContent = fs.existsSync(mdPath) ? fs.readFileSync(mdPath, 'utf-8') : '';
      const pareto = fs.existsSync(paretoPath) ? JSON.parse(fs.readFileSync(paretoPath, 'utf-8')) : null;

      // Final-violation totals are not in summary.csv: aggregate them honestly
      // from the per-run hard_fail records instead of guessing.
      const computedFinalViolations: Record<string, number> = {};
      for (const variant of ['v2_graph', 'v1_baseline', 'v1_no_guard', 'v2_graph_no_slow_path']) {
        const runFile = path.join(RESULTS_DIR, `runs_${variant}.json`);
        if (!fs.existsSync(runFile)) continue;
        try {
          const data = JSON.parse(fs.readFileSync(runFile, 'utf-8'));
          let total = 0;
          for (const r of data.runs || []) {
            total += r.hard_fail?.num_final || 0;
          }
          computedFinalViolations[variant] = total;
        } catch {}
      }

      sendJson(res, 200, {
        csv: csvContent,
        markdown: mdContent,
        pareto,
        computedFinalViolations,
      });
      return true;
    } catch (err: any) {
      sendJson(res, 500, { error: err.message });
      return true;
    }
  }

  // 4. GET /api/results/runs?variant=&persona=&failed=
  if (req.method === 'GET' && pathname === '/api/results/runs') {
    try {
      const targetVariant = (parsedUrl.query.variant as string) || '';
      const targetPersona = (parsedUrl.query.persona as string) || '';
      const onlyFailed = parsedUrl.query.failed === 'true';

      const variantsToLoad = targetVariant
        ? [targetVariant]
        : ['v2_graph', 'v1_baseline', 'v1_no_guard', 'v2_graph_no_slow_path'];

      let allRuns: any[] = [];
      for (const v of variantsToLoad) {
        if (!isValidId(v)) continue;
        const runFile = path.join(RESULTS_DIR, `runs_${v}.json`);
        if (fs.existsSync(runFile)) {
          const data = JSON.parse(fs.readFileSync(runFile, 'utf-8'));
          allRuns = allRuns.concat(data.runs || []);
        }
      }

      if (targetPersona) {
        allRuns = allRuns.filter((r) => r.persona_id === targetPersona);
      }
      if (onlyFailed) {
        allRuns = allRuns.filter((r) => r.hard_fail && !r.hard_fail.passed);
      }

      sendJson(res, 200, { runs: allRuns });
      return true;
    } catch (err: any) {
      sendJson(res, 500, { error: err.message });
      return true;
    }
  }

  // 5. GET /api/personas
  if (req.method === 'GET' && pathname === '/api/personas') {
    try {
      const personas: any[] = [];
      if (fs.existsSync(PERSONAS_DIR)) {
        const files = fs.readdirSync(PERSONAS_DIR);
        for (const file of files) {
          if (file.endsWith('.yaml')) {
            const content = fs.readFileSync(path.join(PERSONAS_DIR, file), 'utf-8');
            personas.push({
              id: file.replace('.yaml', ''),
              rawYaml: content,
            });
          }
        }
      }
      sendJson(res, 200, personas);
      return true;
    } catch (err: any) {
      sendJson(res, 500, { error: err.message });
      return true;
    }
  }

  // 6. GET /api/labels and POST /api/labels
  if (pathname === '/api/labels') {
    const targetCsv = path.join(LABELING_DIR, 'human_labels.csv');
    const templateCsv = path.join(LABELING_DIR, 'template.csv');

    if (req.method === 'GET') {
      try {
        const fileToRead = fs.existsSync(targetCsv) ? targetCsv : templateCsv;
        const content = fs.existsSync(fileToRead) ? fs.readFileSync(fileToRead, 'utf-8') : '';
        sendJson(res, 200, { csv: content });
        return true;
      } catch (err: any) {
        sendJson(res, 500, { error: err.message });
        return true;
      }
    }

    if (req.method === 'POST') {
      try {
        const body = await parseJsonBody(req);
        const {
          transcript_id,
          persona_id,
          human_listening_score,
          human_pacing_score,
          human_recovery_score,
          human_negotiation_score,
          human_confirmation_score,
          human_escalation_score,
          human_outcome_pass_fail,
          notes,
        } = body;

        if (!transcript_id || !persona_id) {
          sendJson(res, 400, { error: 'transcript_id and persona_id are required' });
          return true;
        }

        // [M5] Validate that transcript_id and persona_id match safe patterns
        if (!isValidId(String(transcript_id)) || !isValidId(String(persona_id))) {
          sendJson(res, 400, { error: 'Invalid transcript_id or persona_id format' });
          return true;
        }

        // [M5] Validate numeric score fields are integers in [1, 5]
        const scoreFields = [
          human_listening_score, human_pacing_score, human_recovery_score,
          human_negotiation_score, human_confirmation_score, human_escalation_score,
        ];
        for (const score of scoreFields) {
          if (score !== undefined && score !== '') {
            const n = Number(score);
            if (!Number.isInteger(n) || n < 1 || n > 5) {
              sendJson(res, 400, { error: `Score values must be integers between 1 and 5` });
              return true;
            }
          }
        }

        // Initialize human_labels.csv if it does not exist
        if (!fs.existsSync(targetCsv)) {
          const header = fs.existsSync(templateCsv)
            ? fs.readFileSync(templateCsv, 'utf-8').split('\n')[0]
            : 'transcript_id,persona_id,human_listening_score,human_pacing_score,human_recovery_score,human_negotiation_score,human_confirmation_score,human_escalation_score,human_outcome_pass_fail,notes';
          fs.writeFileSync(targetCsv, header + '\n', 'utf-8');
        }

        // [M5] Strip CSV formula injection prefixes and escape for CSV safe writing
        const escapeVal = (v: any) => {
          let str = String(v ?? '').trim();
          // Strip formula injection characters (=, +, -, @, tab, cr) from start of string
          str = str.replace(/^[=+\-@\t\r]+/, '');
          // Sanitize internal newlines to keep single-row CSV integrity
          str = str.replace(/[\r\n]+/g, ' ');
          return str.includes(',') || str.includes('"')
            ? `"${str.replace(/"/g, '""')}"`
            : str;
        };

        const row = [
          escapeVal(transcript_id),
          escapeVal(persona_id),
          escapeVal(human_listening_score || ''),
          escapeVal(human_pacing_score || ''),
          escapeVal(human_recovery_score || ''),
          escapeVal(human_negotiation_score || ''),
          escapeVal(human_confirmation_score || ''),
          escapeVal(human_escalation_score || ''),
          escapeVal((human_outcome_pass_fail || 'PASS').toUpperCase()),
          escapeVal(notes || ''),
        ].join(',');

        // Strictly append-only
        fs.appendFileSync(targetCsv, row + '\n', 'utf-8');

        sendJson(res, 201, { status: 'ok', appendedRow: row });
        return true;
      } catch (err: any) {
        console.error('[DataAPI POST /api/labels] Internal error:', err);
        sendJson(res, 500, { error: 'Internal server error' });
        return true;
      }
    }
  }

  return false;
}
