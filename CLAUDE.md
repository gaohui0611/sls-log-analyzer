# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SLS Log Analyzer is a web-based intelligent log analysis system for Alibaba Cloud SLS (Simple Log Service). It combines traditional log querying with AI-powered analysis to provide insights from application logs.

**Architecture**: Node.js (ES modules) + Express backend + Vanilla JS frontend

## Development Commands

```bash
# Install dependencies
npm install

# Start development server (with auto-restart)
npm run dev

# Start production server
npm start
```

The server listens on port 3001 by default (configurable via `PORT` env in `.env`).

## Project Structure

```
src/
├── server.js              # Express server entry point
├── routes/
│   └── api.js            # API route handlers
├── services/
│   ├── analyzer.js        # Main log analysis orchestrator
│   ├── aiService.js      # AI provider abstraction (Anthropic/OpenAI/compatible)
│   ├── slsClient.js      # Alibaba Cloud SLS API client
│   ├── timeParser.js      # Time range parsing utilities
│   └── autoAuthSync.js   # Puppeteer-based auth extraction
public/
├── index.html            # Single-page app (self-contained HTML+CSS)
└── app.js               # Frontend application logic
reports/                 # Generated analysis reports (JSON)
config.json              # Persistent configuration (auto-created)
.env                    # Environment variables
```

## Core Architecture

### Configuration System
All configuration is stored in `config.json` (created automatically). Contains:
- `projects`: SLS project/logstore configurations
- `aiConfig`: AI provider settings (provider, apiKey, baseUrl, model)
- `slsConfig`: SLS authentication (cookies, csrfToken, b3, region)

**Important**: `config.json` should be git-ignored. Use `.env.example` as template.

### Authentication Flow

SLS API authentication uses browser cookies (not official API keys). Two sync methods:

1. **Auto Sync** (`/api/auto-sync-auth`): Uses Puppeteer to launch browser, user manually logs in to SLS console, then extracts cookies and headers automatically. Spawns non-headless browser, waits up to 3 minutes for user login.

2. **Bookmark Sync** (`/api/bookmark-sync`): Browser bookmark tool extracts cookies from current session. Less reliable than auto-sync but works when Puppeteer fails. The bookmarklet must be run while logged into SLS console.

**Auth validation**: The system performs a test log query to verify auth is valid (not just checking cookies exist). Auth has ~30 day validity. Cookie timestamp is stored for age tracking.

### Log Analysis Pipeline

`analyzer.js:analyzeLogs()` orchestrates:
1. Parse time range (`timeParser.js`)
2. Query SLS API for logs (`slsClient.js`)
3. Calculate basic statistics (level counts, errors, warnings, traces)
4. Send summary to AI for analysis (`aiService.js`)
5. Generate and save report to `reports/{uuid}.json`

### AI Service Architecture

`aiService.js` supports three providers:
- **anthropic**: Claude via Anthropic API
- **openai**: GPT via OpenAI API
- **openai-compatible**: Any OpenAI-compatible API (custom baseUrl)

The `callAI()` function:
1. Prepares log summary (errors, warnings, samples)
2. Builds Chinese prompt with analysis requirements
3. Routes to appropriate API based on provider
4. Returns structured response with content and usage

### SLS Client

`slsClient.js:searchLogs()` makes HTTP requests to Alibaba Cloud SLS console API:
- Base URL: `https://sls.console.aliyun.com/console/logstoreindex/getLogs.json`
- Uses browser-style headers (User-Agent, Referer, Cookie)
- Requires cookies, optional CSRF token and b3 header
- Returns: `{ success, count, logs, raw }`

**Key detail**: SLS API expects form-encoded body, not JSON.

## Frontend Architecture

Single vanilla JS app (`app.js`) with tab-based navigation:
- **System Settings**: Auth sync, status check, cURL parser
- **Project Management**: CRUD for SLS project/logstore configs
- **AI Configuration**: AI provider setup and testing
- **Log Analysis**: Form to trigger analysis
- **Analysis Reports**: Paginated report viewer with Markdown rendering

State management uses a global `state` object. All API calls go through `apiRequest()` wrapper.

## Git Configuration

`.gitignore` properly excludes:
- `config.json` - Contains API keys and auth cookies
- `.env` - Environment variables with sensitive data
- `reports/` - Analysis reports may contain sensitive log data
- `node_modules/` - Dependencies

### Log Format
SLS logs use a specific structure:
- `__time__`: Unix timestamp
- `content`: Log message (primary field)
- `level` or `LEVEL`: Log level (ERROR, WARN, INFO)
- `TID`/`traceId`/`trace_id`: Trace ID for distributed tracing
- `userId`/`user_id`: User identifier

### Error Handling in API Routes
- Authentication failures return 401 with clear message
- Missing projects return 404
- AI analysis failures are caught and stored as error in report (doesn't fail entire analysis)
- All API responses use `{ success: boolean, data?: any, error?: string }` format

### Time Parser
Uses switch statement with case-sensitive string matching. Supported ranges:
- `today`, `yesterday`
- `thisWeek`, `lastWeek`
- `thisMonth`, `lastMonth`
- `last7days`, `last30days`

All time ranges return Unix timestamps (seconds) and formatted strings for display. Default is `thisWeek`.

### Report Generation
Reports are saved with UUID filenames. Each report contains:
- Metadata (project, query, time range, log counts)
- Basic stats (level breakdown, error/warning lists, unique traces/users)
- AI analysis (if configured) - includes provider, model, content, and token usage
- Raw log samples (up to `size` parameter, default 100)

**Error handling**: AI analysis failures are stored as `{ error: message }` in the report rather than failing the entire analysis. A 180-second timeout is applied to AI calls.
