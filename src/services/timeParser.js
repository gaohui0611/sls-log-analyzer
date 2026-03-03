/**
 * 时间范围解析器
 */

/**
 * 解析时间范围
 */
export function parseTimeRange(range) {
    const now = new Date();
    let from, to, label;

    switch (range) {
        case 'today':
            from = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
            to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
            label = '今天';
            break;

        case 'yesterday':
            const yesterday = new Date(now);
            yesterday.setDate(yesterday.getDate() - 1);
            from = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 0, 0, 0, 0);
            to = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59, 999);
            label = '昨天';
            break;

        case 'thisWeek':
            const dayOfWeek = now.getDay() || 7;
            const weekStart = new Date(now);
            weekStart.setDate(now.getDate() - dayOfWeek + 1);
            from = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate(), 0, 0, 0, 0);
            to = new Date(now);
            label = '本周';
            break;

        case 'lastWeek':
            const lastWeekEnd = new Date(now);
            const currentDay = lastWeekEnd.getDay() || 7;
            lastWeekEnd.setDate(lastWeekEnd.getDate() - currentDay);
            const lastWeekStart = new Date(lastWeekEnd);
            lastWeekStart.setDate(lastWeekStart.getDate() - 6);
            from = new Date(lastWeekStart.getFullYear(), lastWeekStart.getMonth(), lastWeekStart.getDate(), 0, 0, 0, 0);
            to = new Date(lastWeekEnd.getFullYear(), lastWeekEnd.getMonth(), lastWeekEnd.getDate(), 23, 59, 59, 999);
            label = '上周';
            break;

        case 'thisMonth':
            from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
            to = new Date(now);
            label = '本月';
            break;

        case 'lastMonth':
            from = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
            to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
            label = '上月';
            break;

        case 'last7days':
            from = new Date(now);
            from.setDate(from.getDate() - 7);
            from.setHours(0, 0, 0, 0);
            to = new Date(now);
            label = '最近7天';
            break;

        case 'last30days':
            from = new Date(now);
            from.setDate(from.getDate() - 30);
            from.setHours(0, 0, 0, 0);
            to = new Date(now);
            label = '最近30天';
            break;

        default:
            return parseTimeRange('thisWeek');
    }

    return {
        from: Math.floor(from.getTime() / 1000),
        to: Math.floor(to.getTime() / 1000),
        label,
        fromFormatted: from.toLocaleString('zh-CN'),
        toFormatted: to.toLocaleString('zh-CN')
    };
}
