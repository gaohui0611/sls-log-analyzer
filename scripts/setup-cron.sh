#!/bin/bash
#
# Setup Cron Job for Scheduled Code Analysis
# Usage: ./scripts/setup-cron.sh [--weekly|--daily|--remove]
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
SCHEDULED_SCRIPT="${PROJECT_DIR}/scripts/scheduled-analysis.sh"
CRON_MARKER="# sls-log-analyzer-scheduled-analysis"

# Default: weekly on Monday at 9 AM
SCHEDULE="0 9 * * 1"
MODE="weekly"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --daily)
            SCHEDULE="0 9 * * *"
            MODE="daily"
            shift
            ;;
        --weekly)
            SCHEDULE="0 9 * * 1"
            MODE="weekly"
            shift
            ;;
        --remove)
            MODE="remove"
            shift
            ;;
        *)
            echo "Usage: $0 [--weekly|--daily|--remove]"
            exit 1
            ;;
    esac
done

echo "════════════════════════════════════════════════════"
echo "  Cron Job Setup for Code Analysis"
echo "════════════════════════════════════════════════════"
echo ""

# Verify the scheduled script exists
if [[ ! -f "$SCHEDULED_SCRIPT" ]]; then
    echo "❌ Error: Scheduled script not found at ${SCHEDULED_SCRIPT}"
    exit 1
fi

# Make sure it's executable
chmod +x "$SCHEDULED_SCRIPT"

# Build the cron command
CRON_CMD="${SCHEDULE} cd ${PROJECT_DIR} && ${SCHEDULED_SCRIPT} >> ${PROJECT_DIR}/logs/scheduled-analysis.log 2>&1 ${CRON_MARKER}"

if [[ "$MODE" == "remove" ]]; then
    # Remove existing cron job
    (crontab -l 2>/dev/null | grep -v "${CRON_MARKER}" || true) | crontab -
    echo "✅ Cron job removed"
    exit 0
fi

# Check if already installed
if crontab -l 2>/dev/null | grep -q "${CRON_MARKER}"; then
    echo "⚠️  Cron job already exists. Updating..."
    # Remove old entry
    (crontab -l 2>/dev/null | grep -v "${CRON_MARKER}" || true) | crontab -
fi

# Add new cron job
(crontab -l 2>/dev/null || true; echo "$CRON_CMD") | crontab -

echo "✅ Cron job installed successfully!"
echo ""
echo "Schedule: ${SCHEDULE} (${MODE})"
echo "Command: ${SCHEDULED_SCRIPT}"
echo "Log: ${PROJECT_DIR}/logs/scheduled-analysis.log"
echo ""
echo "To view cron jobs:"
echo "  crontab -l"
echo ""
echo "To remove:"
echo "  ./scripts/setup-cron.sh --remove"
echo ""
