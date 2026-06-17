/**
 * 报告路由 - /api/reports
 */

import express from 'express';
import fs from 'fs/promises';
import path from 'path';

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

export default router;
