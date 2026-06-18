/**
 * 日志分析器
 */

import { v4 as uuidv4 } from 'uuid';
import { callAI } from './aiService.js';
import { searchLogsMultiPage } from './slsClient.js';
import { parseTimeRange } from './timeParser.js';

import { readConfig } from '../utils/config.js';
import { saveReport as saveReportToDb } from '../utils/db.js';

/**
 * 分析日志 — 多阶段流水线
 * 阶段1: 广泛查询（用户关键词 + 多页翻页）→ 统计概览
 * 阶段2（条件触发）: 精准二次检索（level:ERROR OR level:WARN）→ 合并去重
 * 阶段3: AI 分析（合并后的日志集）
 */
export async function analyzeLogs(params) {
    const {
        projectName,
        logStoreName,
        timeRange = 'thisWeek',
        query = '',
        size = 100,
        maxPages = 1,
        aiConfig,
        customPrompt = '',
        presetTemplate = ''
    } = params;

    const searchPhases = [];

    // 读取全局配置获取 SLS 认证信息
    const config = await readConfig();
    const slsConfig = config.slsConfig || {};

    // 解析时间范围
    const timeInfo = parseTimeRange(timeRange);

    // === 阶段1: 广泛查询 ===
    console.log('[analyzer] 阶段1: 广泛查询, query:', query, 'maxPages:', maxPages);
    const firstPass = await searchLogsMultiPage({
        projectName, logStoreName, query, from: timeInfo.from, to: timeInfo.to, size
    }, {
        cookies: slsConfig.cookies || {},
        csrfToken: slsConfig.csrfToken || '',
        b3: slsConfig.b3 || '',
        region: slsConfig.region || 'cn-beijing'
    }, maxPages);

    searchPhases.push({
        phase: '广泛查询',
        query: query || '(全部日志)',
        pagesUsed: firstPass.pagesUsed,
        logCount: firstPass.logs.length
    });

    let mergedLogs = firstPass.logs;
    let refinedQuery = null;

    // === 阶段2: 精准二次检索（条件触发）===
    const firstStats = analyzeStats(firstPass.logs);
    const errorWarnCount = (firstStats.byLevel?.ERROR || 0) + (firstStats.byLevel?.WARN || 0);

    if (firstPass.logs.length >= 50 && errorWarnCount < 5 && !query.includes('level')) {
        console.log('[analyzer] 阶段2: 触发精准二次检索, ERROR/WARN 数:', errorWarnCount);

        // 二次检索策略：搜索 content 中包含 ERROR/Exception/WARN 关键词
        // 注意：SLS 的 level 字段可能和日志内部的级别不一致
        const refineQuery = errorWarnCount < 2
            ? 'ERROR OR Exception OR WARN'
            : 'ERROR OR Exception';

        refinedQuery = refineQuery;

        const secondPass = await searchLogsMultiPage({
            projectName, logStoreName,
            query: refineQuery,
            from: timeInfo.from, to: timeInfo.to,
            size
        }, {
            cookies: slsConfig.cookies || {},
            csrfToken: slsConfig.csrfToken || '',
            b3: slsConfig.b3 || '',
            region: slsConfig.region || 'cn-beijing'
        }, 2); // 二次检索最多2页

        searchPhases.push({
            phase: '精准二次检索',
            query: refineQuery,
            pagesUsed: secondPass.pagesUsed,
            logCount: secondPass.logs.length
        });

        // 合并去重：二次检索的日志补充到广泛查询中
        const existingKeys = new Set(mergedLogs.map(l => `${l.__time__ || ''}|${l.content || l.message || ''}`));
        for (const log of secondPass.logs) {
            const key = `${log.__time__ || ''}|${log.content || log.message || ''}`;
            if (!existingKeys.has(key)) {
                mergedLogs.push(log);
                existingKeys.add(key);
            }
        }

        console.log('[analyzer] 合并后日志数:', mergedLogs.length);
    }

    // === 阶段3: 统计 + AI 分析 ===
    const stats = analyzeStats(mergedLogs);

    let aiAnalysis = null;
    if (aiConfig?.apiKey && mergedLogs.length > 0) {
        try {
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('AI 分析超时（180秒）')), 180000)
            );

            aiAnalysis = await Promise.race([
                callAI(mergedLogs, query, timeInfo, aiConfig, customPrompt),
                timeoutPromise
            ]);
        } catch (error) {
            console.error('[analyzer] AI 分析失败:', error.message);
            aiAnalysis = { error: error.message };
        }
    }

    // 生成报告
    const report = {
        id: uuidv4(),
        createdAt: new Date().toISOString(),
        projectName,
        logStoreName,
        query,
        refinedQuery,
        timeRange: timeInfo.label,
        timeFrom: timeInfo.fromFormatted,
        timeTo: timeInfo.toFormatted,
        size,
        maxPages,
        logCount: firstPass.count,
        returnedCount: mergedLogs.length,
        searchPhases,
        stats,
        aiAnalysis,
        presetTemplate: presetTemplate || 'custom',
        logs: mergedLogs
    };

    // 落库（reports + report_logs），替代原 JSON 文件存储
    saveReportToDb(report);

    return report;
}

/**
 * 从日志中提取 traceId — 支持独立字段和 content 内嵌格式
 */
function extractTraceId(log, message) {
    // 1. 独立字段
    if (log.TID || log.traceId || log.trace_id) {
        return log.TID || log.traceId || log.trace_id;
    }
    // 2. content 内嵌格式：[TID_xxx] 或 TID:xxx
    const match = message.match(/\[TID_([^\]]+)\]|TID[:\s]+(\S+)/);
    if (match) return match[1] || match[2];
    return '';
}

/**
 * 分析日志统计
 */
function analyzeStats(logs) {
    if (!logs || logs.length === 0) {
        return {
            total: 0,
            byLevel: {},
            errors: [],
            warnings: [],
            uniqueTraces: [],
            uniqueUsers: [],
            timeSpan: null,
            keyLogs: [] // 重点日志
        };
    }

    const byLevel = {};
    const errors = [];
    const warnings = [];
    const uniqueTraces = new Set();
    const uniqueUsers = new Set();
    const keyLogs = []; // 重点日志：ERROR、WARN、异常、堆栈等

    for (const log of logs) {
        const level = (log.level || log.LEVEL || 'INFO').toUpperCase();
        byLevel[level] = (byLevel[level] || 0) + 1;

        const message = log.content || log.message || log.msg || '';
        const time = log.__time__ ? new Date(log.__time__ * 1000).toISOString() : null;
        const traceId = extractTraceId(log, message);
        const userId = log.userId || log.user_id || '';

        if (level === 'ERROR' || message.includes('Exception') || message.includes('Error')) {
            errors.push({ time, level, message: message.substring(0, 500) });
            keyLogs.push({
                time, level, message, traceId, userId,
                reason: level === 'ERROR' ? 'ERROR级别' : '包含异常信息'
            });
        }

        if (level === 'WARN') {
            warnings.push({ time, message: message.substring(0, 500) });
            keyLogs.push({
                time, level, message, traceId, userId,
                reason: 'WARN级别'
            });
        }

        if (message.includes('\n\tat ') || message.includes('\tat ') || message.includes('Stack trace')) {
            if (!keyLogs.find(k => k.message === message)) {
                keyLogs.push({
                    time, level, message, traceId, userId,
                    reason: '包含堆栈信息'
                });
            }
        }

        if (traceId) uniqueTraces.add(traceId);
        if (userId) uniqueUsers.add(userId);
    }

    // 按时间排序重点日志（最新的在前）
    keyLogs.sort((a, b) => {
        if (!a.time) return 1;
        if (!b.time) return -1;
        return new Date(b.time) - new Date(a.time);
    });

    // 兜底：若没有异常/堆栈日志（常见于 traceId 链路追踪的全 INFO 正常链路），
    // 从日志里按时间均匀抽取代表性样本补入重点日志，避免该区空白
    if (keyLogs.length === 0 && logs.length > 0) {
        const byTime = [...logs].sort((a, b) => (a.__time__ || 0) - (b.__time__ || 0));
        const sampleStep = Math.max(1, Math.floor(byTime.length / 5));
        for (let i = 0; i < byTime.length && keyLogs.length < 5; i += sampleStep) {
            const log = byTime[i];
            const message = log.content || log.message || log.msg || '';
            const traceId = extractTraceId(log, message);
            if (!traceId && keyLogs.length >= 3) continue; // 优先保留含 traceId 的样本
            keyLogs.push({
                time: log.__time__ ? new Date(log.__time__ * 1000).toISOString() : null,
                level: (log.level || log.LEVEL || 'INFO').toUpperCase(),
                message, traceId,
                userId: log.userId || log.user_id || '',
                reason: '链路日志样本'
            });
        }
    }

    return {
        total: logs.length,
        byLevel,
        errors: errors.slice(0, 20), // 最多 20 条
        warnings: warnings.slice(0, 20),
        uniqueTraces: Array.from(uniqueTraces),
        uniqueUsers: Array.from(uniqueUsers),
        timeSpan: calculateTimeSpan(logs),
        keyLogs: keyLogs.slice(0, 50) // 最多 50 条重点日志
    };
}

/**
 * 计算时间跨度
 */
function calculateTimeSpan(logs) {
    const timestamps = logs
        .filter(l => l.__time__)
        .map(l => l.__time__)
        .sort((a, b) => a - b);

    if (timestamps.length < 2) return null;

    const diff = timestamps[timestamps.length - 1] - timestamps[0];
    return {
        start: new Date(timestamps[0] * 1000).toISOString(),
        end: new Date(timestamps[timestamps.length - 1] * 1000).toISOString(),
        durationSeconds: diff
    };
}
