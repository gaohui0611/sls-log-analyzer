/**
 * 报告路由 - /api/reports
 */

import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { tokenize } from '../utils/keywordTokenizer.js';

const router = express.Router();
const REPORTS_DIR = path.join(process.cwd(), 'reports');

// 确保报告目录存在
await fs.mkdir(REPORTS_DIR, { recursive: true });

/**
 * 校验报告 ID，防止路径遍历
 * @param {string} id - 报告 ID
 * @returns {string|null} 安全的 ID，或 null 表示非法
 */
function sanitizeReportId(id) {
    // 只允许 UUID 格式的 ID（字母、数字、连字符）
    const safeId = id.replace(/[/\\]/g, '');
    const resolved = path.resolve(REPORTS_DIR, `${safeId}.json`);
    if (!resolved.startsWith(REPORTS_DIR)) return null;
    return safeId;
}

/**
 * GET /api/reports - 获取报告列表
 */
router.get('/reports', async (req, res) => {
    try {
        const files = await fs.readdir(REPORTS_DIR);
        const reports = [];

        for (const file of files) {
            if (file.endsWith('.json')) {
                const filePath = path.join(REPORTS_DIR, file);
                const stat = await fs.stat(filePath);
                const content = await fs.readFile(filePath, 'utf-8');
                const data = JSON.parse(content);

                reports.push({
                    id: file.replace('.json', ''),
                    filename: file,
                    createdAt: new Date(stat.birthtime).toISOString(),
                    projectName: data.projectName,
                    logStoreName: data.logStoreName,
                    query: data.query,
                    timeRange: data.timeRange,
                    timeFrom: data.timeFrom,
                    timeTo: data.timeTo,
                    size: data.size,
                    logCount: data.logCount,
                    returnedCount: data.returnedCount
                });
            }
        }

        reports.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        res.json({ success: true, data: reports });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/reports/:id - 获取报告详情
 */
router.get('/reports/:id', async (req, res) => {
    try {
        const id = sanitizeReportId(req.params.id);
        if (!id) return res.status(403).json({ success: false, error: '非法的报告 ID' });

        const filePath = path.join(REPORTS_DIR, `${id}.json`);
        const content = await fs.readFile(filePath, 'utf-8');
        const data = JSON.parse(content);

        res.json({ success: true, data });
    } catch (error) {
        res.status(404).json({ success: false, error: '报告不存在' });
    }
});

/**
 * DELETE /api/reports/:id - 删除报告
 */
router.delete('/reports/:id', async (req, res) => {
    try {
        const id = sanitizeReportId(req.params.id);
        if (!id) return res.status(403).json({ success: false, error: '非法的报告 ID' });

        const filePath = path.join(REPORTS_DIR, `${id}.json`);
        await fs.unlink(filePath);
        res.json({ success: true });
    } catch (error) {
        res.status(404).json({ success: false, error: '报告不存在' });
    }
});

/**
 * GET /api/dashboard - 跨报告聚合仪表盘数据
 * 单次遍历所有报告文件，聚合统计后返回。
 */
router.get('/dashboard', async (req, res) => {
    try {
        const files = await fs.readdir(REPORTS_DIR);

        // 聚合容器
        const summary = { reportCount: 0, totalLogs: 0, totalErrors: 0, totalWarnings: 0, aiAnalyzed: 0, earliest: null, latest: null };
        const byProject = {};          // logStoreName -> 聚合
        const timeTrend = {};          // YYYY-MM-DD -> {reportCount, errorReportCount}
        const levelDistribution = {};  // level -> count
        const hourly = new Array(24).fill(0);  // 0-23 时
        const analysisMode = {};      // presetTemplate -> count
        const errorRanking = [];      // 每报告一条
        const texts = [];             // 用于关键词云的全部日志正文

        for (const file of files) {
            if (!file.endsWith('.json')) continue;
            const filePath = path.join(REPORTS_DIR, file);
            let data;
            try {
                data = JSON.parse(await fs.readFile(filePath, 'utf-8'));
            } catch {
                continue; // 跳过损坏文件
            }

            const createdAt = data.createdAt;
            summary.reportCount++;
            const logCount = data.logCount || (data.logs ? data.logs.length : 0) || 0;
            summary.totalLogs += logCount;

            const stats = data.stats || {};
            const byLevel = stats.byLevel || {};
            const errCount = (stats.errors || []).length;
            const warnCount = (stats.warnings || []).length;
            summary.totalErrors += errCount;
            summary.totalWarnings += warnCount;

            // AI 覆盖率：aiAnalysis 存在且非 error 视为已分析
            const aiAnalyzed = data.aiAnalysis && !data.aiAnalysis.error;
            if (aiAnalyzed) summary.aiAnalyzed++;

            // 分析模式（老报告无字段记为 unknown）
            const mode = data.presetTemplate || 'unknown';
            analysisMode[mode] = (analysisMode[mode] || 0) + 1;

            // 时间范围
            if (createdAt) {
                if (!summary.earliest || createdAt < summary.earliest) summary.earliest = createdAt;
                if (!summary.latest || createdAt > summary.latest) summary.latest = createdAt;
                const day = createdAt.slice(0, 10);
                if (!timeTrend[day]) timeTrend[day] = { reportCount: 0, errorReportCount: 0 };
                timeTrend[day].reportCount++;
                if (errCount > 0) timeTrend[day].errorReportCount++;
            }

            // 按项目分组
            const key = data.logStoreName || data.projectName || '(未命名)';
            if (!byProject[key]) {
                byProject[key] = { name: data.projectName || key, logStore: key, reportCount: 0, logCount: 0, errorCount: 0 };
            }
            byProject[key].reportCount++;
            byProject[key].logCount += logCount;
            byProject[key].errorCount += errCount;

            // 级别分布合并
            for (const [lv, cnt] of Object.entries(byLevel)) {
                levelDistribution[lv] = (levelDistribution[lv] || 0) + cnt;
            }

            // 错误排名
            errorRanking.push({
                id: data.id || file.replace('.json', ''),
                projectName: data.projectName || key,
                query: data.query || '',
                errorCount: errCount,
                warnCount,
                total: logCount,
                createdAt: createdAt
            });

            // 小时分布 + 关键词云文本
            const logs = data.logs || [];
            for (const log of logs) {
                const t = log.__time__ || log._time_ || log.time;
                if (t) {
                    const d = new Date(typeof t === 'number' ? t * 1000 : t);
                    const h = d.getHours();
                    if (!isNaN(h)) hourly[h]++;
                }
                if (log.content) texts.push(log.content);
            }
        }

        // 衍生计算
        const byProjectArr = Object.values(byProject).map(p => ({
            ...p,
            errorRate: p.logCount > 0 ? +(p.errorCount / p.logCount * 100).toFixed(1) : 0
        })).sort((a, b) => b.reportCount - a.reportCount);

        const timeTrendArr = Object.entries(timeTrend)
            .map(([date, v]) => ({ date, ...v }))
            .sort((a, b) => a.date.localeCompare(b.date));

        const errorRankingTop = errorRanking
            .sort((a, b) => (b.errorCount + b.warnCount) - (a.errorCount + a.warnCount))
            .slice(0, 10);

        res.json({
            success: true,
            data: {
                summary,
                byProject: byProjectArr,
                timeTrend: timeTrendArr,
                errorRanking: errorRankingTop,
                aiCoverage: {
                    analyzed: summary.aiAnalyzed,
                    total: summary.reportCount,
                    rate: summary.reportCount > 0 ? +(summary.aiAnalyzed / summary.reportCount * 100).toFixed(1) : 0
                },
                analysisMode,
                levelDistribution,
                hourlyDistribution: hourly,
                keywordCloud: tokenize(texts, 60)
            }
        });
    } catch (error) {
        console.error('[dashboard] 聚合失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;

