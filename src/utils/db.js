/**
 * SQLite 数据访问层 — 报告存储
 * 单文件 app.db（git-ignore）。提供 db 单例、建表、JSON→DB 迁移、报告读写 helper。
 */

import Database from 'better-sqlite3';
import fs from 'fs/promises';
import path from 'path';

const DB_FILE = path.join(process.cwd(), 'app.db');
const REPORTS_DIR = path.join(process.cwd(), 'reports');

/** @type {Database.Database} */
let db = null;

/**
 * 建表（幂等）
 */
function createTables() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS reports (
            id                TEXT PRIMARY KEY,
            created_at        TEXT,
            project_name      TEXT,
            log_store_name    TEXT,
            query             TEXT,
            time_range        TEXT,
            time_from         TEXT,
            time_to           TEXT,
            size              INTEGER,
            max_pages         INTEGER,
            log_count         INTEGER,
            returned_count    INTEGER,
            preset_template   TEXT,
            has_ai_analysis   INTEGER,
            error_count       INTEGER,
            warning_count     INTEGER,
            level_distribution TEXT,
            data_json         TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_reports_created   ON reports(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_reports_logstore  ON reports(log_store_name);
        CREATE INDEX IF NOT EXISTS idx_reports_preset    ON reports(preset_template);

        CREATE TABLE IF NOT EXISTS report_logs (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            report_id  TEXT REFERENCES reports(id) ON DELETE CASCADE,
            ts         INTEGER,
            level      TEXT,
            content    TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_logs_report ON report_logs(report_id);
        CREATE INDEX IF NOT EXISTS idx_logs_ts     ON report_logs(ts);
    `);
    // 开启外键级联（SQLite 默认关）
    db.pragma('foreign_keys = ON');
}

/**
 * 从单条报告 JSON 提取预聚合字段
 * @param {Object} data 报告完整对象
 * @returns {{errorCount:number, warningCount:number, levelDist:string, hasAi:number}}
 */
function deriveAggregates(data) {
    const stats = data.stats || {};
    const errCount = (stats.errors || []).length;
    const warnCount = (stats.warnings || []).length;
    const hasAi = data.aiAnalysis && !data.aiAnalysis.error ? 1 : 0;
    return {
        errCount,
        warnCount,
        hasAi,
        levelDist: JSON.stringify(stats.byLevel || {})
    };
}

/**
 * 写入一条报告（事务：reports + report_logs 批量）
 * 幂等：已存在的 id 用 INSERT OR REPLACE 覆盖
 * @param {Object} data 完整报告对象
 */
export function saveReport(data) {
    const agg = deriveAggregates(data);
    const insertReport = db.prepare(`
        INSERT OR REPLACE INTO reports (
            id, created_at, project_name, log_store_name, query, time_range,
            time_from, time_to, size, max_pages, log_count, returned_count,
            preset_template, has_ai_analysis, error_count, warning_count,
            level_distribution, data_json
        ) VALUES (
            @id, @created_at, @project_name, @log_store_name, @query, @time_range,
            @time_from, @time_to, @size, @max_pages, @log_count, @returned_count,
            @preset_template, @has_ai_analysis, @error_count, @warning_count,
            @level_distribution, @data_json
        )
    `);
    const insertLog = db.prepare(`
        INSERT INTO report_logs (report_id, ts, level, content)
        VALUES (@report_id, @ts, @level, @content)
    `);

    const tx = db.transaction((report) => {
        insertReport.run({
            id: report.id,
            created_at: report.createdAt,
            project_name: report.projectName,
            log_store_name: report.logStoreName,
            query: report.query,
            time_range: report.timeRange,
            time_from: report.timeFrom,
            time_to: report.timeTo,
            size: report.size,
            max_pages: report.maxPages,
            log_count: report.logCount,
            returned_count: report.returnedCount,
            preset_template: report.presetTemplate || 'unknown',
            has_ai_analysis: agg.hasAi,
            error_count: agg.errCount,
            warning_count: agg.warnCount,
            level_distribution: agg.levelDist,
            data_json: JSON.stringify(report)
        });
        // 批量插日志（清旧后重插，覆盖场景）
        db.prepare('DELETE FROM report_logs WHERE report_id = ?').run(report.id);
        const logs = report.logs || [];
        for (const log of logs) {
            insertLog.run({
                report_id: report.id,
                ts: log.__time__ || null,
                level: (log.level || log.LEVEL || 'INFO').toUpperCase(),
                content: log.content || log.message || log.msg || ''
            });
        }
    });
    tx(data);
}

/**
 * 从 reports/*.json 批量迁移到 DB（仅迁 DB 中不存在的报告，幂等）
 * @returns {Promise<{migrated:number, skipped:number, failed:number}>}
 */
async function migrateReportsFromFiles() {
    let files = [];
    try {
        files = await fs.readdir(REPORTS_DIR);
    } catch {
        return { migrated: 0, skipped: 0, failed: 0 };
    }
    const jsonFiles = files.filter(f => f.endsWith('.json'));
    if (jsonFiles.length === 0) return { migrated: 0, skipped: 0, failed: 0 };

    let migrated = 0, skipped = 0, failed = 0;
    for (const file of jsonFiles) {
        const id = file.replace('.json', '');
        // 幂等：DB 已有则跳过
        const exists = db.prepare('SELECT 1 FROM reports WHERE id = ?').get(id);
        if (exists) { skipped++; continue; }
        try {
            const content = await fs.readFile(path.join(REPORTS_DIR, file), 'utf-8');
            const data = JSON.parse(content);
            // 老报告补 id/createdAt（落库字段缺失兜底）
            if (!data.id) data.id = id;
            if (!data.createdAt) {
                const stat = await fs.stat(path.join(REPORTS_DIR, file));
                data.createdAt = new Date(stat.birthtime).toISOString();
            }
            if (!data.presetTemplate) data.presetTemplate = 'unknown';
            saveReport(data);
            migrated++;
        } catch (e) {
            console.error(`[db] 迁移失败 ${file}:`, e.message);
            failed++;
        }
    }
    return { migrated, skipped, failed };
}

/**
 * 初始化 DB：建表 + 按需迁移历史 JSON
 */
export async function initDb() {
    db = new Database(DB_FILE);
    db.pragma('journal_mode = WAL'); // 并发读 + 写更快
    createTables();

    const countRow = db.prepare('SELECT COUNT(*) AS n FROM reports').get();
    if (countRow.n === 0) {
        const result = await migrateReportsFromFiles();
        if (result.migrated > 0 || result.failed > 0) {
            console.log(`[db] JSON 迁移完成: 新增 ${result.migrated}, 跳过 ${result.skipped}, 失败 ${result.failed}`);
        }
    }
    return db;
}

/** 获取 db 单例 */
export function getDb() {
    if (!db) throw new Error('DB 未初始化，请先调用 initDb()');
    return db;
}
