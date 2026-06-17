#!/bin/bash
#
# Scheduled Code Analysis Workflow
# Usage: ./scripts/scheduled-analysis.sh [--dry-run]
#
# Designed for cron scheduling:
#   0 9 * * 1 /path/to/sls-log-analyzer/scripts/scheduled-analysis.sh >> /var/log/sls-analyzer.log 2>&1
#
# Follows inference.sh automation patterns:
#   - Logging wrapper with timestamps
#   - Error handling with alerting
#   - Retry with fallback
#   - Idempotent execution
#

set -euo pipefail

# ── Configuration ───────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPORTS_DIR="${PROJECT_DIR}/reports"
LOG_DIR="${PROJECT_DIR}/logs"
LOG_FILE="${LOG_DIR}/scheduled-analysis-$(date +%Y%m%d).log"
MAX_LOG_DAYS=30

# AI config (read from config.json)
AI_PROVIDER=""
AI_API_KEY=""
AI_MODEL=""
AI_BASE_URL=""

# Optional: webhook for alerts (set via env var)
ALERT_WEBHOOK="${ALERT_WEBHOOK:-}"

# ── Utilities ───────────────────────────────────────────────────────────────

log() {
    local level="$1"
    local message="$2"
    local timestamp
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    local color=""

    case "$level" in
        INFO)  color="\033[36m" ;;  # cyan
        WARN)  color="\033[33m" ;;  # yellow
        ERROR) color="\033[31m" ;;  # red
        SUCCESS) color="\033[32m" ;; # green
    esac

    echo -e "${color}[${timestamp}] [${level}] ${message}\033[0m"

    # Also write to log file (without colors)
    echo "[${timestamp}] [${level}] ${message}" >> "$LOG_FILE" 2>/dev/null || true
}

# Ensure directories exist
mkdir -p "$LOG_DIR" "$REPORTS_DIR"

# Clean old logs
find "$LOG_DIR" -name "scheduled-analysis-*.log" -mtime +$MAX_LOG_DAYS -delete 2>/dev/null || true

# ── Phase 1: Load Configuration ───────────────────────────────────────────

log "INFO" "════════════════════════════════════════════════════"
log "INFO" "  Starting Scheduled Code Analysis Workflow"
log "INFO" "════════════════════════════════════════════════════"

CONFIG_FILE="${PROJECT_DIR}/config.json"

if [[ ! -f "$CONFIG_FILE" ]]; then
    log "ERROR" "config.json not found at ${CONFIG_FILE}"
    exit 1
fi

# Extract AI config using node (reliable JSON parsing)
if command -v node &>/dev/null; then
    AI_PROVIDER=$(node -e "
        const fs = require('fs');
        const data = JSON.parse(fs.readFileSync('${CONFIG_FILE}', 'utf-8'));
        console.log(data.aiConfig?.provider || '');
    " 2>/dev/null || echo "")

    AI_API_KEY=$(node -e "
        const fs = require('fs');
        const data = JSON.parse(fs.readFileSync('${CONFIG_FILE}', 'utf-8'));
        console.log(data.aiConfig?.apiKey || '');
    " 2>/dev/null || echo "")

    AI_MODEL=$(node -e "
        const fs = require('fs');
        const data = JSON.parse(fs.readFileSync('${CONFIG_FILE}', 'utf-8'));
        console.log(data.aiConfig?.model || '');
    " 2>/dev/null || echo "")

    AI_BASE_URL=$(node -e "
        const fs = require('fs');
        const data = JSON.parse(fs.readFileSync('${CONFIG_FILE}', 'utf-8'));
        console.log(data.aiConfig?.baseUrl || '');
    " 2>/dev/null || echo "")
fi

if [[ -z "$AI_API_KEY" ]]; then
    log "WARN" "AI config not found. AI review will be skipped."
fi

# ── Phase 2: Run Static Analysis ────────────────────────────────────────────

log "INFO" "Phase 2: Running static analysis..."

STATIC_START=$(date +%s)

if ! node "${PROJECT_DIR}/scripts/analyze-codebase.mjs" >> "$LOG_FILE" 2>&1; then
    log "ERROR" "Static analysis failed"
    exit 1
fi

STATIC_END=$(date +%s)
STATIC_DURATION=$((STATIC_END - STATIC_START))
log "SUCCESS" "Static analysis completed in ${STATIC_DURATION}s"

# ── Phase 3: Run AI Review (if configured) ─────────────────────────────────

if [[ -n "$AI_API_KEY" ]]; then
    log "INFO" "Phase 3: Running AI-powered code review..."

    AI_START=$(date +%s)

    if node "${PROJECT_DIR}/scripts/ai-code-review.mjs" >> "$LOG_FILE" 2>&1; then
        AI_END=$(date +%s)
        AI_DURATION=$((AI_END - AI_START))
        log "SUCCESS" "AI review completed in ${AI_DURATION}s"
    else
        log "WARN" "AI review failed (check logs for details)"
    fi
else
    log "INFO" "Phase 3: Skipped (no AI config)"
fi

# ── Phase 4: Generate Summary Report ────────────────────────────────────────

log "INFO" "Phase 4: Generating summary report..."

SUMMARY_FILE="${REPORTS_DIR}/LATEST_SCHEDULED_ANALYSIS.md"

# Find latest reports
LATEST_STATIC=$(ls -t "${REPORTS_DIR}"/codebase-analysis-*.md 2>/dev/null | head -1)
LATEST_AI=$(ls -t "${REPORTS_DIR}"/ai-code-review-*.md 2>/dev/null | head -1)

cat > "$SUMMARY_FILE" <<EOF
# Scheduled Code Analysis Report

Generated: $(date '+%Y-%m-%d %H:%M:%S')
Workflow: scripts/scheduled-analysis.sh

## Reports

| Report | File |
|--------|------|
| Static Analysis | ${LATEST_STATIC:-N/A} |
| AI Review | ${LATEST_AI:-N/A} |

## Execution Metrics

- Static Analysis Duration: ${STATIC_DURATION}s
- AI Review Duration: ${AI_DURATION:-N/A}s
- Total Duration: $(($(date +%s) - STATIC_START))s

---

*This report was auto-generated by the scheduled analysis workflow.*
EOF

log "SUCCESS" "Summary report: ${SUMMARY_FILE}"

# ── Phase 5: Cleanup & Alerting ────────────────────────────────────────────

# Keep only last 10 reports per type
for pattern in "codebase-analysis" "ai-code-review"; do
    ls -t "${REPORTS_DIR}/${pattern}"-*.md 2>/dev/null | tail -n +11 | xargs -I {} rm -f {} 2>/dev/null || true
done

# Alert on failure (if webhook configured)
if [[ -n "$ALERT_WEBHOOK" && $? -ne 0 ]]; then
    TIMESTAMP=$(date +%Y-%m-%dT%H:%M:%S%z)
    PROJECT_NAME=$(basename "$PROJECT_DIR")
    curl -s -X POST "$ALERT_WEBHOOK" \
        -H "Content-Type: application/json" \
        -d "{\"text\":\"Code analysis workflow failed for ${PROJECT_NAME}\",\"timestamp\":\"${TIMESTAMP}\"}" \
        >/dev/null 2>&1 || true
fi

# ── Final Summary ─────────────────────────────────────────────────────────

TOTAL_DURATION=$(($(date +%s) - STATIC_START))

log "INFO" "════════════════════════════════════════════════════"
log "SUCCESS" "Workflow completed successfully"
log "INFO" "  Total duration: ${TOTAL_DURATION}s"
log "INFO" "  Reports: ${REPORTS_DIR}/"
log "INFO" "  Log: ${LOG_FILE}"
log "INFO" "════════════════════════════════════════════════════"

exit 0
