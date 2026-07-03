# Split — dev bootstrap (macOS / Linux). Rust workspace via cargo, desktop via npm.
#
#   make doctor     # check the toolchain
#   make install    # cargo + npm setup
#   make app        # run the desktop app (Tauri dev)
#   make test       # cargo + vitest
#
# The desktop bar runs exclusively on the native Rust runner (the Python
# backend was retired). These targets build on macOS (the tested target) and
# Windows (cross-platform build, unsigned). See the README "Platforms" section.

.DEFAULT_GOAL := help
SHELL := /bin/bash

DESKTOP := apps/desktop

.PHONY: help doctor install desktop app build test doc-lint clean

help: ## Show this help
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) \
	  | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'

doctor: ## Check the toolchain (cargo / node) + next steps
	@echo "Split — toolchain check"
	@printf "  %-7s " cargo; command -v cargo >/dev/null && cargo -V || echo "MISSING — install: rustup-init (the Rust workspace is the backend)"
	@printf "  %-7s " node;  command -v node  >/dev/null && node -v  || echo "MISSING — needed for npx harnesses + the app"
	@printf "  %-7s " npm;   command -v npm   >/dev/null && npm -v   || echo "MISSING — needed for the desktop app"
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
app: $(DESKTOP)/node_modules ## Run the desktop app (Tauri dev, native Rust runner)
	cd $(DESKTOP) && npm run tauri dev

build: $(DESKTOP)/node_modules ## Bundle the native .app (Tauri build)
	cd $(DESKTOP) && npm run tauri build

# --- tests -------------------------------------------------------------------
test: $(DESKTOP)/node_modules doc-lint ## Run Rust workspace tests + frontend (vitest)
	cargo test --workspace --quiet
	cd $(DESKTOP) && npm test

doc-lint: ## Check doc counts (experts/harnesses/skills) against config/
	python3 scripts/check-doc-counts.py

clean: ## Remove the Cargo build target
	cargo clean
