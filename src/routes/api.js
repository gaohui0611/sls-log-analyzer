/**
 * API 路由聚合器
 * 聚合所有子路由到 /api 前缀下
 */

import express from 'express';

import projectsRouter from './projects.js';
import analysisRouter from './analysis.js';
import reportsRouter from './reports.js';
import authRouter from './auth.js';
import aiRouter from './ai.js';

const router = express.Router();

// 挂载所有子路由
router.use(projectsRouter);
router.use(analysisRouter);
router.use(reportsRouter);
router.use(authRouter);
router.use(aiRouter);

export default router;
