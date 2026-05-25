# Split — dev bootstrap (macOS / Linux, POSIX make).
#
#   make doctor     # check the toolchain
#   make install    # venv + Python deps + desktop npm deps
#   make app        # run the desktop app   (make cli = terminal front)
#
# Windows isn't covered here: the backend/CLI can run under WSL, but the desktop
# app is macOS-only today (osascript login, pkill teardown, vibrancy, darwin-arm64
# binaries). See the README "Platforms" section.

.DEFAULT_GOAL := help
SHELL := /bin/bash

PYTHON  := $(shell command -v python3.11 2>/dev/null || command -v python3)
VENV    := .venv
VENV_PY := $(VENV)/bin/python
DESKTOP := apps/desktop
H       ?= claude          # harness for `make cli` — override: make cli H=codex

.PHONY: help doctor install backend desktop cli app build test clean

help: ## Show this help
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) \
	  | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'

doctor: ## Check the toolchain (python / node / uv / cargo) + next steps
	@echo "Split — toolchain check"
	@printf "  %-7s " python; if [ -n "$(PYTHON)" ]; then echo "$(PYTHON) ($$($(PYTHON) -V 2>&1))"; else echo "MISSING — need Python 3.10+"; fi
	@printf "  %-7s " node;  command -v node  >/dev/null && node -v  || echo "MISSING — needed for npx harnesses + the app"
	@printf "  %-7s " npm;   command -v npm   >/dev/null && npm -v   || echo "MISSING — needed for the desktop app"
	@printf "  %-7s " uv;    command -v uv    >/dev/null && uv --version  || echo "missing (optional: hermes + web search)"
	@printf "  %-7s " cargo; command -v cargo >/dev/null && cargo -V || echo "missing (optional: building the desktop app)"
	@echo
	@echo "Auth is per-harness, interactive: claude login · codex login · gemini · gh auth login …"
	@echo "Provider API keys (optional): put them in .env at the repo root."

# --- backend (Python venv) ---------------------------------------------------
$(VENV_PY):
	@test -n "$(PYTHON)" || { echo "No python3.11/python3 found — install Python 3.10+"; exit 1; }
	$(PYTHON) -m venv $(VENV)

$(VENV)/.deps: requirements.txt | $(VENV_PY)
	$(VENV_PY) -m pip install --upgrade pip
	$(VENV_PY) -m pip install -r requirements.txt
	@touch $@

backend: $(VENV)/.deps ## Set up the Python backend (venv + deps)

# --- desktop (npm) -----------------------------------------------------------
$(DESKTOP)/node_modules: $(DESKTOP)/package.json
	cd $(DESKTOP) && npm install
	@touch $@

desktop: $(DESKTOP)/node_modules ## Install the desktop app's npm deps

# --- one-shot setup ----------------------------------------------------------
install: backend desktop ## Full setup: backend venv + desktop npm deps
	@echo "✓ Setup done — run 'make cli' (terminal) or 'make app' (desktop)."

# --- run ---------------------------------------------------------------------
cli: backend ## Run the terminal front (override harness: make cli H=codex)
	$(VENV_PY) -m split.terminal $(H)

app: backend $(DESKTOP)/node_modules ## Run the desktop app (Tauri dev)
	cd $(DESKTOP) && npm run tauri dev

build: $(DESKTOP)/node_modules ## Bundle the native .app (Tauri build)
	cd $(DESKTOP) && npm run tauri build

# --- tests / cleanup ---------------------------------------------------------
test: $(VENV)/.deps $(DESKTOP)/node_modules ## Run Python (pytest) + frontend (vitest) tests
	$(VENV_PY) -m pip install -r requirements-dev.txt
	$(VENV_PY) -m pytest -q
	cd $(DESKTOP) && npm test

clean: ## Remove the venv + Python caches (keeps node_modules and var/workspace)
	rm -rf $(VENV) .pytest_cache
	find . -name __pycache__ -type d -prune -exec rm -rf {} + 2>/dev/null || true
