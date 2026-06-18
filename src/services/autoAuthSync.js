/**
 * 自动同步认证信息服务
 * 直接读取用户 Chrome 的 cookies 数据库文件并解密（macOS），
 * 无需启动调试浏览器、无需书签、无需重新登录。
 *
 * 技术要点：
 * - Chrome cookies 存于 SQLite 文件，值用 AES-128-CBC 加密
 * - 密钥通过 macOS Keychain 的 "Chrome Safe Storage" 密码，经 PBKDF2-SHA1 派生
 * - 加密值前 3 字节为版本前缀 "v10"（旧）或 "v20"（新，AES-GCM）
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { readFile, unlink, copyFile } from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

import { readConfig, saveConfig } from '../utils/config.js';

/** Chrome 用户数据根目录（macOS） */
const CHROME_USER_DATA = path.join(
    process.env.HOME,
    'Library/Application Support/Google/Chrome'
);

/**
 * 候选的 Cookies 数据库路径（Default + 多 Profile）
 * @returns {string[]}
 */
function candidateCookiePaths() {
    const dirs = [path.join(CHROME_USER_DATA, 'Default')];
    try {
        const entries = existsSync(CHROME_USER_DATA)
            ? execSync(`ls -d "${CHROME_USER_DATA}/"Profile* 2>/dev/null`).toString().trim().split('\n').filter(Boolean)
            : [];
        dirs.push(...entries);
    } catch {
        // 无 Profile 目录，忽略
    }

    const paths = [];
    for (const dir of dirs) {
        // 新版 Chrome 在 Network 子目录，旧版直接在 profile 根目录
        paths.push(path.join(dir, 'Network', 'Cookies'));
        paths.push(path.join(dir, 'Cookies'));
    }
    return paths.filter(existsSync);
}

/**
 * 从 macOS Keychain 取 Chrome Safe Storage 密码
 * @returns {string}
 */
function getKeychainPassword() {
    try {
        return execSync(
            'security find-generic-password -w -s "Chrome Safe Storage" -a "Chrome"',
            { stdio: ['ignore', 'pipe', 'pipe'] }
        ).toString().trim();
    } catch {
        throw new Error(
            '无法从 macOS 钥匙串读取 Chrome 加密密钥。\n' +
            '请点「一键同步」时在弹出的系统对话框里选择「始终允许」访问钥匙串。'
        );
    }
}

/**
 * 派生 AES 密钥
 * @param {string} password
 * @returns {Buffer}
 */
function deriveKey(password) {
    return crypto.pbkdf2Sync(password, 'saltysalt', 1003, 16, 'sha1');
}

/**
 * 解密单个 cookie 的 encrypted_value
 * @param {Buffer} enc
 * @param {Buffer} key
 * @returns {string|null}
 */
function decryptCookieValue(enc, key) {
    if (!enc || enc.length < 4) return null;

    const prefix = enc.slice(0, 3).toString('latin1');

    try {
        if (prefix === 'v10') {
            // Chrome 新版 v10 格式：3 字节 "v10" + 32 字节头部 + AES-128-CBC 密文
            // CBC 链式解密：必须对 enc[3:] 整段解密，再丢弃前 32 字节头部
            // （若先切掉头部再解密，真实密文首块会错用 IV，解出乱码）
            const decipher = crypto.createDecipheriv('aes-128-cbc', key, Buffer.alloc(16, 0x20));
            const dec = Buffer.concat([decipher.update(enc.slice(3)), decipher.final()]);
            return dec.slice(32).toString('utf8');
        } else if (prefix === 'v20') {
            // AES-128-GCM，前 12 字节 nonce
            const nonce = enc.slice(3, 15);
            const ciphertext = enc.slice(15, -16);
            const tag = enc.slice(-16);
            const decipher = crypto.createDecipheriv('aes-128-gcm', key, nonce);
            decipher.setAuthTag(tag);
            const dec = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
            return dec.toString('utf8');
        }
        // 无前缀：旧版明文（少见）
        return enc.toString('utf8');
    } catch {
        return null;
    }
}

/**
 * 用 sqlite3 CLI 查询某 Cookies 数据库中的阿里云 cookies
 * @param {string} dbPath
 * @returns {Promise<Array<{name: string, value: string, domain: string, path: string, secure: boolean, httponly: boolean}>>}
 */
async function queryAliyunCookies(dbPath) {
    // Chrome 运行时数据库被锁，复制一份读取
    const tmpDir = path.join(os.tmpdir(), 'sls-analyzer-cookies-' + Date.now());
    mkdirSync(tmpDir, { recursive: true });
    const tmpDb = path.join(tmpDir, 'Cookies');
    await copyFile(dbPath, tmpDb);

    let raw = '';
    try {
        // 用 sqlite3 CLI 查询：name | host_key | hex(encrypted_value) | path | is_secure | is_httponly
        // 以 \t 分隔，每行一条
        const sep = String.fromCharCode(31); // 单元分隔符，避免与 cookie 值里的字符冲突
        const sql = `SELECT name, host_key, hex(encrypted_value), path, is_secure, is_httponly FROM cookies WHERE host_key LIKE '%aliyun.com' OR host_key LIKE '%aliyuncs.com';`;
        raw = execSync(
            `sqlite3 -separator "${sep}" "${tmpDb}" "${sql.replace(/"/g, '\\"')}"`,
            { maxBuffer: 50 * 1024 * 1024 }
        ).toString();
    } finally {
        await unlink(tmpDb).catch(() => {});
    }

    const key = deriveKey(getKeychainPassword());
    const cookies = [];
    for (const line of raw.split('\n')) {
        if (!line.trim()) continue;
        const [name, domain, encHex, cookiePath, secure, httponly] = line.split(String.fromCharCode(31));
        if (!name || !domain) continue;
        const value = decryptCookieValue(Buffer.from(encHex || '', 'hex'), key);
        if (!value) continue;
        cookies.push({
            name,
            value,
            domain,
            path: cookiePath || '/',
            secure: secure === '1',
            httponly: httponly === '1',
        });
    }
    return cookies;
}

/**
 * 从用户 Chrome 提取认证信息
 * @param {string} region
 * @returns {Promise<{cookies: Object, region: string}>}
 */
async function extractAuthInfo(region = 'cn-beijing') {
    const paths = candidateCookiePaths();
    if (paths.length === 0) {
        throw new Error(
            '未找到 Chrome 的 Cookies 数据库。\n' +
            '请确认 Chrome 已安装且登录过阿里云 SLS 控制台 (sls.console.aliyun.com)。'
        );
    }

    let allCookies = [];
    let usedPath = '';
    for (const p of paths) {
        try {
            const found = await queryAliyunCookies(p);
            if (found.length > allCookies.length) {
                allCookies = found;
                usedPath = p;
            }
        } catch (err) {
            console.log(`读取 ${p} 失败: ${err.message}`);
        }
    }

    if (allCookies.length === 0) {
        throw new Error(
            '未在 Chrome 中找到阿里云 cookies。\n' +
            '请先用 Chrome 登录阿里云 SLS 控制台 (sls.console.aliyun.com)，再点「一键同步」。'
        );
    }

    console.log(`✓ 从 ${usedPath} 提取到 ${allCookies.length} 个阿里云 cookies`);

    // 合并同名 cookie（保留最后值）
    const cookieMap = {};
    for (const c of allCookies) {
        cookieMap[c.name] = c.value;
    }

    return { cookies: cookieMap, region };
}

/**
 * 用 puppeteer 注入 cookies，自动访问 SLS 页面抓取运行时 csrfToken / b3
 * （这两个值不在磁盘，只能靠浏览器跑一次页面拦截请求获取）
 * @param {Object} cookieMap
 * @returns {Promise<{csrfToken: string|null, b3: string|null}>}
 */
async function fetchRuntimeTokens(cookieMap) {
    const puppeteer = await import('puppeteer').then(m => m.default || m);

    const cookies = Object.entries(cookieMap).map(([name, value]) => ({
        name,
        value: String(value),
        domain: '.aliyun.com',
        path: '/',
    }));

    console.log('启动无头浏览器抓取 CSRF Token...');
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    let csrfToken = null;
    let b3 = null;

    try {
        const page = await browser.newPage();
        await page.setUserAgent(
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
            '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        );
        await page.setCookie(...cookies);

        page.on('request', (req) => {
            const h = req.headers();
            if (h['x-csrf-token'] && !csrfToken) {
                csrfToken = h['x-csrf-token'];
                console.log('✓ 抓到 CSRF Token:', csrfToken);
            }
            if (h['b3'] && !b3) {
                b3 = h['b3'];
                console.log('✓ 抓到 b3:', b3);
            }
        });

        await page.goto('https://sls.console.aliyun.com', {
            waitUntil: 'networkidle2',
            timeout: 60000,
        }).catch(e => console.log('导航等待（可忽略）:', e.message));

        // 额外等待让页面发出带 token 的请求
        await new Promise(r => setTimeout(r, 8000));
    } finally {
        await browser.close();
    }

    if (!csrfToken) {
        console.log('⚠️ 未抓到 CSRF Token（cookies 可能已失效，或页面未发出带 token 的请求）');
    }

    return { csrfToken, b3 };
}

/**
 * 一键同步认证信息
 */
export async function autoSyncAuth(region = 'cn-beijing') {
    try {
        console.log('');
        console.log('========================================');
        console.log('开始同步认证信息（读取 Chrome cookies）');
        console.log('========================================');
        console.log('');

        const authData = await extractAuthInfo(region);

        // 自动抓取运行时 CSRF Token / b3（注入 cookies 后访问 SLS 页面拦截）
        const tokens = await fetchRuntimeTokens(authData.cookies);

        const config = await readConfig();

        config.slsConfig = {
            ...config.slsConfig,
            cookies: { ...authData.cookies, timestamp: Date.now() },
            csrfToken: tokens.csrfToken || config.slsConfig?.csrfToken,
            b3: tokens.b3 || config.slsConfig?.b3,
            region: authData.region
        };

        await saveConfig(config);

        const cookieCount = Object.keys(authData.cookies).length;
        console.log(`✓ 认证信息已保存（${cookieCount} 个 cookies，CSRF ${tokens.csrfToken ? '已抓取' : '缺失'}）`);
        console.log('');

        return {
            success: true,
            message: '认证信息同步成功',
            cookies: cookieCount,
            hasCsrf: !!tokens.csrfToken,
            hasB3: !!tokens.b3
        };

    } catch (error) {
        console.error('');
        console.error('========================================');
        console.error('同步失败:', error.message);
        console.error('========================================');
        console.error('');
        throw new Error(error.message);
    }
}
