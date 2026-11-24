# Apple Silicon Inference with MLX Backend (`mlx_lm.server`)

> **Plan 1 Task P7-T4:** Documenting `mlx_lm.server` as an `openai_compatible` backend on Apple Silicon.

The VoiceAI Infra LLM Gateway natively supports Apple Silicon acceleration through `mlx_lm.server`, exposing an OpenAI-compatible HTTP interface without requiring custom adapter code.

---

## 1. Overview & Advantages

On Apple Silicon (M1/M2/M3/M4 Max/Pro), unified memory architecture enables 4-bit and 8-bit quantized models to run with extreme bandwidth and near-zero memory transfer overhead:
- **Zero adapter modifications:** `mlx_lm.server` adheres to the `/v1/chat/completions` API specification with Server-Sent Events (SSE) streaming.
- **Unified memory bandwidth:** Achieves up to 60–90 tok/s on M-series chips for 7B–14B models.
- **Prefix caching:** Native key-value cache reuse matches VoiceAI Infra prompt stabilization.

---

## 2. Installation & Quickstart

Install `mlx-lm` in your local Python environment on macOS:

```bash
pip install mlx-lm
```

Launch the local server pointing to a 4-bit quantized Qwen or Llama model:

```bash
python -m mlx_lm.server \
  --model mlx-community/Qwen2.5-7B-Instruct-4bit \
  --port 8080 \
  --host 127.0.0.1
```

---

## 3. Configuration in VoiceAI Infra

Configure the LLM Gateway policy profile to route to the MLX server by editing [config/policies/default.yaml](file:///d:/13.my-startups/1.Voice-AI-Infra/config/policies/default.yaml) or setting environment variables:

```yaml
# config/policies/default.yaml
backends:
  mlx_local:
    type: "openai_compatible"
    base_url: "http://127.0.0.1:8080/v1"
    model: "mlx-community/Qwen2.5-7B-Instruct-4bit"
    timeout_seconds: 3.0
    max_retries: 1
```

Set environment override in `.env`:

```env
LOCAL_LLM_URL=http://127.0.0.1:8080/v1
LOCAL_LLM_BACKEND=openai_compatible
LOCAL_LLM_MODEL=mlx-community/Qwen2.5-7B-Instruct-4bit
```

---

## 4. Verification & Testing

Verify that the Gateway recognizes and streams from `mlx_lm.server`:

```bash
curl -X POST http://127.0.0.1:8005/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "mlx-community/Qwen2.5-7B-Instruct-4bit",
    "messages": [
      {"role": "system", "content": "You are a customer service assistant."},
      {"role": "user", "content": "Hello!"}
    ],
    "stream": true
  }'
```

Because `mlx_lm.server` natively supports OpenAI streaming chunks (`data: {"choices": [{"delta": {"content": "..."}}]}`), the gateway handles tokens, TTFT metrics, and guard interception transparently.
