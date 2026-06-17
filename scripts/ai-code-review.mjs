#!/usr/bin/env node
/**
 * AI Code Review Workflow
 *
 * Combines local static analysis with AI-powered code review.
 * Reads AI config from config.json and generates actionable improvement suggestions.
 *
 * Usage:
 *   node scripts/ai-code-review.mjs
 *
 * Requires: config.json with aiConfig (provider, apiKey, model, baseUrl)
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');
const REPORTS_DIR = path.join(ROOT, 'reports');
const CONFIG_FILE = path.join(ROOT, 'config.json');

const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    dim: '\x1b[2m',
};

function log(label, value = '', color = 'reset') {
    console.log(`${colors[color]}${label}${colors.reset}${value ? ': ' + value : ''}`);
}

// ── Config & Utils ────────────────────────────────────────────────────────

async function readConfig() {
    try {
        const data = await fs.readFile(CONFIG_FILE, 'utf-8');
        return JSON.parse(data);
    } catch {
        return null;
    }
}

async function readFile(filePath, maxLines = 100) {
    try {
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.split('\n');
        if (lines.length > maxLines) {
            return lines.slice(0, maxLines).join('\n') + '\n\n... (' + (lines.length - maxLines) + ' more lines)';
        }
        return content;
    } catch {
        return null;
    }
}

async function walkFiles(dir, pattern) {
    const { execSync } = await import('child_process');
    try {
        const output = execSync(`find "${dir}" -name "${pattern}" -not -path "*/node_modules/*" -not -path "*/.git/*"`, { encoding: 'utf-8' });
        return output.trim().split('\n').filter(Boolean);
    } catch {
        return [];
    }
}

// ── Static Analysis ───────────────────────────────────────────────────────

async function runStaticAnalysis() {
    const jsFiles = await walkFiles(ROOT, '*.js');
    const results = {
        totalFiles: jsFiles.length,
        totalLines: 0,
        consoleLogs: 0,
        todos: 0,
        duplicateFunctions: [],
        largeFiles: []
    };

    const functionSignatures = new Map();

    for (const file of jsFiles) {
        const content = await fs.readFile(file, 'utf-8').catch(() => '');
        const lines = content.split('\n');
        results.totalLines += lines.length;

        const relPath = path.relative(ROOT, file);

        // Count console.log
        results.consoleLogs += (content.match(/console\.(log|warn|error)\b/g) || []).length;

        // Count TODOs
        results.todos += (content.match(/\/\/.*\b(TODO|FIXME|HACK)/gi) || []).length;

        // Track file size
        if (lines.length > 500) {
            results.largeFiles.push({ path: relPath, lines: lines.length });
        }

        // Extract function signatures
        const funcMatches = content.matchAll(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/g);
        for (const match of funcMatches) {
            const funcName = match[1];
            if (functionSignatures.has(funcName)) {
                results.duplicateFunctions.push({
                    name: funcName,
                    locations: [functionSignatures.get(funcName), relPath]
                });
            } else {
                functionSignatures.set(funcName, relPath);
            }
        }
    }

    return results;
}

// ── AI Analysis ───────────────────────────────────────────────────────────

async function callAnthropic(prompt, apiKey, baseUrl, model) {
    const url = `${baseUrl || 'https://api.anthropic.com'}/v1/messages`;
    const response = await axios.post(
        url,
        {
            model: model || 'claude-3-5-sonnet-20241022',
            max_tokens: 4096,
            messages: [{ role: 'user', content: prompt }]
        },
        {
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            timeout: 120000
        }
    );
    return response.data.content[0].text;
}

async function callOpenAI(prompt, apiKey, baseUrl, model) {
    const url = `${baseUrl || 'https://api.openai.com'}/v1/chat/completions`;
    const response = await axios.post(
        url,
        {
            model: model || 'gpt-4',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 4096
        },
        {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            timeout: 120000
        }
    );
    return response.data.choices[0].message.content;
}

async function callOpenAICompatible(prompt, apiKey, baseUrl, model) {
    if (!baseUrl) throw new Error('OpenAI-compatible API requires baseUrl');
    const response = await axios.post(
        `${baseUrl}/v1/chat/completions`,
        {
            model: model || 'gpt-4',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 4096
        },
        {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            timeout: 120000
        }
    );
    return response.data.choices[0].message.content;
}

async function analyzeWithAI(analysisData, aiConfig) {
    const { provider, apiKey, baseUrl, model } = aiConfig;

    const prompt = `You are a senior code reviewer. Analyze the following codebase metrics and provide actionable improvement suggestions in Chinese.

## Codebase Metrics

- Total JS files: ${analysisData.totalFiles}
- Total lines: ${analysisData.totalLines}
- console.log statements: ${analysisData.consoleLogs}
- TODO/FIXME comments: ${analysisData.todos}

## Large Files (>500 lines)
${analysisData.largeFiles.map(f => `- ${f.path}: ${f.lines} lines`).join('\n') || 'None'}

## Duplicate Functions
${analysisData.duplicateFunctions.length > 0
    ? analysisData.duplicateFunctions.map(d => `- \`${d.name}\` in: ${d.locations.join(', ')}`).join('\n')
    : 'None detected'}

## Key Code Snippets

### src/server.js
\`\`\`javascript
${await readFile(path.join(ROOT, 'src/server.js'), 50)}
\`\`\`

### src/routes/api.js (first 50 lines)
\`\`\`javascript
${await readFile(path.join(ROOT, 'src/routes/api.js'), 50)}
\`\`\`

## Task

Provide a structured code review report with these sections:

1. **Overall Health Score** (1-10) with brief justification
2. **Top 3 Issues** ordered by priority (P1 = critical, P2 = important, P3 = nice-to-have)
3. **Refactoring Suggestions** with specific file references
4. **Security Concerns** if any
5. **Testing Gaps** — what should be tested

Format the output as clean Markdown with clear headers and bullet points.`;

    switch (provider) {
        case 'anthropic':
            return await callAnthropic(prompt, apiKey, baseUrl, model);
        case 'openai':
            return await callOpenAI(prompt, apiKey, baseUrl, model);
        case 'openai-compatible':
            return await callOpenAICompatible(prompt, apiKey, baseUrl, model);
        default:
            throw new Error(`Unsupported AI provider: ${provider}`);
    }
}

// ── Report Generation ─────────────────────────────────────────────────────

function generateReport(staticData, aiReview) {
    const timestamp = new Date().toISOString();

    return `# AI Code Review Report

Generated: ${timestamp}

---

## Static Analysis Summary

| Metric | Value |
|--------|-------|
| JavaScript Files | ${staticData.totalFiles} |
| Total Lines | ${staticData.totalLines.toLocaleString()} |
| console.log Count | ${staticData.consoleLogs} |
| TODO/FIXME Count | ${staticData.todos} |
| Large Files (>500 lines) | ${staticData.largeFiles.length} |
| Duplicate Functions | ${staticData.duplicateFunctions.length} |

## AI Review

${aiReview}

---

*Generated by scripts/ai-code-review.mjs*
`;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
    console.log(`${colors.cyan}
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║        AI-Powered Code Health Workflow                        ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝${colors.reset}\n`);

    // Check AI config
    const config = await readConfig();
    if (!config || !config.aiConfig || !config.aiConfig.apiKey) {
        console.error(`${colors.red}Error: AI config not found in config.json${colors.reset}`);
        console.error(`Please set up AI configuration via the web UI or config.json`);
        process.exit(1);
    }

    // Step 1: Static Analysis
    console.log(`${colors.cyan}Step 1: Running static analysis...${colors.reset}`);
    const staticData = await runStaticAnalysis();
    log('Files analyzed', String(staticData.totalFiles), 'green');
    log('Total lines', String(staticData.totalLines), 'green');
    log('console.log found', String(staticData.consoleLogs), staticData.consoleLogs > 50 ? 'yellow' : 'green');

    // Step 2: AI Review
    console.log(`\n${colors.cyan}Step 2: Running AI code review...${colors.reset}`);
    console.log(`${colors.dim}(This may take 30-60 seconds)${colors.reset}\n`);

    let aiReview;
    try {
        aiReview = await analyzeWithAI(staticData, config.aiConfig);
        log('AI review complete', '', 'green');
    } catch (error) {
        console.error(`${colors.red}AI review failed: ${error.message}${colors.reset}`);
        aiReview = `**AI Review Failed:** ${error.message}\n\nPlease check your API key and network connection.`;
    }

    // Step 3: Generate Report
    console.log(`\n${colors.cyan}Step 3: Generating report...${colors.reset}`);
    const report = generateReport(staticData, aiReview);

    await fs.mkdir(REPORTS_DIR, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportPath = path.join(REPORTS_DIR, `ai-code-review-${timestamp}.md`);
    await fs.writeFile(reportPath, report, 'utf-8');

    // Also write a fixed latest report
    const latestPath = path.join(REPORTS_DIR, 'ai-code-review-latest.md');
    await fs.writeFile(latestPath, report, 'utf-8');

    log('Report saved', reportPath, 'green');
    log('Latest report', latestPath, 'green');

    console.log(`\n${colors.cyan}Done!${colors.reset}\n`);
}

main().catch(console.error);
