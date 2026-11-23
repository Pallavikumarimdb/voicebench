#!/usr/bin/env python3
"""
CLI script to verify the cryptographic hash chain and signature of an audit JSONL log file.
Usage: python verify_audit.py path/to/session.jsonl [--strict-client] [--key-path PATH]
"""

import sys
import os
import argparse

# Add parent to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.audit import verify_audit_file


def main():
    parser = argparse.ArgumentParser(description="Verify VoiceAI Infra audit JSONL cryptographic integrity.")
    parser.add_argument("log_path", help="Path to audit JSONL file")
    parser.add_argument("--key-path", "-k", default=None, help="Path to Ed25519 public or private key PEM")
    parser.add_argument("--hmac-key", default=None, help="Dev HMAC-SHA256 secret key")
    parser.add_argument("--strict-client", action="store_true", help="Reject files containing client-generated records")
    args = parser.parse_args()

    log_path = args.log_path
    result = verify_audit_file(
        log_path,
        verify_key=args.key_path,
        hmac_key=args.hmac_key,
        allow_client_unverified=not args.strict_client
    )

    if not result.is_valid:
        print(f"[AUDIT VERIFICATION FAILED] Tampering or corruption detected: {result.error}")
        sys.exit(1)

    print(f"[AUDIT VERIFICATION SUCCESS] File '{log_path}' is cryptographically valid and untampered.")
    print(f"  Records verified: {result.record_count}")
    print(f"  Schema versions:  {result.schema_versions}")

    if result.head_verified is True:
        print("  Chain head:       SIGNATURE VERIFIED")
    elif result.head_verified is False:
        print("  Chain head:       SIGNATURE INVALID")
    else:
        print("  Chain head:       (no signature or public key not provided)")

    if result.client_unverified:
        print("  WARNING:          File contains unverified client-generated records (client_generated: true).")

    sys.exit(0)


if __name__ == "__main__":
    main()
