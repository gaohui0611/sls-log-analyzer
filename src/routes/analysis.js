/**
 * 分析路由 - /api/analyze, /api/trace-search
 */

import express from 'express';
import { readConfig } from '../utils/config.js';
import { extractTraceContext } from '../utils/traceExtractor.js';

const router = express.Router();

/**
 * POST /api/analyze - 执行日志分析
 */
router.post('/analyze', async (req, res) => {
    try {
        console.log('[DEBUG] 收到分析请求');
        let { projectId, timeRange, query, size = 100, maxPages = 1, customPrompt = '' } = req.body;

        // 后端兜底：中文引号 → 英文引号，清理多余空格
        if (query) {
            query = query
                .replace(/[“”]/g, '"')   // 全角"" → 半角""
                .replace(/[‘’]/g, '"')   // 全角'' → 半角""
                .replace(/\s+(AND|OR)\s+/gi, ' $1 ') // 多余空格
                .trim();
        }

        console.log('[DEBUG] 项目 ID:', projectId, 'maxPages:', maxPages);

        if (!projectId) {
            return res.status(400).json({ success: false, error: '缺少项目 ID' });
        }

        console.log('[DEBUG] 读取配置...');
        const config = await readConfig();
        const project = config.projects[projectId];
        console.log('[DEBUG] 项目配置:', project);

        if (!project) {
            return res.status(404).json({ success: false, error: '项目不存在' });
        }

        // 验证 SLS 认证状态
        const slsConfig = config.slsConfig || {};
        console.log('[DEBUG] SLS cookies 数量:', Object.keys(slsConfig.cookies || {}).length);
        if (!slsConfig.cookies || Object.keys(slsConfig.cookies).length === 0) {
            return res.status(401).json({
                success: false,
                error: 'SLS 认证信息缺失，请先同步认证信息'
            });
        }

        console.log('[DEBUG] 开始分析日志...');
        // 导入分析模块
        const { analyzeLogs } = await import('../services/analyzer.js');

        console.log('[DEBUG] 调用 analyzeLogs...');
        const result = await analyzeLogs({
            projectName: project.projectName,
            logStoreName: project.logStoreName,
            timeRange,
            query,
            size,
            maxPages,
            aiConfig: config.aiConfig,
            customPrompt
        });
        console.log('[DEBUG] 分析完成');

        res.json({ success: true, data: result });

    } catch (error) {
        console.error('分析失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/trace-search - traceId 链路追踪
 */
router.post('/trace-search', async (req, res) => {
    try {
        const { projectId, traceId, timeRange = 'thisWeek', maxPages = 3 } = req.body;

        if (!projectId || !traceId) {
            return res.status(400).json({ success: false, error: '缺少项目 ID 或 traceId' });
        }

        const config = await readConfig();
        const project = config.projects[projectId];
        const slsConfig = config.slsConfig || {};

        if (!project) {
            return res.status(404).json({ success: false, error: '项目不存在' });
        }

        if (!slsConfig.cookies || Object.keys(slsConfig.cookies).length === 0) {
            return res.status(401).json({ success: false, error: 'SLS 认证信息缺失' });
        }

        // 构建 traceId 查询（兼容多种字段名）
        // 搜索 content 中包含 traceId 的日志（兼容多种格式：[TID_xxx], TID:xxx, traceId:xxx）
        const traceQuery = `TID_${traceId} OR "traceId:${traceId}" OR "trace_id:${traceId}"`;

        const { searchLogsMultiPage } = await import('../services/slsClient.js');
        const { parseTimeRange } = await import('../services/timeParser.js');

        const timeInfo = parseTimeRange(timeRange);
        const result = await searchLogsMultiPage({
            projectName: project.projectName,
            logStoreName: project.logStoreName,
            query: traceQuery,
            from: timeInfo.from,
            to: timeInfo.to,
            size: 100
        }, slsConfig, maxPages);

        res.json({
            success: true,
            data: {
                traceId,
                projectName: project.projectName,
                logStoreName: project.logStoreName,
                query: traceQuery,
                timeRange: timeInfo.label,
                timeFrom: timeInfo.fromFormatted,
                timeTo: timeInfo.toFormatted,
                count: result.count,
                logCount: result.logs.length,
                pagesUsed: result.pagesUsed,
                logs: result.logs,
                context: extractTraceContext(result.logs)
            }
        });

    } catch (error) {
        console.error('traceId 检索失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
