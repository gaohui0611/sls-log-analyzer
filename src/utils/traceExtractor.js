/**
 * Trace Context 提取工具
 * 从链路日志中提取 SQL 语句、错误信息、错误前后日志
 */

/**
 * 从链路日志中提取关键上下文
 * @param {Array} logs - 日志数组
 * @returns {Object|null} 提取的上下文
 */
export function extractTraceContext(logs) {
    if (!logs || logs.length === 0) return null;

    // 按时间排序
    const sorted = [...logs].sort((a, b) => (a.__time__ || 0) - (b.__time__ || 0));

    const sqlStatements = [];
    const errorPoints = [];
    const warnPoints = [];
    const errorContexts = [];

    for (let i = 0; i < sorted.length; i++) {
        const log = sorted[i];
        const msg = log.content || log.message || log.msg || '';
        const time = log.__time__ ? new Date(log.__time__ * 1000).toISOString() : null;

        // 提取 SQL 语句
        const sqlMatch = msg.match(/SQL:\s*(select|insert|update|delete|SELECT|INSERT|UPDATE|DELETE)\s.+/i);
        if (sqlMatch) {
            let sql = sqlMatch[0];
            const sqlStart = msg.indexOf('SQL:');
            if (sqlStart >= 0) {
                sql = msg.substring(sqlStart + 4);
                if (sql.length > 500) sql = sql.substring(0, 500) + '...';
            }
            sqlStatements.push({
                time,
                sql: sql.trim(),
                source: msg.match(/(\w+\.\w+)\s+:\d+/)?.[1] || '',
                fullLog: msg.substring(0, 200)
            });
        }

        // 提取 ERROR 日志及其上下文（前后各1条）
        if (msg.includes('ERROR') || msg.includes('Exception')) {
            const contextBefore = i > 0 ? sorted[i - 1] : null;
            const contextAfter = i < sorted.length - 1 ? sorted[i + 1] : null;

            errorPoints.push({
                time,
                message: msg.substring(0, 500),
                errorType: msg.includes('Exception') ? 'Exception' : 'ERROR'
            });

            errorContexts.push({
                error: msg.substring(0, 400),
                before: contextBefore ? (contextBefore.content || contextBefore.message || '').substring(0, 300) : null,
                after: contextAfter ? (contextAfter.content || contextAfter.message || '').substring(0, 300) : null
            });
        }

        // 提取 WARN
        if (msg.match(/\bWARN\b/) && !msg.includes('ERROR')) {
            warnPoints.push({
                time,
                message: msg.substring(0, 400)
            });
        }
    }

    // 如果有 ERROR，构建问题摘要
    const summary = errorPoints.length > 0 ? {
        hasError: true,
        errorCount: errorPoints.length,
        rootError: errorPoints[0],
        rootContext: errorContexts[0],
        relatedSQL: sqlStatements.length > 0 ? sqlStatements : null
    } : {
        hasError: false,
        relatedSQL: sqlStatements.length > 0 ? sqlStatements : null
    };

    return {
        sqlStatements,
        errorPoints,
        warnPoints,
        errorContexts,
        summary
    };
}
