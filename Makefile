# Split — dev bootstrap (macOS / Linux). Rust workspace via cargo, desktop via npm.
#
#   make doctor     # check the toolchain
#   make install    # cargo + npm setup
#   make app        # run the desktop app (Tauri dev)
#   make test       # cargo + vitest
#
# The Python backend was retired from the default runtime in favour of the
# native Rust runner. If you keep `split-python/` checked out locally (it is
# gitignored), the Python-only targets (`make py-cli`, `make py-test`) still
# work; otherwise they no-op with a clear message.
#
# Windows isn't covered here: desktop is macOS-only today (osascript login,
# pkill teardown, vibrancy). See the README "Platforms" section.

.DEFAULT_GOAL := help
SHELL := /bin/bash

DESKTOP := apps/desktop
PYDIR   := split-python
H       ?= claude          # harness for `make py-cli` — override: make py-cli H=codex

.PHONY: help doctor install desktop cli app build test py-cli py-test py-sync clean

help: ## Show this help
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) \
	  | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'

doctor: ## Check the toolchain (cargo / node / optional uv) + next steps
	@echo "Split — toolchain check"
	@printf "  %-7s " cargo; command -v cargo >/dev/null && cargo -V || echo "MISSING — install: rustup-init (the Rust workspace is the default backend)"
	@printf "  %-7s " node;  command -v node  >/dev/null && node -v  || echo "MISSING — needed for npx harnesses + the app"
	@printf "  %-7s " npm;   command -v npm   >/dev/null && npm -v   || echo "MISSING — needed for the desktop app"
	@printf "  %-7s " uv;    command -v uv    >/dev/null && uv --version  || echo "missing (optional: only needed if you keep split-python/ locally)"
	@echo
	@echo "Auth is per-harness, interactive: claude login · codex login · gemini · gh auth login …"
	@echo "Provider API keys (optional): put them in .env at the repo root."

# --- desktop (npm) -----------------------------------------------------------
$(DESKTOP)/node_modules: $(DESKTOP)/package.json
	cd $(DESKTOP) && npm install
	@touch $@

desktop: $(DESKTOP)/node_modules ## Install the desktop app's npm deps

# --- one-shot setup ----------------------------------------------------------
install: desktop ## Full setup: cargo deps come on first build; npm install for the app
	@echo "✓ Setup done — run 'make app' to launch the desktop bar."

# --- run ---------------------------------------------------------------------
app: $(DESKTOP)/node_modules ## Run the desktop app (Tauri dev, Rust runner by default)
	cd $(DESKTOP) && npm run tauri dev

build: $(DESKTOP)/node_modules ## Bundle the native .app (Tauri build)
	cd $(DESKTOP) && npm run tauri build

# --- tests -------------------------------------------------------------------
test: $(DESKTOP)/node_modules ## Run Rust workspace tests + frontend (vitest)
	cargo test --workspace --quiet
	cd $(DESKTOP) && npm test

# --- legacy Python (optional, only if split-python/ exists locally) ----------
py-sync: ## (Python) uv sync inside split-python/ — no-op if folder is missing
	@if [ -d $(PYDIR) ]; then cd $(PYDIR) && uv sync; \
	  else echo "split-python/ not present — the Python backend was retired from the default tree."; fi

py-cli: py-sync ## (Python) Run the legacy terminal front (override harness: make py-cli H=codex)
	@if [ -d $(PYDIR) ]; then cd $(PYDIR) && uv run python -m split.terminal $(H); \
	  else echo "split-python/ not present — see README."; fi

py-test: py-sync ## (Python) Run the legacy pytest suite from inside split-python/
	@if [ -d $(PYDIR) ]; then cd $(PYDIR) && uv run pytest -q; \
	  else echo "split-python/ not present — see README."; fi

clean: ## Remove the Cargo target + .venv (Python)
	cargo clean
	rm -rf $(PYDIR)/.venv $(PYDIR)/.pytest_cache 2>/dev/null || true
	find . -name __pycache__ -type d -prune -exec rm -rf {} + 2>/dev/null || true
