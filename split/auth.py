#!/usr/bin/env python3
"""Auth helpers for the ACP runner.

Sign-in detection + the per-harness CLI login command. Transport-free (no
aiohttp, no subprocess): the desktop shell drives the actual Terminal/OAuth flow
in Rust; this module only tells it *what* a harness needs and *whether* a failure
looks like an auth error.
"""
from __future__ import annotations

# Terminal sign-in command per harness (for CLI-login agents). Missing → guidance.
LOGIN_CMD = {
    "claude": "claude login",
    "codex": "codex login",
    "gemini": "gemini",
    "cursor": "cursor-agent login",
    "copilot": "gh auth login",
    "qwen": "qwen",
    "opencode": "opencode auth login",
    "hermes": "uvx --from 'hermes-agent[acp]==0.14.0' hermes-acp --setup",
}

AUTH_HINTS = ("auth", "login", "unauthor", "api key", "api_key", "credit",
              "401", "403", "forbidden", "sign in", "not permitted", "no_api_key")


def is_auth_error(exc: Exception) -> bool:
    return any(h in str(exc).lower() for h in AUTH_HINTS)
