#!/bin/bash
# Hermes Agent for Vahalla
# Delegates to the local Hermes CLI

VAULT_PATH=${VAULT_PATH:-/vault}
AGENT_NAME="hermes-agent"
OUTBOX_FILE="$VAULT_PATH/AGENT_OUTBOX_${AGENT_NAME}.md"

echo "[${AGENT_NAME}] Starting..."

# Check if Hermes is available
if ! command -v hermes &> /dev/null; then
    echo "[${AGENT_NAME}] Hermes CLI not found in PATH"
    echo "## [$(date -u +%Y-%m-%dT%H:%M:%SZ)] ${AGENT_NAME}" >> "$OUTBOX_FILE"
    echo "- Status: ERROR" >> "$OUTBOX_FILE"
    echo "- Error: Hermes CLI not available" >> "$OUTBOX_FILE"
    exit 1
fi

# Run a simple Hermes task and capture output
echo "[${AGENT_NAME}] Running Hermes..."
RESULT=$(hermes -z "Report your status and capabilities as an agent in the Vahalla platform." 2>&1)
STATUS=$?

# Write to outbox
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
{
    echo "## [${TIMESTAMP}] ${AGENT_NAME}"
    echo "- Status: $([ $STATUS -eq 0 ] && echo 'OK' || echo 'ERROR')"
    echo "- Response: ${RESULT}"
    echo ""
} >> "$OUTBOX_FILE"

echo "[${AGENT_NAME}] Done. Output written to $OUTBOX_FILE"
exit $STATUS
