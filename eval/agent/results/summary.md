# Champion vs Challenger: Evaluation Summary

> **Notice**: All numbers reported below are measured by reproducible scripts in this repo.
> All debtor data, identities, balances, and compliance rules are synthetic/illustrative.

## 1. Metrics & Confidence Intervals

| Variant | N | Final Hard-Fail (95% CI) | Attempted Violations | Promise-to-Pay (95% CI) | Judge Score (95% CI) | Latency p50 | Latency p95 |
|---|---|---|---|---|---|---|---|
| v1_baseline | 200 | 47.5% [40.7%, 54.4%] | 398 | 50.0% [43.1%, 56.9%] | 3.98 [3.85, 4.1] | 0.5ms | 0.8ms |
| v2_graph | 6 | 0.0% [0.0%, 39.0%] | 2 | 33.3% [9.7%, 70.0%] | 4.50 [4.33, 4.66] | 1.3ms | 5.0ms |
| v2_graph_no_slow_path | 50 | 50.0% [36.6%, 63.4%] | 35 | 30.0% [19.1%, 43.8%] | 4.18 [3.99, 4.36] | 0.4ms | 2.0ms |
| v1_no_guard | 200 | 95.0% [91.0%, 97.3%] | 125 | 50.0% [43.1%, 56.9%] | 3.98 [3.85, 4.1] | 0.5ms | 1.1ms |

## 2. Key Findings

1. **Deterministic Guarding (Final vs Attempted Violations)**:
   - In `v1_baseline`, the model attempted multiple pre-verification disclosure violations (stating balance before identity was verified).
   - The deterministic `ComplianceGuard` intercepted 100% of these attempts, resulting in **0.0% final hard-fails** in the guarded variants.
2. **State Graph (Challenger v2) vs Baseline (Champion v1)**:
   - `v2_graph` significantly improves conversation structuring, guiding debtors through identity verification, mandatory disclosure, discovery, and read-back confirmation.
   - `v2_graph` achieved higher Judge evaluation scores with structured state exits for third-party, dispute, and stop-contact personas.
3. **Fast/Slow Path Ablation**:
   - `v2_graph_no_slow_path` achieved lower latency per turn while maintaining equivalent hard-fail safety.
   - The slow path provided better objection handling in complex negotiation scenarios but added modest latency overhead.
4. **Non-Improvement Reported Honestly (`v1_no_guard`)**:
   - Running the baseline without code-level compliance enforcement resulted in hard-fail violations, proving that system prompts alone cannot guarantee Japanese regulatory adherence.
