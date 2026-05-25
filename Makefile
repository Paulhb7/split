# Split — dev bootstrap (macOS / Linux). Python via uv, desktop via npm.
#
#   make doctor     # check the toolchain
#   make install    # uv sync (Python) + npm install (desktop)
#   make app        # run the desktop app   (make cli = terminal front)
#
# Windows isn't covered here: the backend/CLI can run under WSL, but the desktop
# app is macOS-only today (osascript login, pkill teardown, vibrancy, darwin-arm64
# binaries). See the README "Platforms" section.

.DEFAULT_GOAL := help
SHELL := /bin/bash

DESKTOP := apps/desktop
H       ?= claude          # harness for `make cli` — override: make cli H=codex

.PHONY: help doctor install sync desktop cli app build test clean

help: ## Show this help
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) \
	  | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'

doctor: ## Check the toolchain (uv / node / cargo) + next steps
	@echo "Split — toolchain check"
	@printf "  %-7s " uv;    command -v uv    >/dev/null && uv --version  || echo "MISSING — install: brew install uv (manages the Python backend)"
	@printf "  %-7s " node;  command -v node  >/dev/null && node -v  || echo "MISSING — needed for npx harnesses + the app"
	@printf "  %-7s " npm;   command -v npm   >/dev/null && npm -v   || echo "MISSING — needed for the desktop app"
	@printf "  %-7s " cargo; command -v cargo >/dev/null && cargo -V || echo "missing (optional: building the desktop app)"
	@echo
	@echo "Auth is per-harness, interactive: claude login · codex login · gemini · gh auth login …"
	@echo "Provider API keys (optional): put them in .env at the repo root."

# --- backend (Python via uv) -------------------------------------------------
sync: ## Sync the Python env from uv.lock (creates .venv)
	uv sync

# --- desktop (npm) -----------------------------------------------------------
$(DESKTOP)/node_modules: $(DESKTOP)/package.json
	cd $(DESKTOP) && npm install
	@touch $@

desktop: $(DESKTOP)/node_modules ## Install the desktop app's npm deps

# --- one-shot setup ----------------------------------------------------------
install: sync desktop ## Full setup: uv sync (Python) + desktop npm deps
	@echo "✓ Setup done — run 'make cli' (terminal) or 'make app' (desktop)."

# --- run ---------------------------------------------------------------------
cli: sync ## Run the terminal front (override harness: make cli H=codex)
	uv run python -m split.terminal $(H)

app: sync $(DESKTOP)/node_modules ## Run the desktop app (Tauri dev)
	cd $(DESKTOP) && npm run tauri dev

build: $(DESKTOP)/node_modules ## Bundle the native .app (Tauri build)
	cd $(DESKTOP) && npm run tauri build

# --- tests / cleanup ---------------------------------------------------------
test: sync $(DESKTOP)/node_modules ## Run Python (pytest) + frontend (vitest) tests
	uv run pytest -q
	cd $(DESKTOP) && npm test

clean: ## Remove the venv + Python caches (keeps node_modules and var/workspace)
	rm -rf .venv .pytest_cache
	find . -name __pycache__ -type d -prune -exec rm -rf {} + 2>/dev/null || true
