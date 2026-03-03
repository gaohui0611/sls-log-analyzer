/**
 * 使用 Puppeteer 在浏览器中执行 SLS 日志查询
 * 通过在页面上触发查询操作并从 DOM 读取结果
 */

import puppeteer from 'puppeteer';

export async function searchLogsWithPuppeteer(params, slsConfig) {
    const {
        projectName,
        logStoreName,
        query = '',
        from,
        to,
        size = 100
    } = params;

    let browser;

    try {
        console.log('启动浏览器进行日志查询...');

        browser = await puppeteer.launch({
            headless: true,
            defaultViewport: { width: 1280, height: 800 },
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox'
            ]
        });

        const page = await browser.newPage();

        // 设置 cookies（过滤掉过长的值）
        const cookies = Object.entries(slsConfig.cookies || {})
            .filter(([name, value]) => {
                return value.length < 4000 &&
                       !name.includes('tfstk') &&
                       !name.includes('isg');
            })
            .map(([name, value]) => ({
                name,
                value,
                domain: '.aliyun.com',
                path: '/'
            }));

        await page.setCookie(...cookies);
        console.log('- Cookies 已设置');

        // 导航到日志查询页面
        const logSearchUrl = `https://sls.console.aliyun.com/lognext/project/${projectName}/logsearch/${logStoreName}?slsRegion=${slsConfig.region || 'cn-beijing'}&isDoc=true`;

        console.log('- 导航到日志查询页面...');
        await page.goto(logSearchUrl, {
            waitUntil: 'networkidle2',
            timeout: 30000
        });

        // 等待页面加载完成
        await new Promise(resolve => setTimeout(resolve, 5000));

        // 在页面中执行查询并从 DOM 获取结果
        console.log('- 执行日志查询...');

        const result = await page.evaluate(async (fromTime, toTime, queryStr, logSize) => {
            // 等待页面完全加载
            await new Promise(resolve => setTimeout(resolve, 3000));

            // 先打印页面信息
            console.log('页面 URL:', window.location.href);
            console.log('页面标题:', document.title);

            // 查找页面中的所有元素
            const allElements = document.querySelectorAll('*');
            const logElements = [];
            allElements.forEach(el => {
                const className = el.className ? String(el.className) : '';
                const id = el.id || '';
                if (className.includes('log') || className.includes('Log') || id.includes('log') || id.includes('Log')) {
                    logElements.push({
                        tag: el.tagName,
                        className: className,
                        id: id,
                        textContent: (el.textContent || '').substring(0, 100)
                    });
                }
            });

            console.log('找到 log 相关的元素数量:', logElements.length);

            // 打印前10个元素的信息
            logElements.slice(0, 10).forEach((el, i) => {
                console.log(i + 1, el.tag, el.className, el.id, el.textContent?.substring(0, 50));
            });

            // 尝试获取表格中的数据
            const tables = document.querySelectorAll('table');
            console.log('表格数量:', tables.length);

            // 尝试获取日志
            const tryGetLogsFromDOM = () => {
                // 检查是否有日志表格或列表
                const logItems = document.querySelectorAll('[class*="log"], [class*="Log"], [data-log], tr.log-row, .log-item');
                if (logItems.length > 0) {
                    const logs = [];
                    logItems.forEach((item, index) => {
                        if (index >= logSize) return;
                        const text = item.textContent || item.innerText;
                        if (text && text.trim()) {
                            logs.push({
                                index: index,
                                content: text.trim().substring(0, 10000)
                            });
                        }
                    });
                    return { success: true, logs, method: 'DOM' };
                }

                // 检查是否有预加载的数据
                if (window.__INITIAL_STATE__ || window.__INITIAL_DATA__) {
                    const data = window.__INITIAL_STATE__ || window.__INITIAL_DATA__;
                    if (data.logs || data.data?.logs) {
                        return { success: true, logs: data.logs || data.data.logs, method: 'window' };
                    }
                }

                return { success: false, error: '没有找到日志数据', elementsFound: logElements.length, tablesFound: tables.length };
            };

            return tryGetLogsFromDOM();
        }, from, to, query, size);

        await browser.close();

        if (result.success) {
            console.log('- 查询成功，方法:', result.method);
            return {
                success: true,
                count: result.logs.length || 0,
                logs: result.logs || [],
                raw: result
            };
        } else {
            console.error('- 查询失败:', result.error);
            return {
                success: false,
                count: 0,
                logs: [],
                error: result.error
            };
        }

    } catch (error) {
        if (browser) {
            await browser.close();
        }
        throw error;
    }
}
