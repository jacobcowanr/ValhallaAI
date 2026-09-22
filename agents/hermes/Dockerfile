FROM alpine:latest

# KNOWN GAP: this image does not install the `hermes` CLI. Hermes isn't a
# simple package install — it's a git-based install with its own home
# directory state and OAuth-authenticated providers (see the Obsidian
# vault's "Hermes - Local Setup.md" for the real install path). Faking a
# working install here would be worse than being honest about the gap:
# run.sh detects the missing CLI and exits 1 cleanly with a clear outbox
# message, rather than silently doing nothing. Containerizing a real
# Hermes install is tracked as open work, not attempted here.
RUN apk add --no-cache bash

WORKDIR /app

# Copy entrypoint script
COPY run.sh ./
RUN chmod +x ./run.sh

# Map Hermes home
ENV HERMES_HOME=/root/.hermes
ENV VAULT_PATH=/vault

CMD ["./run.sh"]
