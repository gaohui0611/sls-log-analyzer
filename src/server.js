/**
 * SLS 日志分析系统 - Web 服务器
 */

import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// 确保必要的目录存在
const REPORTS_DIR = path.join(process.cwd(), 'reports');
await fs.mkdir(REPORTS_DIR, { recursive: true });

// 中间件
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cors());
app.use(express.static(path.join(__dirname, '../public')));

// 请求日志中间件
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.path}`);
    next();
});

// API 路由
import apiRouter from './routes/api.js';
app.use('/api', apiRouter);

// 首页路由
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// 404 处理
app.use((req, res) => {
    res.status(404).json({ success: false, error: '接口不存在' });
});

// 全局错误处理中间件
app.use((err, req, res, next) => {
    console.error('服务器错误:', err);
    res.status(500).json({
        success: false,
        error: err.message || '服务器内部错误'
    });
});

// 启动服务器
const server = app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║        🤖 SLS 日志智能分析系统                                  ║
║                                                               ║
║        服务已启动: http://localhost:${PORT}                       ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
  `);
});

// 处理端口占用错误
server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
        console.error(`
❌ 错误: 端口 ${PORT} 已被占用

解决方案:
1. 关闭占用端口的程序
2. 使用命令查找并关闭: lsof -ti:${PORT} | xargs kill -9
3. 或者修改 .env 文件中的 PORT 配置
        `);
        process.exit(1);
    } else {
        console.error('服务器启动失败:', error);
        process.exit(1);
    }
});

export default app;
