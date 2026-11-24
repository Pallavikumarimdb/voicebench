# Optional GPU Node Pool Deployment (Plan 1 Section 6 P6-T2)

VoiceAI Infra defaults to a **CPU-first architecture**, running Alibaba SenseVoice-Small (int8) and NVIDIA NeMo Parakeet-CTC on commodity multi-core CPUs (RTF 0.023–0.055, latency < 180 ms).

When hardware acceleration is desired for large concurrent batched workloads or higher-density speech models, an optional GPU overlay is provided.

## Enabling the GPU Overlay

1. Provision a Kubernetes node pool with NVIDIA GPUs (e.g., T4, L4, or A10G) and install the NVIDIA device plugin:
   ```bash
   kubectl apply -f https://raw.githubusercontent.com/NVIDIA/k8s-device-plugin/v0.14.0/nvidia-device-plugin.yml
   ```

2. Label GPU nodes:
   ```bash
   kubectl label nodes <node-name> cloud.google.com/gke-nodepool=gpu-pool accelerator=nvidia-tesla-t4
   ```

3. Deploy using Kustomize:
   ```bash
   kubectl apply -k deploy/k8s/overlays/gpu/
   ```

The overlay patches `stt-deployment` with:
- `STT_DEVICE: "cuda"`
- `STT_COMPUTE_TYPE: "float16"`
- `resources.limits.nvidia.com/gpu: 1`
- `nodeSelector` targeting the GPU node pool
