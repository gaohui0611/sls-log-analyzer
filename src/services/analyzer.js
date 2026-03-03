/**
 * 日志分析器
 */

import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { callAI } from './aiService.js';
import { searchLogs } from './slsClient.js';
import { parseTimeRange } from './timeParser.js';

const REPORTS_DIR = path.join(process.cwd(), 'reports');
const CONFIG_FILE = path.join(process.cwd(), 'config.json');

/**
 * 读取配置
 */
async function readConfig() {
    try {
        const data = await fs.readFile(CONFIG_FILE, 'utf-8');
        return JSON.parse(data);
    } catch {
        return {
            projects: {},
            aiConfig: {},
            slsConfig: {
                region: 'cn-beijing'
            }
        };
    }
}

/**
 * 分析日志
 */
export async function analyzeLogs(params) {
    console.log('[analyzer] 开始分析');
    const {
        projectName,
        logStoreName,
        timeRange = 'thisWeek',
        query = '',
        size = 100,
        aiConfig
    } = params;

    console.log('[analyzer] 参数:', { projectName, logStoreName, timeRange, query, size });

    // 读取全局配置获取 SLS 认证信息
    const config = await readConfig();
    const slsConfig = config.slsConfig || {};

    // 解析时间范围
    const timeInfo = parseTimeRange(timeRange);
    console.log('[analyzer] 时间范围:', timeInfo);

    // 搜索日志
    console.log('[analyzer] 开始搜索日志...');
    const searchResult = await searchLogs({
        projectName,
        logStoreName,
        query,
        from: timeInfo.from,
        to: timeInfo.to,
        size
    }, {
        cookies: slsConfig.cookies || {},
        csrfToken: slsConfig.csrfToken || '',
        b3: slsConfig.b3 || '',
        region: slsConfig.region || 'cn-beijing'
    });

    console.log('[analyzer] 搜索结果:', { count: searchResult.count, logs: searchResult.logs?.length });

    // 基础统计
    console.log('[analyzer] 开始基础统计...');
    const stats = analyzeStats(searchResult.logs);
    console.log('[analyzer] 统计完成');

    // AI 分析
    let aiAnalysis = null;
    console.log('[analyzer] AI 配置检查:', { hasApiKey: !!aiConfig?.apiKey, provider: aiConfig?.provider });
    if (aiConfig?.apiKey && searchResult.logs.length > 0) {
        try {
            console.log('[analyzer] 开始 AI 分析...');
            // 设置超时
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('AI 分析超时（180秒）')), 180000)
            );

            aiAnalysis = await Promise.race([
                callAI(searchResult.logs, query, timeInfo, aiConfig),
                timeoutPromise
            ]);
            console.log('[analyzer] AI 分析完成');
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
        timeRange: timeInfo.label,
        timeFrom: timeInfo.fromFormatted,
        timeTo: timeInfo.toFormatted,
        size, // 请求的日志数量
        logCount: searchResult.count,
        returnedCount: searchResult.logs.length,
        stats,
        aiAnalysis,
        logs: searchResult.logs
    };

    // 保存报告
    await fs.writeFile(
        path.join(REPORTS_DIR, `${report.id}.json`),
        JSON.stringify(report, null, 2),
        'utf-8'
    );

    return report;
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
            timeSpan: null
        };
    }

    const byLevel = {};
    const errors = [];
    const warnings = [];
    const uniqueTraces = new Set();
    const uniqueUsers = new Set();

    for (const log of logs) {
        // 日志级别
        const level = (log.level || log.LEVEL || 'INFO').toUpperCase();
        byLevel[level] = (byLevel[level] || 0) + 1;

        // 错误检测 (SLS 日志使用 content 字段)
        const message = log.content || log.message || log.msg || '';
        if (level === 'ERROR' || message.includes('Exception')) {
            errors.push({
                time: log.__time__ ? new Date(log.__time__ * 1000).toISOString() : null,
                level,
                message: message.substring(0, 500)
            });
        }

        // 警告检测
        if (level === 'WARN') {
            warnings.push({
                time: log.__time__ ? new Date(log.__time__ * 1000).toISOString() : null,
                message: message.substring(0, 500)
            });
        }

        // Trace ID
        const traceId = log.TID || log.traceId || log.trace_id;
        if (traceId) uniqueTraces.add(traceId);

        // 用户 ID
        const userId = log.userId || log.user_id;
        if (userId) uniqueUsers.add(userId);
    }

    return {
        total: logs.length,
        byLevel,
        errors: errors.slice(0, 20), // 最多 20 条
        warnings: warnings.slice(0, 20),
        uniqueTraces: Array.from(uniqueTraces),
        uniqueUsers: Array.from(uniqueUsers),
        timeSpan: calculateTimeSpan(logs)
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
