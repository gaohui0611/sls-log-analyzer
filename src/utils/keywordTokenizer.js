/**
 * 关键词分词工具 —— 零原生依赖中英混合分词
 *
 * 设计目标：从日志正文（content）提取高频特征词，供仪表盘关键词云使用。
 * 不引入 nodejieba（原生编译，违背项目零原生依赖原则）。
 *
 * 两类 token：
 *   1. 技术词：连续英文字母开头 + 字母数字下划线（捕获异常类名、SQL 关键词、状态码词）
 *   2. 中文词：连续汉字做 2-gram，过滤停用词
 */

/** 中文停用词表（高频无意义词） */
const CN_STOPWORDS = new Set([
    '的', '了', '是', '在', '有', '和', '与', '及', '或', '为', '也', '都', '这', '那', '一', '个', '中',
    '上', '下', '不', '无', '可', '能', '会', '要', '到', '被', '把', '让', '使', '由', '从', '对', '于',
    '以', '并', '但', '而', '则', '其', '之', '所', '者', '等', '们', '吧', '吗', '呢', '啊', '哦',
    '请求', '响应', '数据', '信息', '内容', '方法', '结果', '状态', '参数', '时间', '系统', '服务',
    '进行', '出现', '发生', '存在', '执行', '调用', '返回', '完成', '开始', '结束', '处理', '操作',
    '如果', '因为', '所以', '可能', '需要', '应该', '已经', '正在', '可以', '通过', '根据', '当前',
    '本次', '所有', '一些', '这种', '这样', '那样', '什么', '怎么', '为什么',
]);

/** 英文停用词表 */
const EN_STOPWORDS = new Set([
    'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'any', 'can', 'her', 'was', 'one', 'our',
    'out', 'has', 'had', 'his', 'how', 'man', 'new', 'now', 'old', 'see', 'two', 'way', 'who', 'did',
    'get', 'let', 'say', 'she', 'too', 'use', 'this', 'that', 'with', 'from', 'they', 'have', 'were',
    'will', 'your', 'them', 'then', 'than', 'into', 'been', 'some', 'what', 'when', 'here', 'there',
    'where', 'which', 'would', 'could', 'should', 'about', 'after', 'before', 'between', 'during',
    'java', 'lang', 'util', 'com', 'org', 'sun', 'nbsp', 'http', 'https', 'www', 'true', 'false',
    'null', 'none', 'type', 'name', 'value', 'class', 'string', 'object', 'boolean', 'void', 'int',
    'long', 'double', 'float', 'char', 'byte', 'short', 'return', 'public', 'private', 'static',
    'final', 'void', 'import', 'package', 'class', 'interface', 'extends', 'implements', 'throws',
    'line', 'file', 'code', 'size', 'time', 'date', 'id', 'key', 'data', 'text', 'desc',
]);

/**
 * 判断是否为中文字符
 * @param {string} ch
 * @returns {boolean}
 */
function isChinese(ch) {
    const code = ch.charCodeAt(0);
    return code >= 0x4e00 && code <= 0x9fff;
}

/**
 * 对单段文本分词，累加到给定的频率 Map
 * @param {string} text
 * @param {Map<string, number>} freq
 */
function tokenizeInto(text, freq) {
    if (!text || typeof text !== 'string') return;

    // 1. 英文技术词：字母开头 + 字母数字下划线，长度 ≥ 3
    const enRegex = /[A-Za-z][A-Za-z0-9_]{2,}/g;
    let m;
    while ((m = enRegex.exec(text)) !== null) {
        const word = m[0];
        // 跳过纯数字后缀噪音词
        if (!EN_STOPWORDS.has(word.toLowerCase())) {
            freq.set(word, (freq.get(word) || 0) + 1);
        }
    }

    // 2. 中文 2-gram：扫描连续汉字段，做相邻二字组合
    let cnBuffer = '';
    for (const ch of text) {
        if (isChinese(ch)) {
            cnBuffer += ch;
        } else {
            if (cnBuffer.length >= 2) flushChinese(cnBuffer, freq);
            cnBuffer = '';
        }
    }
    if (cnBuffer.length >= 2) flushChinese(cnBuffer, freq);
}

/**
 * 把连续汉字段切成 2-gram 并计入频率
 * @param {string} segment
 * @param {Map<string, number>} freq
 */
function flushChinese(segment, freq) {
    for (let i = 0; i < segment.length - 1; i++) {
        const gram = segment.slice(i, i + 2);
        if (CN_STOPWORDS.has(gram)) continue;
        // 跳过包含常见无意义字的组合（如「的」「了」结尾）
        if (CN_STOPWORDS.has(gram[0]) || CN_STOPWORDS.has(gram[1])) continue;
        freq.set(gram, (freq.get(gram) || 0) + 1);
    }
}

/**
 * 对一批文本做分词，返回按频率降序排列的 Top N 词
 * @param {Array<string>} texts - 文本数组
 * @param {number} topN - 返回前 N 个
 * @returns {Array<{name: string, value: number}>}
 */
export function tokenize(texts, topN = 60) {
    const freq = new Map();
    for (const text of texts) {
        tokenizeInto(text, freq);
    }
    return Array.from(freq.entries())
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, topN);
}
