/**
 * 报告路由 - /api/reports, /api/dashboard
 * 数据源：SQLite（src/utils/db.js），不再读 reports/*.json
 */

import express from 'express';
import { getDb } from '../utils/db.js';
import { tokenize } from '../utils/keywordTokenizer.js';

const router = express.Router();

/**
 * GET /api/reports - 获取报告列表（走索引，不解析完整 JSON）
 */
router.get('/reports', async (req, res) => {
    try {
        const db = getDb();
        const rows = db.prepare(`
            SELECT id, created_at AS createdAt, project_name AS projectName,
                   log_store_name AS logStoreName, query, time_range AS timeRange,
                   time_from AS timeFrom, time_to AS timeTo, size,
                   log_count AS logCount, returned_count AS returnedCount
            FROM reports
            ORDER BY created_at DESC
        `).all();
        // filename 列表页用不到实际文件，保留兼容字段
        const reports = rows.map(r => ({ ...r, filename: `${r.id}.json` }));
        res.json({ success: true, data: reports });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/reports/:id - 获取报告详情（读单行 data_json）
 */
router.get('/reports/:id', async (req, res) => {
    try {
        const id = req.params.id;
        // 校验 UUID，防注入
        if (!/^[a-zA-Z0-9-]+$/.test(id)) {
            return res.status(403).json({ success: false, error: '非法的报告 ID' });
        }
        const db = getDb();
        const row = db.prepare('SELECT data_json FROM reports WHERE id = ?').get(id);
        if (!row) return res.status(404).json({ success: false, error: '报告不存在' });

        res.json({ success: true, data: JSON.parse(row.data_json) });
    } catch (error) {
        res.status(404).json({ success: false, error: '报告不存在' });
    }
});

/**
 * DELETE /api/reports/:id - 删除报告（FK CASCADE 自动清 report_logs）
 */
router.delete('/reports/:id', async (req, res) => {
    try {
        const id = req.params.id;
        if (!/^[a-zA-Z0-9-]+$/.test(id)) {
            return res.status(403).json({ success: false, error: '非法的报告 ID' });
        }
        const db = getDb();
        const info = db.prepare('DELETE FROM reports WHERE id = ?').run(id);
        if (info.changes === 0) return res.status(404).json({ success: false, error: '报告不存在' });
        res.json({ success: true });
    } catch (error) {
        res.status(404).json({ success: false, error: '报告不存在' });
    }
});

/**
 * GET /api/dashboard - 跨报告聚合仪表盘
 * 全部用 SQL 聚合（reports 预聚合列 + report_logs），不解析完整 JSON
 */
router.get('/dashboard', async (req, res) => {
    try {
        const db = getDb();

        // summary + analysisMode + aiCoverage（一次扫描 reports）
        const summaryRow = db.prepare(`
            SELECT COUNT(*) AS reportCount,
                   COALESCE(SUM(log_count), 0) AS totalLogs,
                   COALESCE(SUM(error_count), 0) AS totalErrors,
                   COALESCE(SUM(warning_count), 0) AS totalWarnings,
                   COALESCE(SUM(has_ai_analysis), 0) AS aiAnalyzed,
                   MIN(created_at) AS earliest,
                   MAX(created_at) AS latest
            FROM reports
        `).get();
        const summary = {
            reportCount: summaryRow.reportCount,
            totalLogs: summaryRow.totalLogs,
            totalErrors: summaryRow.totalErrors,
            totalWarnings: summaryRow.totalWarnings,
            aiAnalyzed: summaryRow.aiAnalyzed,
            earliest: summaryRow.earliest,
            latest: summaryRow.latest
        };

        // byProject：按 log_store_name 聚合
        const byProject = db.prepare(`
            SELECT COALESCE(log_store_name, project_name, '(未命名)') AS key,
                   project_name AS name,
                   COUNT(*) AS reportCount,
                   COALESCE(SUM(log_count), 0) AS logCount,
                   COALESCE(SUM(error_count), 0) AS errorCount
            FROM reports
            GROUP BY log_store_name
            ORDER BY reportCount DESC
        `).all().map(p => ({
            name: p.name || p.key,
            logStore: p.key,
            reportCount: p.reportCount,
            logCount: p.logCount,
            errorCount: p.errorCount,
            errorRate: p.logCount > 0 ? +(p.errorCount / p.logCount * 100).toFixed(1) : 0
        }));

        // timeTrend：按天聚合
        const timeTrend = db.prepare(`
            SELECT substr(created_at, 1, 10) AS date,
                   COUNT(*) AS reportCount,
                   SUM(CASE WHEN error_count > 0 THEN 1 ELSE 0 END) AS errorReportCount
            FROM reports
            WHERE created_at IS NOT NULL
            GROUP BY date
            ORDER BY date
        `).all().map(r => ({ date: r.date, reportCount: r.reportCount, errorReportCount: r.errorReportCount }));

        // errorRanking Top10
        const errorRanking = db.prepare(`
            SELECT id, project_name AS projectName, COALESCE(query, '') AS query,
                   error_count AS errorCount, warning_count AS warnCount,
                   log_count AS total, created_at AS createdAt
            FROM reports
            ORDER BY (error_count + warning_count) DESC
            LIMIT 10
        `).all();

        // analysisMode：preset_template 分组
        const analysisModeRows = db.prepare(`
            SELECT COALESCE(preset_template, 'unknown') AS mode, COUNT(*) AS cnt
            FROM reports GROUP BY preset_template
        `).all();
        const analysisMode = {};
        for (const r of analysisModeRows) analysisMode[r.mode] = r.cnt;

        // levelDistribution：合并各报告 level_distribution JSON
        const levelDistribution = {};
        const levelRows = db.prepare('SELECT level_distribution FROM reports').all();
        for (const row of levelRows) {
            if (!row.level_distribution) continue;
            try {
                for (const [lv, cnt] of Object.entries(JSON.parse(row.level_distribution))) {
                    levelDistribution[lv] = (levelDistribution[lv] || 0) + cnt;
                }
            } catch { /* 跳过损坏 */ }
        }

        // hourlyDistribution：按 __time__ 小时聚合
        const hourly = new Array(24).fill(0);
        const hourRows = db.prepare(`
            SELECT ts FROM report_logs WHERE ts IS NOT NULL
        `).all();
        for (const r of hourRows) {
            const h = new Date(r.ts * 1000).getHours();
            if (!isNaN(h)) hourly[h]++;
        }

        // keywordCloud：只读 content 列，tokenize（不读完整报告）
        const contentRows = db.prepare(`SELECT content FROM report_logs WHERE content IS NOT NULL AND length(content) > 0`).all();
        const texts = contentRows.map(r => r.content);
        const keywordCloud = tokenize(texts, 60);

        res.json({
            success: true,
            data: {
                summary,
                byProject,
                timeTrend,
                errorRanking,
                aiCoverage: {
                    analyzed: summary.aiAnalyzed,
                    total: summary.reportCount,
                    rate: summary.reportCount > 0 ? +(summary.aiAnalyzed / summary.reportCount * 100).toFixed(1) : 0
                },
                analysisMode,
                levelDistribution,
                hourlyDistribution: hourly,
                keywordCloud
            }
        });
    } catch (error) {
        console.error('[dashboard] 聚合失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
