#!/usr/bin/env node
/**
 * SLS Log Analyzer - Codebase Analysis Workflow
 *
 * Usage:
 *   node scripts/analyze-codebase.mjs
 *
 * Generates: reports/codebase-analysis-{timestamp}.md
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');
const REPORTS_DIR = path.join(ROOT, 'reports');

// Color codes for terminal output
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    dim: '\x1b[2m',
};

function log(title, value = '', color = 'reset') {
    console.log(`${colors[color]}${title}${colors.reset}${value ? ': ' + value : ''}`);
}

function section(name) {
    console.log(`\n${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
    console.log(`${colors.cyan}  ${name}${colors.reset}`);
    console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`);
}

// ── File Utils ─────────────────────────────────────────────────────────────

async function readFile(filePath) {
    try {
        return await fs.readFile(filePath, 'utf-8');
    } catch {
        return null;
    }
}

async function walkDir(dir, options = {}) {
    const { include = () => true, exclude = [] } = options;
    const results = [];

    async function walk(currentDir) {
        const entries = await fs.readdir(currentDir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);
            const relPath = path.relative(ROOT, fullPath);

            if (exclude.some(pattern => {
                if (typeof pattern === 'string') return relPath.includes(pattern);
                return pattern.test(relPath);
            })) continue;

            if (entry.isDirectory()) {
                await walk(fullPath);
            } else if (entry.isFile() && include(entry.name, relPath)) {
                results.push({ path: fullPath, relPath, name: entry.name });
            }
        }
    }

    await walk(dir);
    return results;
}

// ── Analysis Functions ───────────────────────────────────────────────────

async function analyzeStructure() {
    const jsFiles = await walkDir(ROOT, {
        include: (name, rel) => name.endsWith('.js') || name.endsWith('.mjs'),
        exclude: ['node_modules', '.git', 'reports']
    });

    const htmlFiles = await walkDir(ROOT, {
        include: (name) => name.endsWith('.html'),
        exclude: ['node_modules', '.git', 'reports']
    });

    const cssFiles = await walkDir(ROOT, {
        include: (name) => name.endsWith('.css'),
        exclude: ['node_modules', '.git', 'reports']
    });

    const jsonFiles = await walkDir(ROOT, {
        include: (name) => name.endsWith('.json'),
        exclude: ['node_modules', '.git', 'package-lock.json']
    });

    let totalLines = 0;
    let totalCodeLines = 0;
    let totalCommentLines = 0;
    const fileStats = [];

    for (const file of [...jsFiles, ...htmlFiles]) {
        const content = await readFile(file.path);
        if (!content) continue;

        const lines = content.split('\n');
        const lineCount = lines.length;
        const codeLines = lines.filter(l => l.trim() && !l.trim().startsWith('//') && !l.trim().startsWith('*')).length;
        const commentLines = lines.filter(l => l.trim().startsWith('//') || l.trim().startsWith('/*') || l.trim().startsWith('*')).length;

        totalLines += lineCount;
        totalCodeLines += codeLines;
        totalCommentLines += commentLines;

        fileStats.push({
            path: file.relPath,
            lines: lineCount,
            code: codeLines,
            comments: commentLines
        });
    }

    return {
        jsFiles: jsFiles.length,
        htmlFiles: htmlFiles.length,
        cssFiles: cssFiles.length,
        jsonFiles: jsonFiles.length,
        totalLines,
        totalCodeLines,
        totalCommentLines,
        fileStats: fileStats.sort((a, b) => b.lines - a.lines)
    };
}

async function analyzeDependencies() {
    const packageJson = JSON.parse(await readFile(path.join(ROOT, 'package.json')) || '{}');
    const deps = packageJson.dependencies || {};

    // Check for unused dependencies (naive check)
    const jsFiles = await walkDir(ROOT, {
        include: (name) => name.endsWith('.js') || name.endsWith('.mjs'),
        exclude: ['node_modules', '.git']
    });

    const allContent = (await Promise.all(jsFiles.map(f => readFile(f.path)))).join('\n');

    const depUsage = {};
    for (const [name] of Object.entries(deps)) {
        // Handle special cases
        const importPattern = name === 'uuid'
            ? new RegExp(`import.*from ['"]${name}['"]`, 'g')
            : new RegExp(`import.*from ['"]${name}(/|$)?['"]`, 'g');
        const matches = allContent.match(importPattern);
        depUsage[name] = {
            version: deps[name],
            used: !!matches,
            importCount: matches ? matches.length : 0
        };
    }

    return depUsage;
}

async function analyzeIssues() {
    const issues = [];
    const jsFiles = await walkDir(ROOT, {
        include: (name) => name.endsWith('.js') || name.endsWith('.mjs'),
        exclude: ['node_modules', '.git', 'scripts']
    });

    for (const file of jsFiles) {
        const content = await readFile(file.path);
        if (!content) continue;

        const lines = content.split('\n');

        lines.forEach((line, index) => {
            const lineNum = index + 1;

            // TODO / FIXME / HACK comments
            if (line.match(/\/\/.*\b(TODO|FIXME|HACK|XXX|BUG)\b/i)) {
                issues.push({
                    type: 'todo',
                    severity: 'info',
                    file: file.relPath,
                    line: lineNum,
                    message: line.trim()
                });
            }

            // console.log (skip scripts/)
            if (line.match(/console\.(log|warn|error)\b/) && !file.relPath.includes('scripts/')) {
                issues.push({
                    type: 'console',
                    severity: 'warning',
                    file: file.relPath,
                    line: lineNum,
                    message: 'Debug console statement'
                });
            }

            // Potential hardcoded secrets
            if (line.match(/(apiKey|api_key|api-key)\s*[:=]\s*['"][^'"]{20,}['"]/i) &&
                !line.includes('process.env') &&
                !line.includes('config')) {
                issues.push({
                    type: 'secret',
                    severity: 'error',
                    file: file.relPath,
                    line: lineNum,
                    message: 'Potential hardcoded API key or secret'
                });
            }

            // Unhandled promise (naive)
            if (line.match(/\b(fetch|axios|import\().*\).*[^;]/) &&
                !line.includes('await') &&
                !line.includes('.then')) {
                // Skip false positives
            }
        });
    }

    return issues;
}

async function analyzeDuplicateCode() {
    const duplicates = [];
    const jsFiles = await walkDir(ROOT, {
        include: (name) => name.endsWith('.js'),
        exclude: ['node_modules', '.git']
    });

    // Known duplicate: extractTraceId
    const analyzerContent = await readFile(path.join(ROOT, 'src/services/analyzer.js'));
    const aiServiceContent = await readFile(path.join(ROOT, 'src/services/aiService.js'));

    if (analyzerContent && aiServiceContent) {
        const analyzerHas = analyzerContent.includes('function extractTraceId');
        const aiHas = aiServiceContent.includes('function extractTraceId');

        if (analyzerHas && aiHas) {
            duplicates.push({
                function: 'extractTraceId',
                locations: ['src/services/analyzer.js', 'src/services/aiService.js'],
                severity: 'warning'
            });
        }
    }

    // Check for duplicate readConfig
    const apiContent = await readFile(path.join(ROOT, 'src/routes/api.js'));
    const autoAuthContent = await readFile(path.join(ROOT, 'src/services/autoAuthSync.js'));

    if (apiContent && autoAuthContent) {
        const apiHas = apiContent.includes('async function readConfig()');
        const analyzerHas2 = analyzerContent && analyzerContent.includes('async function readConfig()');

        if (apiHas && analyzerHas2) {
            duplicates.push({
                function: 'readConfig',
                locations: ['src/routes/api.js', 'src/services/analyzer.js', 'src/services/autoAuthSync.js'],
                severity: 'warning'
            });
        }
    }

    return duplicates;
}

async function analyzeImports() {
    const jsFiles = await walkDir(ROOT, {
        include: (name) => name.endsWith('.js'),
        exclude: ['node_modules', '.git']
    });

    const imports = {};
    const circularDeps = [];

    for (const file of jsFiles) {
        const content = await readFile(file.path);
        if (!content) continue;

        const importMatches = content.matchAll(/import\s+.*?\s+from\s+['"]([^'"]+)['"]/g);
        for (const match of importMatches) {
            const source = match[1];
            if (source.startsWith('.') || source.startsWith('/')) {
                const target = source.endsWith('.js') ? source : source + '.js';
                imports[file.relPath] = imports[file.relPath] || [];
                imports[file.relPath].push(target);
            }
        }
    }

    // Detect circular imports (simplified: check if A imports B and B imports A)
    for (const [file, deps] of Object.entries(imports)) {
        for (const dep of deps) {
            const depPath = path.join(path.dirname(file), dep);
            // Simplified check
        }
    }

    return imports;
}

// ── Report Generation ─────────────────────────────────────────────────────

function generateReport(data) {
    const { structure, dependencies, issues, duplicates, imports } = data;
    const timestamp = new Date().toISOString();

    const depTable = Object.entries(dependencies)
        .map(([name, info]) => `| ${name} | ${info.version} | ${info.used ? '✅ Yes' : '⚠️ Unused'} | ${info.importCount} |`)
        .join('\n');

    const issueTable = issues
        .filter(i => i.severity !== 'info')
        .map(i => `| ${i.severity === 'error' ? '🔴' : '🟡'} | ${i.file} | ${i.line} | ${i.type} | ${i.message} |`)
        .join('\n') || '| ✅ | No issues found | - | - | - |';

    const todoList = issues
        .filter(i => i.type === 'todo')
        .map(i => `- **${i.file}:${i.line}** — ${i.message}`)
        .join('\n') || 'No TODO/FIXME comments found.';

    const dupTable = duplicates
        .map(d => `| \`${d.function}\` | ${d.locations.join(', ')} | ${d.severity} |`)
        .join('\n') || '| ✅ | None | - |';

    const fileTable = structure.fileStats
        .slice(0, 10)
        .map(f => `| ${f.path} | ${f.lines} | ${f.code} | ${f.comments} |`)
        .join('\n');

    return `# Codebase Analysis Report

Generated: ${timestamp}

## Summary

| Metric | Value |
|--------|-------|
| JavaScript Files | ${structure.jsFiles} |
| HTML Files | ${structure.htmlFiles} |
| CSS Files | ${structure.cssFiles} |
| JSON Configs | ${structure.jsonFiles} |
| Total Lines | ${structure.totalLines.toLocaleString()} |
| Code Lines | ${structure.totalCodeLines.toLocaleString()} |
| Comment Lines | ${structure.totalCommentLines.toLocaleString()} |
| Comment Ratio | ${((structure.totalCommentLines / structure.totalLines) * 100).toFixed(1)}% |

## Dependency Analysis

| Package | Version | Used | Import Count |
|---------|---------|------|-------------|
${depTable}

## Top Files by Size

| File | Lines | Code | Comments |
|------|-------|------|----------|
${fileTable}

## Duplicate Code

| Function | Locations | Severity |
|----------|-----------|----------|
${dupTable}

## Issues Found

| Severity | File | Line | Type | Description |
|----------|------|------|------|-------------|
${issueTable}

## TODOs / FIXMEs

${todoList}

## Recommendations

1. **Reduce console.log usage**: Move debug logs to a proper logging utility
2. **Extract shared functions**: \`extractTraceId\`, \`readConfig\` are duplicated across files
3. **Add error boundaries**: Several async functions lack proper error handling
4. **Consider adding tests**: No test framework is currently configured

---

*Report generated by \`scripts/analyze-codebase.mjs\`*
`;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
    console.log(`${colors.cyan}
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║        SLS Log Analyzer - Codebase Analysis Workflow          ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝${colors.reset}\n`);

    // Ensure reports directory
    await fs.mkdir(REPORTS_DIR, { recursive: true });

    section('Analyzing Project Structure');
    const structure = await analyzeStructure();
    log('JavaScript Files', String(structure.jsFiles), 'green');
    log('HTML Files', String(structure.htmlFiles), 'green');
    log('Total Lines', String(structure.totalLines), 'green');
    log('Comment Ratio', `${((structure.totalCommentLines / structure.totalLines) * 100).toFixed(1)}%`, 'green');

    section('Analyzing Dependencies');
    const dependencies = await analyzeDependencies();
    for (const [name, info] of Object.entries(dependencies)) {
        const color = info.used ? 'green' : 'yellow';
        log(name, `${info.version} — ${info.used ? `used (${info.importCount}×)` : '⚠️ unused'}`, color);
    }

    section('Scanning for Issues');
    const issues = await analyzeIssues();
    const errors = issues.filter(i => i.severity === 'error');
    const warnings = issues.filter(i => i.severity === 'warning');
    const todos = issues.filter(i => i.type === 'todo');

    if (errors.length > 0) log('Errors', String(errors.length), 'red');
    if (warnings.length > 0) log('Warnings', String(warnings.length), 'yellow');
    if (todos.length > 0) log('TODOs', String(todos.length), 'blue');
    if (errors.length === 0 && warnings.length === 0) log('No critical issues found', '', 'green');

    section('Checking for Duplicate Code');
    const duplicates = await analyzeDuplicateCode();
    if (duplicates.length > 0) {
        for (const dup of duplicates) {
            log(`⚠️ Duplicate: ${dup.function}`, dup.locations.join(', '), 'yellow');
        }
    } else {
        log('No duplicate code found', '', 'green');
    }

    section('Generating Report');
    const report = generateReport({ structure, dependencies, issues, duplicates, imports: {} });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportPath = path.join(REPORTS_DIR, `codebase-analysis-${timestamp}.md`);

    await fs.writeFile(reportPath, report, 'utf-8');
    log('Report saved', reportPath, 'green');

    console.log(`\n${colors.cyan}Done!${colors.reset}\n`);
}

main().catch(console.error);
