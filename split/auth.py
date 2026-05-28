#!/usr/bin/env python3
"""Auth helpers for the ACP runner.

Sign-in detection + the per-harness CLI login command. Transport-free (no
aiohttp, no subprocess): the desktop shell drives the actual OAuth flow in
Rust; this module only tells it *what* a harness needs and *whether* a failure
looks like an auth error.
"""
from __future__ import annotations

# Browser-OAuth sign-in command per harness. Each CLI listed here opens the
# user's default browser on its own when run with no args, so the Rust side
# just spawns it detached. CLIs that need a TTY or only accept API keys are
# intentionally absent — they surface via .env / API-key inputs instead.
LOGIN_CMD = {
    "claude": "claude login",
    "codex": "codex login",
    "gemini": "gemini",
    "cursor": "cursor-agent login",
    "copilot": "gh auth login -w",
}

AUTH_HINTS = ("auth", "login", "unauthor", "api key", "api_key", "credit",
              "401", "403", "forbidden", "sign in", "not permitted", "no_api_key")


def is_auth_error(exc: Exception) -> bool:
    return any(h in str(exc).lower() for h in AUTH_HINTS)
