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
        let { projectId, timeRange, query, size = 100, maxPages = 1, customPrompt = '', presetTemplate = '' } = req.body;

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

        // 解析真实 SLS 项目ID：优先用环境配置，回退到项目自带 projectName（老数据兼容）
        const envKey = project.envKey;
        const envConfig = envKey && (config.environments || {})[envKey];
        const slsProjectName = (envConfig && envConfig.slsProjectName) || project.projectName;
        if (!slsProjectName) {
            return res.status(400).json({ success: false, error: '该项目缺少环境配置（SLS 项目ID），请到项目管理补全' });
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
            projectName: slsProjectName,
            logStoreName: project.logStoreName,
            timeRange,
            query,
            size,
            maxPages,
            aiConfig: config.aiConfig,
            customPrompt,
            presetTemplate
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
        const { projectId, traceId, aroundTime, timeRange, maxPages = 3 } = req.body;

        if (!projectId || !traceId) {
            return res.status(400).json({ success: false, error: '缺少项目 ID 或 traceId' });
        }

        const config = await readConfig();
        const project = config.projects[projectId];
        const slsConfig = config.slsConfig || {};

        if (!project) {
            return res.status(404).json({ success: false, error: '项目不存在' });
        }

        // 解析真实 SLS 项目ID（环境配置优先，回退老字段）
        const traceEnv = project.envKey && (config.environments || {})[project.envKey];
        const traceSlsProjectName = (traceEnv && traceEnv.slsProjectName) || project.projectName;
        if (!traceSlsProjectName) {
            return res.status(400).json({ success: false, error: '该项目缺少环境配置（SLS 项目ID）' });
        }

        if (!slsConfig.cookies || Object.keys(slsConfig.cookies).length === 0) {
            return res.status(401).json({ success: false, error: 'SLS 认证信息缺失' });
        }

        // 构建 traceId 查询（兼容多种字段名）
        // 搜索 content 中包含 traceId 的日志（兼容多种格式：[TID_xxx], TID:xxx, traceId:xxx）
        // 末尾追加裸 traceId，兼容日志里直接出现 ID 本体的格式
        const traceQuery = `"TID_${traceId}" OR "traceId:${traceId}" OR "trace_id:${traceId}" OR "${traceId}"`;

        const { searchLogsMultiPage } = await import('../services/slsClient.js');
        const { parseTimeRange } = await import('../services/timeParser.js');

        // 时间窗口：优先围绕原日志时间点 ±6h（精准覆盖 trace 生命周期）；
        // 否则回退 last7days（比 thisWeek 稳健，不依赖当前是周几）
        let from, to, timeLabel, fromFormatted, toFormatted;
        if (aroundTime && Number.isFinite(Number(aroundTime))) {
            const center = Number(aroundTime);
            const HALF_WINDOW = 6 * 3600; // ±6 小时
            from = center - HALF_WINDOW;
            to = center + HALF_WINDOW;
            const centerDate = new Date(center * 1000);
            timeLabel = `围绕 ${centerDate.toLocaleString('zh-CN')} ±6h`;
            fromFormatted = new Date(from * 1000).toLocaleString('zh-CN');
            toFormatted = new Date(to * 1000).toLocaleString('zh-CN');
        } else {
            const timeInfo = parseTimeRange(timeRange || 'last7days');
            from = timeInfo.from;
            to = timeInfo.to;
            timeLabel = timeInfo.label;
            fromFormatted = timeInfo.fromFormatted;
            toFormatted = timeInfo.toFormatted;
        }

        const result = await searchLogsMultiPage({
            projectName: traceSlsProjectName,
            logStoreName: project.logStoreName,
            query: traceQuery,
            from,
            to,
            size: 100
        }, slsConfig, maxPages);

        res.json({
            success: true,
            data: {
                traceId,
                projectName: project.projectName,
                logStoreName: project.logStoreName,
                query: traceQuery,
                timeRange: timeLabel,
                timeFrom: fromFormatted,
                timeTo: toFormatted,
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
