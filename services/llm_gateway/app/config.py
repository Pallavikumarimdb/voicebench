"""
Configuration and Policy Loader for LLM Gateway.
Loads policy YAML files and pricing configs with validation and safe defaults.
"""

import os
import yaml
import hashlib
from typing import Dict, Any, Optional

DEFAULT_POLICIES_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "..", "config", "policies")
)
DEFAULT_PRICING_FILE = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "..", "config", "pricing.yaml")
)


class GatewayConfig:
    def __init__(self):
        self.host: str = os.getenv("LLM_GATEWAY_HOST", "0.0.0.0")
        self.port: int = int(os.getenv("LLM_GATEWAY_PORT", "8005"))
        self.default_profile: str = os.getenv("LLM_GATEWAY_PROFILE", "default")
        self.policies_dir: str = os.getenv("POLICIES_DIR", DEFAULT_POLICIES_DIR)
        self.pricing_file: str = os.getenv("PRICING_FILE", DEFAULT_PRICING_FILE)
        self.ollama_base_url: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
        self.openai_base_url: str = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
        self.openai_api_key: Optional[str] = os.getenv("OPENAI_API_KEY")

        self.policies: Dict[str, Dict[str, Any]] = {}
        self.policy_hashes: Dict[str, str] = {}
        self.pricing: Dict[str, Any] = {}
        self.reload_all()

    def reload_all(self):
        """Loads and hashes all available policy files."""
        if os.path.exists(self.policies_dir):
            for fname in os.listdir(self.policies_dir):
                if fname.endswith(".yaml") or fname.endswith(".yml"):
                    profile_name = os.path.splitext(fname)[0]
                    fpath = os.path.join(self.policies_dir, fname)
                    with open(fpath, "r", encoding="utf-8") as f:
                        raw = f.read()
                        policy_data = yaml.safe_load(raw) or {}
                        h = hashlib.sha256(raw.encode("utf-8")).hexdigest()
                        self.policies[profile_name] = policy_data
                        self.policy_hashes[profile_name] = f"sha256:{h[:16]}"

        if os.path.exists(self.pricing_file):
            with open(self.pricing_file, "r", encoding="utf-8") as f:
                self.pricing = yaml.safe_load(f) or {}

    def get_policy(self, profile: Optional[str] = None) -> Dict[str, Any]:
        key = profile or self.default_profile
        if key in self.policies:
            return self.policies[key]
        if "default" in self.policies:
            return self.policies["default"]
        return {"tiers": {"t0_fast_path": {}, "t1_local": {}}, "rules": []}

    def get_policy_version(self, profile: Optional[str] = None) -> str:
        key = profile or self.default_profile
        return self.policy_hashes.get(key, "sha256:unknown")


config = GatewayConfig()
