# CODEBUDDY.md This file provides guidance to CodeBuddy when working with code in this repository.

## Project Overview

This is an Alibaba Cloud SLS (Simple Log Service) intelligent log analysis system built with Node.js and Express. It provides a web interface for querying SLS logs, analyzing them with AI models, and generating structured analysis reports.

## Common Commands

### Development
- `npm install` - Install dependencies (requires Node.js >= 18.0.0)
- `npm start` - Start production server on port 3001
- `npm run dev` - Start server with auto-reload on file changes

### Server Management
- Default port is 3001, configurable via `.env` file or `PORT` environment variable
- If port 3001 is occupied: `lsof -ti:3001 | xargs kill -9` (macOS/Linux)

## Architecture

### Backend Structure (src/)

The backend follows a layered architecture with clear separation of concerns:

**server.js** - Express application entry point with middleware setup (CORS, JSON parsing, static files) and error handling.

**routes/api.js** - REST API endpoints organized by domain:
- Config management (`/api/config`)
- Log analysis (`/api/analyze`) - Main workflow orchestration
- Report management (`/api/reports/:id`)
- Authentication (`/api/sync-auth`, `/api/auth-status`)

**services/** - Business logic layer:
- **slsClient.js** - SLS API client using axios to fetch logs from Alibaba Cloud's `/console/logstoreindex/getLogs.json` endpoint. Handles authentication via cookies, CSRF tokens, and b3 headers.
- **analyzer.js** - Core analysis orchestrator: parses time ranges, queries SLS, performs statistical analysis (log levels, errors, warnings, trace IDs, time spans), and coordinates AI analysis.
- **aiService.js** - Multi-provider AI integration supporting Anthropic Claude, OpenAI, and OpenAI-compatible APIs (e.g., Zhipu AI, Qwen). Includes connection testing utilities.
- **timeParser.js** - Time range parser converting presets (today, thisWeek, lastMonth, etc.) to Unix timestamps.
- **autoAuthSync.js** - Puppeteer-based automated auth extraction that opens a browser, navigates to SLS console, waits for user login, and extracts cookies/tokens automatically.

### Frontend (public/)

Vanilla JavaScript SPA using `app.js` for client-side logic and `index.html` as the single-page application. No framework dependencies - all state management is handled via simple objects and DOM manipulation.

### Data Flow

1. **Configuration**: Settings stored in `config.json` (projects, AI config, SLS auth cookies)
2. **Analysis Request**: Frontend calls `/api/analyze` with project ID, time range, and query
3. **Log Retrieval**: `analyzer.js` parses time range → calls `slsClient.js` to fetch logs from Alibaba Cloud
4. **Analysis**: `analyzer.js` performs statistical analysis → optionally calls `aiService.js` for AI-powered insights
5. **Report Generation**: Results saved as JSON files in `reports/` directory with UUID-based filenames
6. **Response**: Full report returned to frontend for display

### Authentication Strategy

Uses Alibaba Cloud's browser-based authentication:
- Cookies extracted manually via developer tools or automatically via Puppeteer
- CSRF tokens and b3 headers required for API requests
- Cookies expire ~30 days and require re-authentication
- No API key-based authentication - relies on session cookies

### AI Integration

Supports three providers via standardized API:
- **Anthropic**: Direct API calls with anthropic-version header
- **OpenAI**: Standard OpenAI chat completions
- **OpenAI-compatible**: Generic interface for providers like Zhipu AI and Qwen with custom baseUrl

AI calls are wrapped with 60-second timeout and error handling for common issues (401 auth, 429 rate limits).

### Configuration

`config.json` structure:
- `projects`: Map of project IDs containing name, projectName, logStoreName
- `aiConfig`: provider, apiKey, baseUrl, model
- `slsConfig`: region, cookies (object), csrfToken, b3, usePuppeteer flag

### Report Storage

Analysis reports stored as JSON in `reports/` directory with structure:
- id (UUID), createdAt, projectName, logStoreName
- Query metadata: query, timeRange, timeFrom, timeTo
- Statistics: stats object with byLevel counts, errors, warnings, timeSpan
- AI analysis: aiAnalysis object with provider/model/content
- Raw logs: logs array

## Key Integration Points

- **SLS API**: Uses unofficial console API endpoint at `https://sls.console.aliyun.com/console/logstoreindex/getLogs.json` rather than official SLS SDK
- **Puppeteer**: Optional for automated auth sync, requires headless=false for user interaction
- **Time Handling**: All timestamps converted to Unix seconds format for SLS API compatibility
