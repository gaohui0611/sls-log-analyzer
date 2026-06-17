/**
 * 前端应用逻辑
 */

// API 基础路径
const API_BASE = '/api';

// 全局状态
let state = {
    projects: {},
    config: {},
    authStatus: null,
    reports: [],         // 所有报告
    reportsPage: 1,      // 当前页码
    reportsPageSize: 10  // 每页条数
};

// 工具函数
function showLoading(elementId) {
    document.getElementById(elementId).classList.add('active');
}

function hideLoading(elementId) {
    document.getElementById(elementId).classList.remove('active');
}

/**
 * 显示Toast通知（弹出框消息）
 * @param {string} message - 消息内容
 * @param {string} type - 类型: success, error, info, warning
 * @param {number} duration - 显示时长（毫秒），默认4000ms
 */
function showToast(message, type = 'info', duration = 4000) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    // 图标映射
    const icons = {
        success: '✅',
        error: '❌',
        info: 'ℹ️',
        warning: '⚠️'
    };

    // 标题映射
    const titles = {
        success: '成功',
        error: '错误',
        info: '提示',
        warning: '警告'
    };

    // 创建Toast元素
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <div class="toast-icon">${icons[type] || 'ℹ️'}</div>
        <div class="toast-content">
            <div class="toast-title">${titles[type] || '提示'}</div>
            <div class="toast-message">${escapeHtml(message)}</div>
        </div>
        <button class="toast-close" onclick="this.parentElement.remove()">×</button>
    `;

    // 添加到容器
    container.appendChild(toast);

    // 自动移除
    setTimeout(() => {
        toast.classList.add('removing');
        setTimeout(() => {
            if (toast.parentElement) {
                toast.remove();
            }
        }, 300);
    }, duration);
}

// 保留旧的showAlert函数以兼容性（但内部使用showToast）
function showAlert(elementId, message, type = 'info') {
    showToast(message, type);
}

// API 调用
async function apiRequest(url, options = {}) {
    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
            ...(options.headers || {})
        }
    };

    // 合并选项，确保 headers 正确处理
    const mergedOptions = {
        ...options,
        headers: defaultOptions.headers
    };

    // 如果有 body 且是对象，转换为 JSON 字符串
    if (mergedOptions.body && typeof mergedOptions.body === 'object') {
        mergedOptions.body = JSON.stringify(mergedOptions.body);
    }

    const response = await fetch(`${API_BASE}${url}`, mergedOptions);
    const data = await response.json();
    if (!response.ok || !data.success) {
        throw new Error(data.error || '请求失败');
    }
    return data;
}

// 标签页切换
document.querySelectorAll('.nav-item').forEach(navItem => {
    navItem.addEventListener('click', () => {
        const tabName = navItem.dataset.tab;

        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

        navItem.classList.add('active');
        document.getElementById(`${tabName}-tab`).classList.add('active');

        // 加载对应标签页的数据
        if (tabName === 'projects') loadProjects();
        if (tabName === 'reports') loadReports();
        if (tabName === 'settings') loadAuthStatus();
    });
});

// ========== 项目管理 ==========

async function loadProjects() {
    try {
        const response = await apiRequest('/config');
        state.projects = response.data.projects || {};
        renderProjects();
        updateProjectSelect();
    } catch (error) {
        console.error('加载项目失败:', error);
    }
}

function renderProjects() {
    const container = document.getElementById('projectList');
    if (!container) return;

    if (Object.keys(state.projects).length === 0) {
        container.innerHTML = `
      <div class="empty-state">
        <div class="icon">📁</div>
        <p>还没有配置任何项目</p>
      </div>
    `;
        return;
    }

    container.innerHTML = Object.entries(state.projects).map(([id, project]) => `
    <div class="project-item" data-id="${id}">
      <div class="info">
        <h4>${project.name}</h4>
        <p>环境ID: ${project.projectName} / 项目所属: ${project.logStoreName}</p>
      </div>
      <div class="actions">
        <button class="btn btn-secondary btn-sm" onclick="editProject('${id}')">
          ✏️ 编辑
        </button>
        <button class="btn btn-danger btn-sm" onclick="deleteProject('${id}')">
          🗑️ 删除
        </button>
      </div>
    </div>
  `).join('');
}

function updateProjectSelect() {
    const select = document.getElementById('projectSelect');
    select.innerHTML = '<option value="">-- 请选择项目 --</option>';

    Object.entries(state.projects).forEach(([id, project]) => {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = project.name;
        select.appendChild(option);
    });
}

document.getElementById('addProjectBtn').addEventListener('click', async () => {
    const name = document.getElementById('newProjectName').value.trim();
    const projectName = document.getElementById('newSlsProject').value.trim();
    const logStoreName = document.getElementById('newLogStore').value.trim();

    if (!name || !projectName || !logStoreName) {
        showAlert('projects-tab', '请填写所有字段', 'error');
        return;
    }

    const addBtn = document.getElementById('addProjectBtn');
    const editId = addBtn.dataset.editId;

    if (editId) {
        // 更新现有项目
        state.projects[editId] = { name, projectName, logStoreName };
    } else {
        // 添加新项目
        const id = Date.now().toString();
        state.projects[id] = { name, projectName, logStoreName };
    }

    try {
        await apiRequest('/config', {
            method: 'POST',
            body: JSON.stringify({ projects: state.projects })
        });

        // 重置表单和按钮
        document.getElementById('newProjectName').value = '';
        document.getElementById('newSlsProject').value = '';
        document.getElementById('newLogStore').value = '';
        addBtn.textContent = '➕ 添加项目';
        delete addBtn.dataset.editId;

        loadProjects();
        showAlert('projects-tab', editId ? '✅ 项目更新成功' : '✅ 项目添加成功', 'success');
    } catch (error) {
        showAlert('projects-tab', `❌ ${editId ? '更新' : '添加'}失败: ${error.message}`, 'error');
    }
});

// 取消编辑
document.getElementById('cancelEditBtn')?.addEventListener('click', () => {
    const addBtn = document.getElementById('addProjectBtn');
    const cancelBtn = document.getElementById('cancelEditBtn');

    // 清空表单
    document.getElementById('newProjectName').value = '';
    document.getElementById('newSlsProject').value = '';
    document.getElementById('newLogStore').value = '';

    // 重置按钮状态
    addBtn.textContent = '➕ 添加项目';
    delete addBtn.dataset.editId;
    cancelBtn.style.display = 'none';

    showAlert('projects-tab', '已取消编辑', 'success');
});

// 编辑项目
window.editProject = async function(id) {
    const project = state.projects[id];
    if (!project) return;

    // 填充表单
    document.getElementById('newProjectName').value = project.name;
    document.getElementById('newSlsProject').value = project.projectName;
    document.getElementById('newLogStore').value = project.logStoreName;

    // 更改添加按钮为更新按钮
    const addBtn = document.getElementById('addProjectBtn');
    const cancelBtn = document.getElementById('cancelEditBtn');
    addBtn.textContent = '💾 更新项目';
    addBtn.dataset.editId = id;
    cancelBtn.style.display = 'inline-flex';

    // 显示提示
    showAlert('projects-tab', '✏️ 编辑模式: 修改后点击"更新项目"保存', 'success');

    // 滚动到表单
    document.querySelector('.form-group')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

window.deleteProject = async function(id) {
    if (!confirm('确定要删除这个项目吗?')) return;

    delete state.projects[id];

    try {
        await apiRequest('/config', {
            method: 'POST',
            body: JSON.stringify({ projects: state.projects })
        });
        loadProjects();
        showAlert('projects-tab', '✅ 项目已删除', 'success');
    } catch (error) {
        showAlert('projects-tab', `❌ 删除失败: ${error.message}`, 'error');
    }
}

// ========== 日志分析 ==========

/**
 * 智能处理SLS查询字符串
 * - 含 AND/OR 的复合查询不干预（用户已构建合理语法）
 * - 简单关键词含特殊字符时自动加引号
 * - 已被引号包裹的不重复处理
 */
function sanitizeSlsQuery(query) {
    if (!query) return query;

    // 1. 中文引号 → 英文引号（全角""→半角""，全角''→半角''）
    let q = query.replace(/[\u201c\u201d]/g, '"').replace(/[\u2018\u2019]/g, '"');

    // 2. 去除多余空格（AND/OR 两边只保留一个空格）
    q = q.replace(/\s+(AND|OR)\s+/gi, ' $1 ').trim();

    // 3. 含 AND/OR 的是复合查询，不再整体包裹引号
    if (/\bAND\b|\bOR\b/i.test(q)) return q;

    // 4. 已经用引号包裹，直接返回
    if ((q.startsWith('"') && q.endsWith('"')) ||
        (q.startsWith("'") && q.endsWith("'"))) {
        return q;
    }

    // 5. 含 SLS 特殊字符时自动加引号包裹
    const specialChars = /[:.()\[\]{}*?+|\\\/]/;
    if (specialChars.test(q)) {
        return `"${q}"`;
    }

    return q;
}

document.getElementById('analyzeBtn').addEventListener('click', async () => {
    const projectId = document.getElementById('projectSelect').value;
    const timeRange = document.getElementById('timeRangeSelect').value;
    let query = document.getElementById('queryInput').value.trim();
    const size = parseInt(document.getElementById('sizeSelect').value);
    const maxPages = parseInt(document.getElementById('maxPagesSelect').value);
    const customPrompt = document.getElementById('customPromptInput')?.value.trim() || '';

    if (!projectId) {
        showToast('请先选择一个项目', 'error');
        return;
    }

    // 智能处理查询字符串
    const originalQuery = query;
    query = sanitizeSlsQuery(query);
    if (query !== originalQuery && query) {
        showToast(`查询已优化为: ${query}`, 'info', 3000);
    }

    showLoading('analyzeLoading');
    showAnalysisProgress();

    try {
        const response = await apiRequest('/analyze', {
            method: 'POST',
            body: JSON.stringify({ projectId, timeRange, query, size, maxPages, customPrompt })
        });

        renderAnalysisResult(response.data);
        window._lastAnalysisData = response.data;
    } catch (error) {
        showToast(`分析失败: ${error.message}`, 'error');
    } finally {
        hideLoading('analyzeLoading');
    }
});

/**
 * 显示分析进度动画
 */
function showAnalysisProgress() {
    const container = document.getElementById('analyzeResult');
    container.innerHTML = `
        <div class="card" style="margin-top: 30px;">
            <h3>🔄 分析中...</h3>
            <div style="padding: 20px 0;">
                <div id="progressSteps" style="display: flex; flex-direction: column; gap: 16px;">
                    <div class="progress-step" data-step="1">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <div class="step-icon" style="width: 28px; height: 28px; border-radius: 50%; background: var(--accent-primary-dim); border: 2px solid var(--accent-primary); display: flex; align-items: center; justify-content: center; font-size: 13px; color: var(--accent-primary); animation: pulse 1.5s ease infinite;">1</div>
                            <div style="flex: 1;">
                                <div style="font-size: 14px; font-weight: 600; color: var(--text-primary);">广泛查询</div>
                                <div style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">检索日志数据...</div>
                            </div>
                        </div>
                        <div class="step-progress" style="margin-left: 40px; margin-top: 8px; height: 4px; background: var(--bg-tertiary); border-radius: 2px; overflow: hidden;">
                            <div style="width: 30%; height: 100%; background: linear-gradient(90deg, var(--accent-primary), var(--accent-secondary)); border-radius: 2px; animation: progressSlide 2s ease infinite;"></div>
                        </div>
                    </div>
                    <div class="progress-step" data-step="2" style="opacity: 0.4;">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <div class="step-icon" style="width: 28px; height: 28px; border-radius: 50%; background: var(--bg-tertiary); border: 2px solid var(--border-subtle); display: flex; align-items: center; justify-content: center; font-size: 13px; color: var(--text-muted);">2</div>
                            <div style="flex: 1;">
                                <div style="font-size: 14px; font-weight: 600; color: var(--text-primary);">精准检索</div>
                                <div style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">等待中...</div>
                            </div>
                        </div>
                    </div>
                    <div class="progress-step" data-step="3" style="opacity: 0.4;">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <div class="step-icon" style="width: 28px; height: 28px; border-radius: 50%; background: var(--bg-tertiary); border: 2px solid var(--border-subtle); display: flex; align-items: center; justify-content: center; font-size: 13px; color: var(--text-muted);">3</div>
                            <div style="flex: 1;">
                                <div style="font-size: 14px; font-weight: 600; color: var(--text-primary);">AI 智能分析</div>
                                <div style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">等待中...</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <style>
                @keyframes pulse {
                    0%, 100% { box-shadow: 0 0 0 0 rgba(255, 176, 0, 0.4); }
                    50% { box-shadow: 0 0 0 8px rgba(255, 176, 0, 0); }
                }
                @keyframes progressSlide {
                    0% { width: 30%; margin-left: 0; }
                    50% { width: 70%; margin-left: 0; }
                    100% { width: 30%; margin-left: 70%; }
                }
            </style>
        </div>
    `;
}

/**
 * 更新分析进度步骤
 */
function updateProgressStep(step, status, detail) {
    const stepEl = document.querySelector(`.progress-step[data-step="${step}"]`);
    if (!stepEl) return;

    const icon = stepEl.querySelector('.step-icon');
    const desc = stepEl.querySelector('.step-progress + div div:last-child, div div:last-child');

    if (status === 'active') {
        stepEl.style.opacity = '1';
        icon.style.background = 'var(--accent-primary-dim)';
        icon.style.borderColor = 'var(--accent-primary)';
        icon.style.color = 'var(--accent-primary)';
        icon.style.animation = 'pulse 1.5s ease infinite';
        if (desc) desc.textContent = detail || '进行中...';
    } else if (status === 'completed') {
        stepEl.style.opacity = '1';
        icon.style.background = 'var(--accent-green-dim)';
        icon.style.borderColor = 'var(--accent-green)';
        icon.style.color = 'var(--accent-green)';
        icon.style.animation = 'none';
        icon.innerHTML = '✓';
        if (desc) desc.textContent = detail || '已完成';
        // 移除进度条
        const progress = stepEl.querySelector('.step-progress');
        if (progress) progress.style.display = 'none';
    }
}

function renderAnalysisResult(data) {
    const container = document.getElementById('analyzeResult');

    // 先 dispose 旧的 ECharts 实例防止内存泄漏
    if (window._chartInstances) {
        window._chartInstances.forEach(chart => {
            try { chart.dispose(); } catch (e) { /* ignore */ }
        });
    }
    window._chartInstances = [];

    // 当前项目 ID（用于 traceId 追踪）— 存到 window 供 onclick 引用
    window.currentProjectId = document.getElementById('projectSelect')?.value || data.projectName || '';
    window.currentTimeRange = document.getElementById('timeRangeSelect')?.value || data.timeRange || '';

    let html = `
    <div class="card" style="margin-top: 30px;">
      <h3>📊 分析结果</h3>
      <div class="report-item">
        <div class="header">
          <div>
            <div class="title">${escapeHtml(data.projectName)} / ${escapeHtml(data.logStoreName)}</div>
            <div class="meta">
              📅 ${data.timeRange} (${data.timeFrom} ~ ${data.timeTo})
            </div>
            ${data.query ? `<div class="meta">🔍 查询: ${data.query}</div>` : ''}
          </div>
        </div>
        <div class="stats">
          <div class="stat">📦 总数: <strong>${data.logCount}</strong></div>
          <div class="stat">📤 返回: <strong>${data.returnedCount}</strong></div>
        </div>
      </div>
    </div>

    <!-- 标签页导航 -->
    <div class="report-tabs" style="display: flex; gap: 0; margin: 20px 0 0 0; border-bottom: 1px solid var(--border-subtle);">
      <button class="tab-btn active" data-tab="overview" onclick="switchTab('overview')" style="padding: 10px 20px; background: transparent; border: none; border-bottom: 2px solid var(--accent-primary); color: var(--accent-primary); font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.2s;">📈 概览</button>
      <button class="tab-btn" data-tab="keylogs" onclick="switchTab('keylogs')" style="padding: 10px 20px; background: transparent; border: none; border-bottom: 2px solid transparent; color: var(--text-secondary); font-size: 14px; cursor: pointer; transition: all 0.2s;">🔥 重点日志</button>
      <button class="tab-btn" data-tab="ai" onclick="switchTab('ai')" style="padding: 10px 20px; background: transparent; border: none; border-bottom: 2px solid transparent; color: var(--text-secondary); font-size: 14px; cursor: pointer; transition: all 0.2s;">🤖 AI 分析</button>
      <button class="tab-btn" data-tab="raw" onclick="switchTab('raw')" style="padding: 10px 20px; background: transparent; border: none; border-bottom: 2px solid transparent; color: var(--text-secondary); font-size: 14px; cursor: pointer; transition: all 0.2s;">📋 原始日志</button>
    </div>

    <!-- 导出按钮 -->
    <div style="display: flex; gap: 8px; justify-content: flex-end; margin: 12px 0;">
      <button class="btn btn-secondary" onclick="exportReport('markdown')" style="font-size: 12px; padding: 6px 14px;">📝 导出 Markdown</button>
      <button class="btn btn-secondary" onclick="exportReport('json')" style="font-size: 12px; padding: 6px 14px;">📦 导出 JSON</button>
    </div>

    <!-- 概览标签 -->
    <div id="tab-overview" class="tab-content">

    <!-- 分析入参 -->
    <div class="card">
      <h3>🔧 分析入参</h3>
      <div class="params-grid">
        <div class="param-item">
          <span class="param-label">环境ID</span>
          <span class="param-value">${data.logStoreName}</span>
        </div>
        <div class="param-item">
          <span class="param-label">项目名称</span>
          <span class="param-value">${data.projectName}</span>
        </div>
        <div class="param-item">
          <span class="param-label">时间范围</span>
          <span class="param-value">${data.timeRange}</span>
        </div>
        <div class="param-item">
          <span class="param-label">时间区间</span>
          <span class="param-value">${data.timeFrom} ~ ${data.timeTo}</span>
        </div>
        <div class="param-item" style="grid-column: 1 / -1;">
          <span class="param-label">查询条件</span>
          <span class="param-value">${data.query || '全部日志'}</span>
        </div>
        <div class="param-item">
          <span class="param-label">请求数量</span>
          <span class="param-value">${data.size || 100} × ${data.maxPages || 1} 页</span>
        </div>
      </div>

      ${data.searchPhases && data.searchPhases.length > 1 ? `
      <div style="margin-top: 15px; padding: 12px; background: rgba(255, 176, 0, 0.08); border-radius: 8px; border-left: 3px solid var(--accent-primary);">
        <div style="font-size: 13px; font-weight: 600; color: var(--accent-primary);">🔍 多阶段检索</div>
        ${data.searchPhases.map(p => `
          <div style="font-size: 12px; margin-top: 6px; color: var(--text-primary);">
            <strong>${p.phase}</strong>: 查询 "${escapeHtml(p.query)}" | ${p.pagesUsed} 页 | ${p.logCount} 条日志
          </div>
        `).join('')}
        ${data.refinedQuery ? `<div style="font-size: 11px; margin-top: 8px; color: var(--text-secondary);">💡 自动补充精准查询: ${escapeHtml(data.refinedQuery)}</div>` : ''}
      </div>
      ` : ''}
    </div>
  `;

    // 统计信息
    if (data.stats) {
        html += `
      <div class="card">
        <h3>📈 日志统计</h3>
        <div style="display: flex; gap: 20px; flex-wrap: wrap; margin-bottom: 20px;">
    `;

        if (data.stats.byLevel) {
            Object.entries(data.stats.byLevel).forEach(([level, count]) => {
                html += `<div class="stat">
          <span class="tag tag-${level.toLowerCase()}">${level}</span>
          <strong>${count}</strong>
        </div>`;
            });
        }

        html += `</div>`;

        // 图表区域
        html += `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px;">
          <div style="background: var(--bg-tertiary); border-radius: var(--radius-md); padding: 16px; border: 1px solid var(--border-subtle);">
            <div style="font-size: 13px; font-weight: 600; color: var(--text-secondary); margin-bottom: 12px; font-family: var(--font-mono); text-transform: uppercase; letter-spacing: 0.5px;">日志级别分布</div>
            <div id="levelChart" style="width: 100%; height: 280px;"></div>
          </div>
          <div style="background: var(--bg-tertiary); border-radius: var(--radius-md); padding: 16px; border: 1px solid var(--border-subtle);">
            <div style="font-size: 13px; font-weight: 600; color: var(--text-secondary); margin-bottom: 12px; font-family: var(--font-mono); text-transform: uppercase; letter-spacing: 0.5px;">日志时间趋势</div>
            <div id="trendChart" style="width: 100%; height: 280px;"></div>
          </div>
        </div>
        `;

        // 错误热力图
        html += `
        <div style="background: var(--bg-tertiary); border-radius: var(--radius-md); padding: 16px; border: 1px solid var(--border-subtle); margin-bottom: 24px;">
          <div style="font-size: 13px; font-weight: 600; color: var(--text-secondary); margin-bottom: 12px; font-family: var(--font-mono); text-transform: uppercase; letter-spacing: 0.5px;">错误热力图 (按小时)</div>
          <div id="heatmapChart" style="width: 100%; height: 180px;"></div>
        </div>
        `;

        // 重点日志区域（概览中仅保留简要统计，详细内容移到独立标签页）
        if (data.stats.keyLogs && data.stats.keyLogs.length > 0) {
            html += `
        <h4 style="margin-top: 20px;">🔥 重点日志 (${data.stats.keyLogs.length})</h4>
        <p style="font-size: 12px; color: var(--text-secondary); margin-bottom: 10px;">
          包含 ERROR、WARN 级别及异常堆栈信息，<button onclick="switchTab('keylogs')" style="font-size: 12px; padding: 2px 8px; border-radius: 4px; border: 1px solid var(--accent-secondary); background: transparent; color: var(--accent-secondary); cursor: pointer;">查看全部 →</button>
        </p>
      `;
            // 概览中只展示前5条
            data.stats.keyLogs.slice(0, 5).forEach((log) => {
                const levelClass = log.level === 'ERROR' ? 'error' : (log.level === 'WARN' ? 'warning' : '');
                html += `
          <div class="log-entry ${levelClass}" style="margin-bottom: 10px; padding: 10px; background: ${log.level === 'ERROR' ? 'rgba(239, 68, 68, 0.1)' : log.level === 'WARN' ? 'rgba(245, 158, 11, 0.1)' : 'var(--bg-tertiary)'}; border-radius: 8px; border-left: 3px solid ${log.level === 'ERROR' ? 'var(--accent-red)' : log.level === 'WARN' ? 'var(--accent-orange)' : 'var(--text-muted)'};">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <span class="tag tag-${levelClass || 'info'}" style="font-size: 11px;">${log.level}</span>
              <span style="font-size: 11px; color: var(--text-secondary);">${log.time || '-'}</span>
            </div>
            ${log.traceId ? `<div style="font-size: 11px; color: var(--accent-secondary); margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">🔗 ${escapeHtml(log.traceId)} <button onclick="traceSearch('${window.currentProjectId}', '${escapeHtml(log.traceId)}', '${window.currentTimeRange}')" style="font-size: 10px; padding: 2px 8px; border-radius: 4px; border: 1px solid var(--accent-secondary); background: transparent; color: var(--accent-secondary); cursor: pointer;">追踪</button></div>` : ''}
            <div style="font-family: monospace; font-size: 12px; white-space: pre-wrap; word-break: break-all; color: var(--text-primary);">
              ${escapeHtml(log.message.substring(0, 200))}${log.message.length > 200 ? '...' : ''}
            </div>
            <div style="font-size: 10px; color: var(--text-muted); margin-top: 4px;">📌 ${log.reason}</div>
          </div>
        `;
            });
        }

        // 错误列表
        if (data.stats.errors && data.stats.errors.length > 0) {
            html += `
        <h4 style="margin-top: 20px;">❌ 错误详情 (${data.stats.errors.length})</h4>
        <div style="max-height: 300px; overflow-y: auto;">
      `;
            data.stats.errors.slice(0, 10).forEach(error => {
                html += `
          <div class="log-entry error">
            <div class="time">${error.time}</div>
            <div class="message">${escapeHtml(error.message)}</div>
          </div>
        `;
            });
            html += '</div>';
        }

        html += '</div>';
    }

    // 重点日志标签页（完整列表）
    html += `</div><div id="tab-keylogs" class="tab-content">`;
    if (data.stats && data.stats.keyLogs && data.stats.keyLogs.length > 0) {
        html += `
      <div class="card">
        <h3>🔥 重点日志 (${data.stats.keyLogs.length})</h3>
        <p style="font-size: 12px; color: var(--text-secondary); margin-bottom: 10px;">
          包含 ERROR、WARN 级别及异常堆栈信息
        </p>
        <div style="max-height: 600px; overflow-y: auto;">
      `;
        data.stats.keyLogs.forEach((log) => {
            const levelClass = log.level === 'ERROR' ? 'error' : (log.level === 'WARN' ? 'warning' : '');
            html += `
          <div class="log-entry ${levelClass}" style="margin-bottom: 10px; padding: 10px; background: ${log.level === 'ERROR' ? 'rgba(239, 68, 68, 0.1)' : log.level === 'WARN' ? 'rgba(245, 158, 11, 0.1)' : 'var(--bg-tertiary)'}; border-radius: 8px; border-left: 3px solid ${log.level === 'ERROR' ? 'var(--accent-red)' : log.level === 'WARN' ? 'var(--accent-orange)' : 'var(--text-muted)'};">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <span class="tag tag-${levelClass || 'info'}" style="font-size: 11px;">${log.level}</span>
              <span style="font-size: 11px; color: var(--text-secondary);">${log.time || '-'}</span>
            </div>
            ${log.traceId ? `<div style="font-size: 11px; color: var(--accent-secondary); margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">🔗 ${escapeHtml(log.traceId)} <button onclick="traceSearch('${window.currentProjectId}', '${escapeHtml(log.traceId)}', '${window.currentTimeRange}')" style="font-size: 10px; padding: 2px 8px; border-radius: 4px; border: 1px solid var(--accent-secondary); background: transparent; color: var(--accent-secondary); cursor: pointer;">追踪</button></div>` : ''}
            ${log.userId ? `<div style="font-size: 11px; color: var(--text-secondary); margin-bottom: 4px;">👤 ${escapeHtml(log.userId)}</div>` : ''}
            <div style="font-family: monospace; font-size: 12px; white-space: pre-wrap; word-break: break-all; color: var(--text-primary);">
              ${escapeHtml(log.message.substring(0, 500))}${log.message.length > 500 ? '...' : ''}
            </div>
            <div style="font-size: 10px; color: var(--text-muted); margin-top: 4px;">📌 ${escapeHtml(log.reason)}</div>
          </div>
        `;
        });
        html += '</div></div>';
    } else {
        html += `<div class="card" style="text-align: center; padding: 40px; color: var(--text-secondary);">无重点日志</div>`;
    }

    // AI 分析标签
    html += `</div><div id="tab-ai" class="tab-content">`;

    // AI 分析
    if (data.aiAnalysis && data.aiAnalysis.content) {
        html += `
      <div class="card">
        <h3>🤖 AI 智能分析</h3>
        <div class="markdown-content">${renderMarkdown(data.aiAnalysis.content)}</div>
      </div>
    `;
    } else {
        html += `<div class="card" style="text-align: center; padding: 40px; color: var(--text-secondary);">暂无 AI 分析结果</div>`;
    }

    // 原始日志标签
    html += `</div><div id="tab-raw" class="tab-content">`;

    // 分析依据的日志详情
    if (data.logs && data.logs.length > 0) {
        html += `
      <div class="card">
        <h3>📋 原始日志样本 (前10条)</h3>
        <p style="font-size: 12px; color: var(--text-secondary); margin-bottom: 10px;">
          展示查询返回的前 10 条原始日志，重点日志请查看上方区域
        </p>
        <div style="max-height: 500px; overflow-y: auto;">
    `;
        data.logs.slice(0, 10).forEach((log, index) => {
            const level = (log.level || log.LEVEL || 'INFO').toUpperCase();
            const message = log.content || log.message || log.msg || '';
            const time = log.__time__ ? new Date(log.__time__ * 1000).toLocaleString('zh-CN') : '-';
            const traceId = log.TID || log.traceId || log.trace_id || '';
            const userId = log.userId || log.user_id || '';
            
            html += `
          <div class="log-entry ${level.toLowerCase()}" style="margin-bottom: 12px; padding: 12px; background: var(--bg-tertiary); border-radius: 8px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
              <span style="font-weight: 600;">日志 #${index + 1}</span>
              <span class="tag tag-${level.toLowerCase()}">${level}</span>
            </div>
            <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;">
              🕐 ${time}
            </div>
            ${traceId ? `<div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">🔗 TraceID: ${escapeHtml(traceId)} <button onclick="traceSearch('${window.currentProjectId}', '${escapeHtml(traceId)}', '${window.currentTimeRange}')" style="font-size: 10px; padding: 2px 8px; border-radius: 4px; border: 1px solid var(--accent-secondary); background: transparent; color: var(--accent-secondary); cursor: pointer;">追踪</button></div>` : ''}
            ${userId ? `<div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;">👤 UserID: ${userId}</div>` : ''}
            <div style="margin-top: 8px; padding: 8px; background: rgba(255,255,255,0.03); border-radius: 4px; font-family: monospace; font-size: 13px; white-space: pre-wrap; word-break: break-all;">
              ${escapeHtml(message)}
            </div>
          </div>
        `;
        });
        html += `
        </div>
      </div>
    `;
    }

    // 关闭原始日志标签
    html += `</div>`;

    container.innerHTML = html;

    // 初始化图表
    // 先激活概览标签页（确保图表容器可见），再用双 rAF 确保布局完成后初始化
    switchTab('overview');
    requestAnimationFrame(() => requestAnimationFrame(() => initCharts(data)));
}

/**
 * 初始化分析结果图表
 */
function initCharts(data) {
    if (!data.stats) return;
    // 保护：ECharts CDN 加载失败时不崩溃
    if (typeof echarts === 'undefined') {
        console.warn('[initCharts] ECharts 未加载，跳过图表初始化');
        return;
    }

    const logs = data.logs || [];
    const textColor = '#888888';
    const gridColor = 'rgba(255,255,255,0.04)';

    // 1. 日志级别分布饼图
    const levelChartEl = document.getElementById('levelChart');
    if (levelChartEl && data.stats.byLevel) {
        const levelData = Object.entries(data.stats.byLevel).map(([name, value]) => ({
            name,
            value
        }));
        const levelColors = {
            'ERROR': '#ef4444',
            'WARN': '#f59e0b',
            'INFO': '#00e5ff',
            'DEBUG': '#10b981',
            'TRACE': '#888888'
        };

        const levelChart = echarts.init(levelChartEl);
        window._chartInstances.push(levelChart);
        levelChart.setOption({
            backgroundColor: 'transparent',
            tooltip: {
                trigger: 'item',
                backgroundColor: '#1a1a1a',
                borderColor: 'rgba(255,255,255,0.1)',
                textStyle: { color: '#f0f0f0' }
            },
            series: [{
                type: 'pie',
                radius: ['40%', '70%'],
                center: ['50%', '50%'],
                avoidLabelOverlap: true,
                itemStyle: {
                    borderRadius: 6,
                    borderColor: '#0a0a0a',
                    borderWidth: 2
                },
                label: {
                    color: textColor,
                    formatter: '{b}: {c} ({d}%)'
                },
                labelLine: {
                    lineStyle: { color: 'rgba(255,255,255,0.15)' }
                },
                data: levelData.map(item => ({
                    ...item,
                    itemStyle: { color: levelColors[item.name] || '#888888' }
                }))
            }]
        });
    }

    // 2. 时间趋势折线图
    const trendChartEl = document.getElementById('trendChart');
    if (trendChartEl && logs.length > 0) {
        // 按小时聚合日志数量
        const hourlyData = {};
        logs.forEach(log => {
            if (log.__time__) {
                const hour = new Date(log.__time__ * 1000).toISOString().slice(0, 13) + ':00';
                hourlyData[hour] = (hourlyData[hour] || 0) + 1;
            }
        });

        const sortedHours = Object.keys(hourlyData).sort();
        const trendX = sortedHours.map(h => {
            const d = new Date(h);
            return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:00`;
        });
        const trendY = sortedHours.map(h => hourlyData[h]);

        const trendChart = echarts.init(trendChartEl);
        window._chartInstances.push(trendChart);
        trendChart.setOption({
            backgroundColor: 'transparent',
            tooltip: {
                trigger: 'axis',
                backgroundColor: '#1a1a1a',
                borderColor: 'rgba(255,255,255,0.1)',
                textStyle: { color: '#f0f0f0' }
            },
            grid: {
                left: '3%',
                right: '4%',
                bottom: '3%',
                top: '10%',
                containLabel: true
            },
            xAxis: {
                type: 'category',
                data: trendX,
                axisLine: { lineStyle: { color: gridColor } },
                axisLabel: { color: textColor, fontSize: 11, rotate: 30 },
                axisTick: { show: false }
            },
            yAxis: {
                type: 'value',
                axisLine: { show: false },
                splitLine: { lineStyle: { color: gridColor } },
                axisLabel: { color: textColor, fontSize: 11 }
            },
            series: [{
                type: 'line',
                data: trendY,
                smooth: true,
                symbol: 'circle',
                symbolSize: 6,
                lineStyle: { color: '#ffb000', width: 2 },
                itemStyle: { color: '#ffb000', borderColor: '#0a0a0a', borderWidth: 2 },
                areaStyle: {
                    color: {
                        type: 'linear',
                        x: 0, y: 0, x2: 0, y2: 1,
                        colorStops: [
                            { offset: 0, color: 'rgba(255, 176, 0, 0.3)' },
                            { offset: 1, color: 'rgba(255, 176, 0, 0)' }
                        ]
                    }
                }
            }]
        });
    }

    // 3. 错误热力图 (按小时)
    const heatmapChartEl = document.getElementById('heatmapChart');
    if (heatmapChartEl && logs.length > 0) {
        // 统计每小时的 ERROR/WARN 数量
        const errorHourly = {};
        logs.forEach(log => {
            const level = (log.level || log.LEVEL || 'INFO').toUpperCase();
            if ((level === 'ERROR' || level === 'WARN') && log.__time__) {
                const hour = new Date(log.__time__ * 1000).getHours();
                errorHourly[hour] = (errorHourly[hour] || 0) + 1;
            }
        });

        const hours = Array.from({ length: 24 }, (_, i) => i);
        const heatmapData = hours.map(h => [h, errorHourly[h] || 0]);
        const maxVal = Math.max(...heatmapData.map(d => d[1]), 1);

        const heatmapChart = echarts.init(heatmapChartEl);
        window._chartInstances.push(heatmapChart);
        heatmapChart.setOption({
            backgroundColor: 'transparent',
            tooltip: {
                position: 'top',
                backgroundColor: '#1a1a1a',
                borderColor: 'rgba(255,255,255,0.1)',
                textStyle: { color: '#f0f0f0' },
                formatter: (params) => {
                    return `${params.data[0]}:00 - ${params.data[1]} 条异常`;
                }
            },
            grid: {
                left: '3%',
                right: '4%',
                bottom: '15%',
                top: '5%',
                containLabel: true
            },
            xAxis: {
                type: 'category',
                data: hours.map(h => `${h}:00`),
                axisLine: { lineStyle: { color: gridColor } },
                axisLabel: { color: textColor, fontSize: 10, interval: 2 },
                axisTick: { show: false }
            },
            yAxis: {
                type: 'value',
                show: false,
                max: maxVal
            },
            visualMap: {
                show: false,
                min: 0,
                max: maxVal,
                inRange: {
                    color: ['#1a1a1a', '#f59e0b', '#ef4444']
                }
            },
            series: [{
                type: 'bar',
                data: heatmapData.map(d => d[1]),
                itemStyle: {
                    borderRadius: [3, 3, 0, 0],
                    color: (params) => {
                        const val = params.data;
                        if (val === 0) return 'rgba(255,255,255,0.03)';
                        const ratio = val / maxVal;
                        return ratio > 0.6 ? '#ef4444' : ratio > 0.3 ? '#f59e0b' : '#10b981';
                    }
                },
                barWidth: '70%'
            }]
        });
    }
}

/**
 * 切换报告标签页
 */
function switchTab(tabName) {
    // 用 CSS class 管理标签页显示
    // 只清除报告内的子标签页（#analyzeResult 内的），不影响主标签页
    const container = document.getElementById('analyzeResult');
    if (container) {
        container.querySelectorAll('.tab-content').forEach(el => {
            el.classList.remove('active');
        });
    }
    // 显示当前标签
    const tabEl = document.getElementById('tab-' + tabName);
    if (tabEl) tabEl.classList.add('active');

    // 更新按钮样式
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.style.borderBottomColor = 'transparent';
        btn.style.color = 'var(--text-secondary)';
        btn.style.fontWeight = '400';
    });
    const activeBtn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
    if (activeBtn) {
        activeBtn.style.borderBottomColor = 'var(--accent-primary)';
        activeBtn.style.color = 'var(--accent-primary)';
        activeBtn.style.fontWeight = '600';
    }
}

/**
 * 导出分析报告
 */
function exportReport(format) {
    const data = window._lastAnalysisData;
    if (!data) {
        showToast('暂无分析结果可导出', 'error');
        return;
    }

    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const filename = `report-${data.projectName}-${timestamp}`;

    if (format === 'json') {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filename}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('JSON 报告已导出', 'success');
    } else if (format === 'markdown') {
        let md = `# 📊 日志分析报告

| 项目 | 详情 |
|:---|:---|
| **项目名称** | ${data.projectName} |
| **环境** | ${data.logStoreName} |
| **时间范围** | ${data.timeRange} (${data.timeFrom} ~ ${data.timeTo}) |
| **查询条件** | ${data.query || '全部日志'} |
| **日志总数** | ${data.logCount} |
| **返回数量** | ${data.returnedCount} |

`;
        if (data.stats && data.stats.byLevel) {
            md += '## 📈 日志级别分布\n\n';
            Object.entries(data.stats.byLevel).forEach(([level, count]) => {
                md += `- **${level}**: ${count}\n`;
            });
            md += '\n';
        }

        if (data.stats && data.stats.keyLogs && data.stats.keyLogs.length > 0) {
            md += `## 🔥 重点日志 (${data.stats.keyLogs.length})\n\n`;
            data.stats.keyLogs.slice(0, 20).forEach(log => {
                md += `### ${log.level} - ${log.time || '-'}\n\n`;
                if (log.traceId) md += `**TraceID**: ${log.traceId}\n\n`;
                md += '\`\`\`\n' + log.message + '\n\`\`\`\n\n';
                if (log.reason) md += `*原因: ${log.reason}*\n\n`;
            });
        }

        if (data.aiAnalysis && data.aiAnalysis.content) {
            md += '## 🤖 AI 智能分析\n\n' + data.aiAnalysis.content + '\n\n';
        }

        md += '---\n\n*报告生成时间: ' + new Date().toLocaleString('zh-CN') + '*\n';

        const blob = new Blob([md], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filename}.md`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Markdown 报告已导出', 'success');
    }
}

// ========== traceId 链路追踪 ==========

/**
 * 一键追踪 traceId — 调用 /api/trace-search 查完整链路
 */
window.traceSearch = async function(projectId, traceId, timeRange) {
    const modal = document.getElementById('traceModal');
    const body = document.getElementById('traceModalBody');

    modal.style.display = 'flex';
    body.innerHTML = `
        <div style="text-align: center; padding: 30px;">
            <div style="display: inline-block; width: 30px; height: 30px; border: 3px solid var(--text-muted); border-top-color: var(--accent-primary); border-radius: 50%; animation: spin 1s linear infinite;"></div>
            <p style="margin-top: 15px; color: var(--text-secondary);">正在追踪链路: ${traceId}</p>
        </div>
    `;

    try {
        const response = await apiRequest('/trace-search', {
            method: 'POST',
            body: JSON.stringify({ projectId, traceId, timeRange, maxPages: 3 })
        });

        const data = response.data;
        const ctx = data.context;

        if (data.logs.length === 0) {
            body.innerHTML = `
                <div style="text-align: center; padding: 30px;">
                    <div style="font-size: 40px;">🔍</div>
                    <p style="color: var(--text-secondary);">未找到 traceId ${traceId} 的链路日志</p>
                </div>
            `;
            return;
        }

        const sortedLogs = data.logs.sort((a, b) => (a.__time__ || 0) - (b.__time__ || 0));

        let html = '';

        // ===== 顶部概览 =====
        html += `
            <div style="margin-bottom: 12px; padding: 10px; background: rgba(255, 176, 0, 0.08); border-radius: 8px;">
                <div style="font-size: 13px; color: var(--accent-primary);"><strong>${data.logCount}</strong> 条链路日志 | ${data.timeRange}</div>
            </div>
        `;

        // ===== 问题摘要（如果有 ERROR）=====
        if (ctx && ctx.summary && ctx.summary.hasError) {
            const s = ctx.summary;
            html += `
                <div style="margin-bottom: 12px; padding: 12px; background: rgba(239, 68, 68, 0.1); border-radius: 8px; border-left: 3px solid var(--accent-red);">
                    <div style="font-size: 13px; font-weight: 600; color: var(--accent-red);">❌ 链路异常 (${s.errorCount} 处)</div>
                    <div style="font-size: 12px; margin-top: 6px; color: var(--text-primary); font-family: monospace; white-space: pre-wrap; word-break: break-all;">
                        ${escapeHtml(s.rootError?.message || '')}
                    </div>
                </div>
            `;

            // 错误上下文（前一条 + 后一条）
            if (s.rootContext) {
                html += `
                    <div style="margin-bottom: 12px; padding: 10px; background: var(--bg-tertiary); border-radius: 8px; border-left: 3px solid var(--accent-orange);">
                        <div style="font-size: 12px; font-weight: 600; color: var(--accent-orange);">⚠️ 错误上下文</div>
                        ${s.rootContext.before ? `
                            <div style="margin-top: 6px; font-size: 11px; color: var(--text-secondary);">前一条日志:</div>
                            <div style="font-family: monospace; font-size: 12px; white-space: pre-wrap; word-break: break-all; padding: 6px; background: rgba(255,255,255,0.03); border-radius: 4px; margin-bottom: 6px;">
                                ${escapeHtml(s.rootContext.before)}
                            </div>
                        ` : ''}
                        <div style="font-size: 11px; color: var(--accent-red); font-weight: 600;">错误日志:</div>
                        <div style="font-family: monospace; font-size: 12px; white-space: pre-wrap; word-break: break-all; padding: 6px; background: rgba(239, 68, 68, 0.08); border-radius: 4px; margin-bottom: 6px;">
                            ${escapeHtml(s.rootContext.error)}
                        </div>
                        ${s.rootContext.after ? `
                            <div style="font-size: 11px; color: var(--text-secondary);">后一条日志:</div>
                            <div style="font-family: monospace; font-size: 12px; white-space: pre-wrap; word-break: break-all; padding: 6px; background: rgba(255,255,255,0.03); border-radius: 4px;">
                                ${escapeHtml(s.rootContext.after)}
                            </div>
                        ` : ''}
                    </div>
                `;
            }
        }

        // ===== SQL 语句（如果有）=====
        if (ctx && ctx.sqlStatements && ctx.sqlStatements.length > 0) {
            html += `
                <div style="margin-bottom: 12px; padding: 12px; background: rgba(16, 185, 129, 0.1); border-radius: 8px; border-left: 3px solid var(--accent-green);">
                    <div style="font-size: 13px; font-weight: 600; color: var(--accent-green);">💾 相关 SQL (${ctx.sqlStatements.length})</div>
            `;
            ctx.sqlStatements.forEach((sqlItem, i) => {
                html += `
                    <div style="margin-top: 8px; font-size: 11px; color: var(--text-secondary);">
                        SQL #${i + 1} | ${sqlItem.time ? new Date(sqlItem.time).toLocaleString('zh-CN') : '-'} | 来源: ${escapeHtml(sqlItem.source)}
                    </div>
                    <div style="font-family: monospace; font-size: 12px; white-space: pre-wrap; word-break: break-all; padding: 8px; background: rgba(255,255,255,0.05); border-radius: 4px; margin-top: 4px;">
                        ${escapeHtml(sqlItem.sql)}
                    </div>
                `;
            });
            html += `</div>`;
        }

        // ===== WARN 摘要 =====
        if (ctx && ctx.warnPoints && ctx.warnPoints.length > 0) {
            html += `
                <div style="margin-bottom: 12px; padding: 10px; background: rgba(245, 158, 11, 0.1); border-radius: 8px; border-left: 3px solid var(--accent-orange);">
                    <div style="font-size: 13px; font-weight: 600; color: var(--accent-orange);">⚠️ 警告 (${ctx.warnPoints.length})</div>
            `;
            ctx.warnPoints.slice(0, 5).forEach(w => {
                html += `
                    <div style="font-family: monospace; font-size: 11px; white-space: pre-wrap; word-break: break-all; padding: 4px; margin-top: 4px;">
                        ${escapeHtml(w.message.substring(0, 200))}${w.message.length > 200 ? '...' : ''}
                    </div>
                `;
            });
            html += `</div>`;
        }

        // ===== 完整链路日志 =====
        html += `
            <div style="margin-bottom: 8px; font-size: 13px; font-weight: 600; color: var(--text-primary);">📋 完整链路日志</div>
        `;
        sortedLogs.forEach((log, i) => {
            const level = (log.level || log.LEVEL || 'INFO').toUpperCase();
            const message = log.content || log.message || log.msg || '';
            const time = log.__time__ ? new Date(log.__time__ * 1000).toLocaleString('zh-CN') : '-';
            const isSQL = message.includes('SQL:');
            const isError = message.includes('ERROR') || message.includes('Exception');
            const isWarn = message.match(/\bWARN\b/) && !isError;

            html += `
                <div style="margin-bottom: 8px; padding: 10px; background: ${isError ? 'rgba(239, 68, 68, 0.1)' : isWarn ? 'rgba(245, 158, 11, 0.1)' : isSQL ? 'rgba(52,199,89,0.08)' : 'var(--bg-tertiary)'}; border-radius: 8px; border-left: 3px solid ${isError ? 'var(--accent-red)' : isWarn ? 'var(--accent-orange)' : isSQL ? 'var(--accent-green)' : 'var(--text-muted)'};">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                        <span style="font-weight: 600; font-size: 12px;">#${i + 1} ${isSQL ? '💾' : ''} ${isError ? '❌' : ''}</span>
                        <span style="font-size: 10px; color: var(--text-secondary);">${time}</span>
                    </div>
                    <div style="font-family: monospace; font-size: 12px; white-space: pre-wrap; word-break: break-all;">
                        ${escapeHtml(message.substring(0, 500))}${message.length > 500 ? '...' : ''}
                    </div>
                </div>
            `;
        });

        body.innerHTML = html;

    } catch (error) {
        body.innerHTML = `
            <div style="text-align: center; padding: 30px;">
                <div style="font-size: 40px;">❌</div>
                <p style="color: var(--accent-red);">追踪失败: ${error.message}</p>
            </div>
        `;
    }
};

/**
 * 关闭 traceId 追踪模态框
 */
window.closeTraceModal = function() {
    const modal = document.getElementById('traceModal');
    if (modal) modal.style.display = 'none';
};

function renderMarkdown(text) {
    // 先转义 HTML，防止 XSS（AI 输出可能包含 <script> 等）
    const escaped = escapeHtml(text);
    return escaped
        .replace(/### (.+)/g, '<h3>$1</h3>')
        .replace(/## (.+)/g, '<h2>$1</h2>')
        .replace(/# (.+)/g, '<h1>$1</h1>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/`(.+?)`/g, '<code>$1</code>')
        .replace(/\n/g, '<br>');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ========== 分析模板 ==========

const TEMPLATE_STORAGE_KEY = 'logAnalyzer_templates';

function getTemplates() {
    try {
        const stored = localStorage.getItem(TEMPLATE_STORAGE_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch (e) {
        console.error('读取模板失败:', e);
        return [];
    }
}

function saveTemplates(templates) {
    localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(templates));
}

function renderTemplateSelect() {
    const select = document.getElementById('templateSelect');
    if (!select) return;
    const templates = getTemplates();
    select.innerHTML = '<option value="">-- 选择已保存模板 --</option>' +
        templates.map((t, i) => `<option value="${i}">${escapeHtml(t.name)}</option>`).join('');
}

function saveTemplate() {
    const name = prompt('请输入模板名称:');
    if (!name || !name.trim()) return;

    const template = {
        name: name.trim(),
        projectId: document.getElementById('projectSelect').value,
        timeRange: document.getElementById('timeRangeSelect').value,
        query: document.getElementById('queryInput').value,
        customPrompt: document.getElementById('customPromptInput').value,
        size: document.getElementById('sizeSelect').value,
        maxPages: document.getElementById('maxPagesSelect').value,
        createdAt: new Date().toISOString()
    };

    const templates = getTemplates();
    templates.push(template);
    saveTemplates(templates);
    renderTemplateSelect();
    showToast('模板已保存', 'success');
}

function loadTemplate() {
    const select = document.getElementById('templateSelect');
    const index = select.value;
    if (index === '') return;

    const templates = getTemplates();
    const template = templates[parseInt(index)];
    if (!template) return;

    if (template.projectId) document.getElementById('projectSelect').value = template.projectId;
    if (template.timeRange) document.getElementById('timeRangeSelect').value = template.timeRange;
    if (template.query !== undefined) document.getElementById('queryInput').value = template.query;
    if (template.customPrompt !== undefined) document.getElementById('customPromptInput').value = template.customPrompt;
    if (template.size) document.getElementById('sizeSelect').value = template.size;
    if (template.maxPages) document.getElementById('maxPagesSelect').value = template.maxPages;

    showToast('模板已加载', 'success');
}

// ========== 报告列表 ==========

async function loadReports() {
    try {
        // 先确保项目配置已加载（用于映射项目名称）
        if (Object.keys(state.projects || {}).length === 0) {
            const configResponse = await apiRequest('/config');
            state.projects = configResponse.data.projects || {};
        }

        const response = await apiRequest('/reports');
        state.reports = response.data;
        state.reportsPage = 1; // 重置页码
        renderReports();
    } catch (error) {
        console.error('加载报告失败:', error);
    }
}

function renderReports() {
    const container = document.getElementById('reportList');
    const { reports, reportsPage, reportsPageSize } = state;

    if (reports.length === 0) {
        container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📊</div>
        <p class="empty-text">还没有分析报告</p>
      </div>
    `;
        // 隐藏分页控件
        const pagination = document.getElementById('reportPagination');
        if (pagination) pagination.style.display = 'none';
        return;
    }

    // 计算分页
    const totalReports = reports.length;
    const totalPages = Math.ceil(totalReports / reportsPageSize);
    const startIndex = (reportsPage - 1) * reportsPageSize;
    const endIndex = startIndex + reportsPageSize;
    const pageReports = reports.slice(startIndex, endIndex);

    // 渲染报告列表
    container.innerHTML = pageReports.map(report => {
        // 根据 logStoreName 查找项目名称
        let displayName = report.projectName;
        const projects = state.projects || {};
        for (const key in projects) {
            if (projects[key].logStoreName === report.logStoreName) {
                displayName = projects[key].name;
                break;
            }
        }

        // 格式化创建时间
        const createdDate = new Date(report.createdAt);
        const timeStr = createdDate.toLocaleString('zh-CN', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });

        return `
        <div class="report-item">
          <div class="header">
            <div>
              <div class="title">${displayName}</div>
              <div class="meta">
                <span>📁</span>
                <span>${report.logStoreName || '-'}</span>
              </div>
            </div>
            <div class="actions">
              <button class="btn btn-primary btn-sm" onclick="viewReport('${report.id}')">
                查看详情
              </button>
              <button class="btn btn-danger btn-sm" onclick="deleteReport('${report.id}')">
                删除
              </button>
            </div>
          </div>
          <div class="report-params">
            <div class="param-row">
              <span class="param-label">🔍 查询关键词</span>
              <span class="param-value ${report.query ? 'keyword' : ''}">${report.query || '全部日志'}</span>
            </div>
            <div class="param-row">
              <span class="param-label">📅 时间范围</span>
              <span class="param-value time">${report.timeRange || '-'}</span>
            </div>
            <div class="param-row">
              <span class="param-label">⏰ 时间区间</span>
              <span class="param-value detail">${report.timeFrom || '-'} ~ ${report.timeTo || '-'}</span>
            </div>
          </div>
          <div class="stats">
            <div class="stat" data-label="请求数"><strong>${report.size || 100}</strong></div>
            <div class="stat" data-label="返回数"><strong>${report.returnedCount || 0}</strong></div>
            <div class="stat" data-label="日志总数"><strong>${report.logCount || 0}</strong></div>
            <div class="stat" data-label="创建时间"><strong>${timeStr}</strong></div>
          </div>
        </div>
      `;
    }).join('');

    // 渲染分页控件
    renderPagination(totalPages, totalReports, startIndex + 1, Math.min(endIndex, totalReports));
}

window.viewReport = async function(id) {
    // 切换到分析页面 — 直接操作 DOM
    // 清除所有主标签页的 active（注意：主标签和报告子标签都用了 tab-content class）
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    // 只清除主区域的 tab-content（settings/projects/ai/analyze/reports），不影响报告内的子标签
    document.querySelectorAll('.main-content > .tab-content').forEach(c => c.classList.remove('active'));
    const analyzeNav = document.querySelector('[data-tab="analyze"]');
    if (analyzeNav) analyzeNav.classList.add('active');
    const analyzeTab = document.getElementById('analyze-tab');
    if (analyzeTab) analyzeTab.classList.add('active');

    // 立即显示加载状态
    const container = document.getElementById('analyzeResult');
    container.innerHTML = `
        <div class="card" style="margin-top: 30px; text-align: center; padding: 40px;">
            <div class="report-loading active">
                <div class="spinner"></div>
            </div>
            <p style="margin-top: 20px; color: var(--text-secondary);">正在加载报告详情...</p>
        </div>
    `;

    // 滚动到顶部
    document.getElementById('analyze-tab').scrollIntoView({ behavior: 'smooth' });

    try {
        const response = await apiRequest(`/reports/${id}`);
        renderAnalysisResult(response.data);
    } catch (error) {
        container.innerHTML = `
            <div class="card" style="margin-top: 30px;">
                <div class="alert alert-error">
                    ❌ 加载报告失败: ${error.message}
                </div>
            </div>
        `;
    }
}

window.deleteReport = async function(id) {
    if (!confirm('确定要删除这个报告吗?')) return;

    try {
        await apiRequest(`/reports/${id}`, { method: 'DELETE' });
        loadReports(); // 重新加载报告列表（会重置页码）
        showAlert('reports-tab', '✅ 报告已删除', 'success');
    } catch (error) {
        showAlert('reports-tab', `❌ 删除失败: ${error.message}`, 'error');
    }
}

function renderPagination(totalPages, totalReports, startNum, endNum) {
    const paginationContainer = document.getElementById('reportPagination');
    if (!paginationContainer) return;

    if (totalPages <= 1) {
        paginationContainer.style.display = 'none';
        return;
    }

    paginationContainer.style.display = 'flex';

    const currentPage = state.reportsPage;

    // 生成页码按钮
    let pageButtons = '';
    const maxVisiblePages = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

    if (endPage - startPage + 1 < maxVisiblePages) {
        startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    // 首页按钮
    if (startPage > 1) {
        pageButtons += `<button class="page-btn" onclick="goToReportPage(1)">«</button>`;
    }

    // 上一页按钮
    if (currentPage > 1) {
        pageButtons += `<button class="page-btn" onclick="goToReportPage(${currentPage - 1})">‹</button>`;
    }

    // 页码按钮
    for (let i = startPage; i <= endPage; i++) {
        if (i === currentPage) {
            pageButtons += `<button class="page-btn active">${i}</button>`;
        } else {
            pageButtons += `<button class="page-btn" onclick="goToReportPage(${i})">${i}</button>`;
        }
    }

    // 下一页按钮
    if (currentPage < totalPages) {
        pageButtons += `<button class="page-btn" onclick="goToReportPage(${currentPage + 1})">›</button>`;
    }

    // 末页按钮
    if (endPage < totalPages) {
        pageButtons += `<button class="page-btn" onclick="goToReportPage(${totalPages})">»</button>`;
    }

    paginationContainer.innerHTML = `
        <div class="pagination-info">
            显示 ${startNum}-${endNum} 条，共 ${totalReports} 条
        </div>
        <div class="pagination-buttons">
            ${pageButtons}
        </div>
    `;
}

// 跳转到指定页
window.goToReportPage = function(page) {
    state.reportsPage = page;
    renderReports();
    // 滚动到顶部
    document.getElementById('reports-tab').scrollIntoView({ behavior: 'smooth' });
}

// ========== AI 配置 ==========

document.getElementById('aiProvider').addEventListener('change', (e) => {
    const baseUrlGroup = document.getElementById('baseUrlGroup');
    if (e.target.value === 'openai-compatible') {
        baseUrlGroup.style.display = 'block';
    } else {
        baseUrlGroup.style.display = 'none';
    }
});

document.getElementById('saveAiConfig').addEventListener('click', async () => {
    const aiApiKeyInput = document.getElementById('aiApiKey');
    const apiKey = aiApiKeyInput.value.trim();

    const aiConfig = {
        provider: document.getElementById('aiProvider').value,
        model: document.getElementById('aiModel').value.trim()
    };

    // 如果 API Key 不是占位符，才更新
    if (apiKey && apiKey !== '••••••••••••••') {
        aiConfig.apiKey = apiKey;
    }

    const baseUrl = document.getElementById('aiBaseUrl').value.trim();
    if (baseUrl) {
        aiConfig.baseUrl = baseUrl;
    }

    try {
        await apiRequest('/config', {
            method: 'POST',
            body: JSON.stringify({ aiConfig })
        });
        showAlert('ai-tab', '✅ AI 配置已保存', 'success');
        // 更新占位符状态
        if (aiConfig.apiKey) {
            aiApiKeyInput.value = '••••••••••••••';
            aiApiKeyInput.dataset.hasKey = 'true';
        }
    } catch (error) {
        showAlert('ai-tab', `❌ 保存失败: ${error.message}`, 'error');
    }
});

// 测试 AI 配置
document.getElementById('testAiConfig').addEventListener('click', async () => {
    const aiApiKeyInput = document.getElementById('aiApiKey');
    const provider = document.getElementById('aiProvider').value;
    let apiKey = aiApiKeyInput.value.trim();
    const baseUrl = document.getElementById('aiBaseUrl').value.trim();
    const model = document.getElementById('aiModel').value.trim();

    // 如果是占位符，使用已保存的配置
    if (apiKey === '•••••••••••••••') {
        showAlert('ai-tab', '📝 将使用已保存的 API Key 进行测试', 'info');
        apiKey = 'USE_SAVED_CONFIG';
    }

    if (!apiKey || apiKey === '••••••••••••••••') {
        showAlert('ai-tab', '请填写 API Key', 'error');
        return;
    }

    if (!model) {
        showAlert('ai-tab', '请填写模型名称', 'error');
        return;
    }

    if (provider === 'openai-compatible' && !baseUrl) {
        showAlert('ai-tab', 'OpenAI 兼容 API 需要填写 Base URL', 'error');
        return;
    }

    const testResultEl = document.getElementById('testResult');
    testResultEl.style.display = 'block';
    testResultEl.innerHTML = `
    <div style="padding: 15px; background: rgba(255, 176, 0, 0.1); color: var(--accent-primary); border-radius: 10px;">
      <span style="display: inline-block; animation: spin 1s linear infinite;">⏳</span>
      正在测试连接，请稍候...
    </div>
  `;

    try {
        const response = await apiRequest('/test-ai', {
            method: 'POST',
            body: JSON.stringify({ provider, apiKey, baseUrl, model })
        });

        const data = response.data;
        testResultEl.innerHTML = `
      <div style="padding: 15px; background: rgba(16, 185, 129, 0.1); color: var(--accent-green); border-radius: 10px;">
        <h4 style="margin: 0 0 10px 0;">✅ 连接测试成功!</h4>
        <div style="font-size: 0.9rem; line-height: 1.6;">
          <div><strong>提供商:</strong> ${data.provider}</div>
          <div><strong>模型:</strong> ${data.model}</div>
          <div><strong>响应:</strong> ${data.response}</div>
          ${data.usage ? `<div><strong>Token 用量:</strong> ${data.usage.input_tokens || 0} + ${data.usage.output_tokens || 0}</div>` : ''}
        </div>
      </div>
    `;

        showAlert('ai-tab', '✅ AI 配置测试通过', 'success');

    } catch (error) {
        testResultEl.innerHTML = `
      <div style="padding: 15px; background: rgba(239, 68, 68, 0.1); color: var(--accent-red); border-radius: 10px;">
        <h4 style="margin: 0 0 10px 0;">❌ 连接测试失败</h4>
        <div style="font-size: 0.9rem;">
          <div><strong>错误:</strong> ${error.message}</div>
          ${error.details ? `<div style="margin-top: 10px;"><strong>详情:</strong><pre style="background: rgba(255,255,255,0.1); padding: 10px; border-radius: 5px; overflow-x: auto; margin-top: 5px;">${JSON.stringify(error.details, null, 2)}</pre></div>` : ''}
        </div>
      </div>
    `;
        showAlert('ai-tab', `❌ 测试失败: ${error.message}`, 'error');
    }
});

// 快速测试按钮（使用已保存的配置）
document.getElementById('testAiConfigQuick')?.addEventListener('click', async () => {
    const btn = document.getElementById('testAiConfigQuick');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '⏳ 测试中...';

    const aiConfigDisplay = document.getElementById('aiConfigDisplay');
    try {
        const response = await apiRequest('/test-ai', {
            method: 'POST',
            body: JSON.stringify({ apiKey: 'USE_SAVED_CONFIG' })
        });
        const data = response.data;
        aiConfigDisplay.innerHTML = `
            <div style="color: var(--accent-green);">✅ 连接成功</div>
            <div style="margin-top: 8px; font-size: 13px; color: var(--text-secondary);">
                模型: ${data.model} | 响应: ${data.response}
            </div>
        `;
    } catch (error) {
        showToast(`测试失败: ${error.message}`, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
});

// 编辑配置按钮 - 打开模态框
document.getElementById('editAiConfigBtn')?.addEventListener('click', () => {
    openEditAiModal();
});

// 打开编辑 AI 配置模态框
window.openEditAiModal = function() {
    const modal = document.getElementById('editAiModal');
    if (!modal) return;

    // 预填充当前配置
    const config = state.config || {};
    document.getElementById('editAiProvider').value = config.aiProvider || 'anthropic';
    document.getElementById('editAiModel').value = config.aiModel || '';
    document.getElementById('editAiBaseUrl').value = config.aiBaseUrl || '';

    // API Key：有已保存key时显示锁图标，不显示占位符
    const apiKeyInput = document.getElementById('editAiApiKey');
    const keyStatus = document.getElementById('editAiKeyStatus');
    const keyHint = document.getElementById('editAiKeyHint');

    if (config.hasApiKey) {
        apiKeyInput.value = '';
        keyStatus.style.display = 'inline';
        keyHint.textContent = '🔒 已保存 API Key，留空保持不变或输入新的 Key';
    } else {
        apiKeyInput.value = '';
        keyStatus.style.display = 'none';
        keyHint.textContent = '输入新的 API Key 或留空使用已保存的 Key';
    }

    // 显示/隐藏 Base URL 组
    const baseUrlGroup = document.getElementById('editBaseUrlGroup');
    if (config.aiProvider === 'openai-compatible') {
        baseUrlGroup.style.display = 'block';
    } else {
        baseUrlGroup.style.display = 'none';
    }

    // 显示模态框
    modal.style.display = 'flex';
}

// 关闭编辑 AI 配置模态框
window.closeEditAiModal = function() {
    const modal = document.getElementById('editAiModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// 在模态框中保存 AI 配置
window.saveEditAiConfig = async function() {
    const resultEl = document.getElementById('editAiResult');
    const provider = document.getElementById('editAiProvider').value;
    const apiKey = document.getElementById('editAiApiKey').value.trim();
    const baseUrl = document.getElementById('editAiBaseUrl').value.trim();
    const model = document.getElementById('editAiModel').value.trim();

    const aiConfig = { provider, model };

    // 如果 API Key 不是占位符，才更新
    if (apiKey && apiKey !== '•••••••••••••••') {
        aiConfig.apiKey = apiKey;
    }

    if (baseUrl) {
        aiConfig.baseUrl = baseUrl;
    }

    // 显示保存中状态
    resultEl.innerHTML = '<div style="padding: 12px; background: rgba(255, 176, 0, 0.1); color: var(--text-primary); border-radius: 8px;">⏳ 保存中...</div>';

    try {
        await apiRequest('/config', {
            method: 'POST',
            body: JSON.stringify({ aiConfig })
        });

        // 更新全局配置状态
        state.config.aiProvider = provider;
        state.config.aiModel = model;
        state.config.aiBaseUrl = baseUrl;
        if (aiConfig.apiKey) {
            state.config.hasApiKey = true;
        }

        // 更新显示
        const aiConfigDisplay = document.getElementById('aiConfigDisplay');
        aiConfigDisplay.innerHTML = `
            <div style="display: flex; gap: 20px; flex-wrap: wrap;">
                <div><strong>提供商:</strong> ${provider}</div>
                <div><strong>模型:</strong> ${model}</div>
                <div><strong>API Key:</strong> ${aiConfig.apiKey ? '✅ 已配置' : '❌ 未配置'}</div>
            </div>
        `;

        // 显示成功状态
        showToast('AI 配置已保存', 'success');

        // 延迟关闭模态框
        setTimeout(() => closeEditAiModal(), 1500);
    } catch (error) {
        showToast(`保存失败: ${error.message}`, 'error');
    }
}

// 在模态框中测试 AI 配置
window.testEditAiConfig = async function() {
    const resultEl = document.getElementById('editAiResult');
    const provider = document.getElementById('editAiProvider').value;
    const apiKeyInput = document.getElementById('editAiApiKey');
    let apiKey = apiKeyInput.value.trim();
    const baseUrl = document.getElementById('editAiBaseUrl').value.trim();
    const model = document.getElementById('editAiModel').value.trim();

    // 如果输入框为空，提示用户需要输入 key 才能测试
    if (!apiKey) {
        resultEl.innerHTML = '<div style="padding: 12px; background: rgba(245, 158, 11, 0.1); color: var(--accent-orange); border-radius: 8px;">📝 请输入 API Key 进行测试（留空则保存时使用已保存的 Key）</div>';
        return;
    }

    if (!model) {
        resultEl.innerHTML = '<div style="padding: 12px; background: rgba(239, 68, 68, 0.1); color: var(--accent-red); border-radius: 8px;">❌ 请填写模型名称</div>';
        return;
    }

    if (provider === 'openai-compatible' && !baseUrl) {
        resultEl.innerHTML = '<div style="padding: 12px; background: rgba(239, 68, 68, 0.1); color: var(--accent-red); border-radius: 8px;">❌ 需要填写 Base URL</div>';
        return;
    }

    // 显示测试中状态
    resultEl.innerHTML = '<div style="padding: 12px; background: rgba(255, 176, 0, 0.1); color: var(--accent-primary); border-radius: 8px;">⏳ 测试中...</div>';

    try {
        const response = await apiRequest('/test-ai', {
            method: 'POST',
            body: JSON.stringify({ provider, apiKey, baseUrl, model })
        });

        const data = response.data;
        const responseText = data.response || '';
        showToast(`测试成功！模型: ${data.model}`, 'success');
        resultEl.innerHTML = `<div style="padding: 12px; background: rgba(16, 185, 129, 0.1); color: var(--accent-green); border-radius: 8px;">✅ 测试成功！<br><span style="font-size: 13px;">模型: ${data.model} | 响应: ${responseText.substring(0, 40)}${responseText.length > 40 ? '...' : ''}</span></div>`;
    } catch (error) {
        showToast(`测试失败: ${error.message}`, 'error');
        resultEl.innerHTML = `<div style="padding: 12px; background: rgba(239, 68, 68, 0.1); color: var(--accent-red); border-radius: 8px;">❌ 测试失败: ${error.message}</div>`;
    }
}

// ========== 报告列表 ==========

// 刷新报告列表
document.getElementById('refreshReports')?.addEventListener('click', async () => {
    const btn = document.getElementById('refreshReports');
    const originalHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="btn-refresh-icon spinning">🔄</span><span>刷新中...</span>';
    try {
        await loadReports();
        showAlert('reports-tab', '✅ 报告列表已刷新', 'success');
    } catch (error) {
        showAlert('reports-tab', `❌ 刷新失败: ${error.message}`, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalHTML;
    }
});

// ========== 认证设置 ==========

async function loadAuthStatus() {
    const authStatusEl = document.getElementById('authStatus');
    const authDetailEl = document.getElementById('authDetail');

    // 如果元素不存在，直接返回
    if (!authStatusEl) return;

    try {
        const response = await apiRequest('/auth-status');
        const data = response.data;

        // 使用实际验证结果
        if (data.isValid) {
            authStatusEl.className = 'status-badge valid';
            authStatusEl.innerHTML = '<span class="status-badge-icon">✅</span><span>认证有效</span>';

            // 显示认证时间
            if (authDetailEl && data.createdAt) {
                const createdDate = new Date(data.createdAt);
                authDetailEl.innerHTML = `<p>认证时间: ${createdDate.toLocaleString('zh-CN')}</p>`;
                authDetailEl.style.display = 'block';
            } else if (authDetailEl) {
                authDetailEl.style.display = 'none';
            }
        } else {
            authStatusEl.className = 'status-badge invalid';
            let message = '需要同步认证';
            if (!data.hasCookies) {
                message = '缺少认证信息';
            } else if (data.validationError) {
                if (data.validationError.includes('401') || data.validationError.includes('登录') || data.validationError.includes('认证')) {
                    message = '认证已失效';
                } else if (data.validationError.includes('未配置项目')) {
                    message = '无法验证（未配置项目）';
                } else {
                    message = '验证失败';
                }
            }
            authStatusEl.innerHTML = `<span class="status-badge-icon">⚠️</span><span>${message}</span>`;

            // 显示错误详情
            if (authDetailEl && data.validationError) {
                authDetailEl.innerHTML = `<p style="color: var(--accent-red);">${data.validationError}</p>`;
                authDetailEl.style.display = 'block';
            } else if (authDetailEl) {
                authDetailEl.style.display = 'none';
            }
        }
    } catch (error) {
        console.error('加载认证状态失败:', error);
    }
}

// 一键自动同步
document.getElementById('autoSyncAuthBtn').addEventListener('click', async () => {
    const btn = document.getElementById('autoSyncAuthBtn');
    const authDetailEl = document.getElementById('authDetail');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '⏳ 正在同步...';

    try {
        const response = await apiRequest('/auto-sync-auth', { method: 'POST' });
        showAlert('settings-tab', '✅ 认证同步成功！', 'success');
        loadAuthStatus();
    } catch (error) {
        if (authDetailEl) {
            authDetailEl.innerHTML = `<p style="color: var(--accent-red);">❌ ${error.message}</p>`;
            authDetailEl.style.display = 'block';
        }
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
});

// 验证状态按钮
document.getElementById('syncAuthBtn').addEventListener('click', async () => {
    const btn = document.getElementById('syncAuthBtn');
    btn.disabled = true;
    btn.textContent = '⏳ 验证中...';

    await loadAuthStatus();

    btn.disabled = false;
    btn.textContent = '🔄 验证状态';
});

function generateBookmarkletCode() {
    const baseUrl = window.location.origin;
    return `javascript:(function(){` +
        // 域名校验
        `if(!location.hostname.includes('aliyun.com')){alert('❌ 请在阿里云 SLS 控制台页面 (sls.console.aliyun.com) 使用此书签！\\n\\n当前页面: '+location.hostname);return;}` +
        // 提取 cookies (document.cookie 无法获取 HttpOnly，但至少获取能拿到的)
        `var cookies={};` +
        `document.cookie.split(';').forEach(function(c){var parts=c.trim().split('=');if(parts[0])cookies[parts[0]]=decodeURIComponent(parts[1]||'')||'';});` +
        // 提取 CSRF/b3 — 多种来源
        `var csrfToken=document.querySelector('meta[name=csrf-token]')?.content||window.__CONTEXT__?.csrfToken||window.CSRF_TOKEN||window.csrfToken||null;` +
        `var b3=document.querySelector('meta[name=b3]')?.content||window.__CONTEXT__?.b3||window.B3||window.b3||null;` +
        // 拦截 XHR setRequestHeader 获取 CSRF/b3 (捕获不到 Cookie，因为是浏览器自动加的)
        `var _origOpen=XMLHttpRequest.prototype.open;` +
        `XMLHttpRequest.prototype.open=function(){this._reqHeaders={};return _origOpen.apply(this,arguments);};` +
        `var _origSetReq=XMLHttpRequest.prototype.setRequestHeader;` +
        `XMLHttpRequest.prototype.setRequestHeader=function(k,v){this._reqHeaders[k]=v;if(k.toLowerCase()==='x-csrf-token'&&!csrfToken)csrfToken=v;if(k.toLowerCase()==='b3'&&!b3)b3=v;return _origSetReq.apply(this,arguments);};` +
        // 发送到服务器
        `fetch('${baseUrl}/api/bookmark-sync',{` +
            `method:'POST',` +
            `headers:{'Content-Type':'application/json'},` +
            `body:JSON.stringify({cookies:cookies,url:location.href,referrer:document.referrer,csrfToken:csrfToken,b3:b3})` +
        `}).then(function(r){return r.json();}).then(function(data){` +
            `alert(data.success?(data.valid?'✅ 同步成功！认证有效':'⚠️ 已同步 '+Object.keys(cookies).length+' 个 Cookie，但验证未通过。\\n\\n可能原因：关键认证 Cookie 为 HttpOnly，JS 无法读取。\\n\\n解决办法：使用 cURL 方式（在 DevTools Network 面板复制 getLogs.json 请求）'):'❌ 同步失败：'+(data.error||'未知错误'));` +
        `}).catch(function(e){alert('❌ 请求失败：'+e.message);});` +
    `})();`;
}

// 初始化 bookmarklet
function initBookmarklet() {
    const link = document.getElementById('bookmarkletLink');
    if (link) {
        link.href = generateBookmarkletCode();
    }
}

// 复制书签代码
document.getElementById('copyBookmarkletBtn').addEventListener('click', async () => {
    try {
        await navigator.clipboard.writeText(generateBookmarkletCode());
        showToast('📋 书签代码已复制到剪贴板', 'success');
    } catch (err) {
        showToast('❌ 复制失败，请手动复制', 'error');
    }
});

document.getElementById('parseCurlBtn').addEventListener('click', async () => {
    const curlCommand = document.getElementById('curlInput').value.trim();

    if (!curlCommand) {
        showAlert('settings-tab', '请粘贴 curl 命令', 'error');
        return;
    }

    try {
        const parsed = parseCurlCommand(curlCommand);

        // 调试信息
        console.log('解析结果:', parsed);

        // 检查是否解析到有效数据
        const hasCookies = Object.keys(parsed.cookies).length > 0;
        const hasCsrf = !!parsed.csrfToken;

        if (!hasCookies && !hasCsrf) {
            showAlert('settings-tab', '⚠️ 未能从 curl 命令中解析出认证信息，请确认复制了完整的命令', 'error');
            return;
        }

        await apiRequest('/sync-auth', {
            method: 'POST',
            body: JSON.stringify(parsed)
        });

        document.getElementById('curlInput').value = '';

        showAlert('settings-tab', `✅ 认证信息已同步 (Cookies: ${Object.keys(parsed.cookies).length}, CSRF: ${hasCsrf ? '✓' : '✗'})`, 'success');
        loadAuthStatus();
    } catch (error) {
        console.error('同步错误:', error);
        showAlert('settings-tab', `❌ 同步失败: ${error.message}`, 'error');
    }
});

function parseCurlCommand(curl) {
    const result = {
        cookies: {},
        csrfToken: null,
        b3: null,
        region: 'cn-beijing'
    };

    // 先清理多行 curl 命令
    const cleanedCurl = curl.replace(/\\\s*\n/g, ' ').replace(/\s+/g, ' ');

    console.log('清理后的 curl:', cleanedCurl.substring(0, 200) + '...');

    // 解析 cookie - 支持多种格式
    const cookiePatterns = [
        /cookie:\s*'([^']+)'/i,
        /cookie:\s*"([^"]+)"/i,
        /cookie:\s*([^\s'"]+?)(?:\s|$)/i
    ];

    for (const pattern of cookiePatterns) {
        const cookieMatch = cleanedCurl.match(pattern);
        if (cookieMatch) {
            const cookieString = cookieMatch[1];
            const pairs = cookieString.split(';');
            pairs.forEach(pair => {
                const [key, ...valueParts] = pair.split('=');
                if (key && valueParts.length > 0) {
                    result.cookies[key.trim()] = valueParts.join('=').trim();
                }
            });
            console.log('解析到 cookies:', Object.keys(result.cookies).length);
            break;
        }
    }

    // 解析 x-csrf-token - 支持多种格式
    const csrfPatterns = [
        /x-csrf-token:\s*'([^']+)'/i,
        /x-csrf-token:\s*"([^"]+)"/i,
        /x-csrf-token:\s*([^\s'"]+)/i
    ];

    for (const pattern of csrfPatterns) {
        const csrfMatch = cleanedCurl.match(pattern);
        if (csrfMatch) {
            result.csrfToken = csrfMatch[1];
            console.log('解析到 csrfToken:', result.csrfToken);
            break;
        }
    }

    // 解析 b3
    const b3Patterns = [
        /b3:\s*'([^']+)'/i,
        /b3:\s*"([^"]+)"/i,
        /b3:\s*([^\s'"]+)/i
    ];

    for (const pattern of b3Patterns) {
        const b3Match = cleanedCurl.match(pattern);
        if (b3Match) {
            result.b3 = b3Match[1];
            console.log('解析到 b3:', result.b3);
            break;
        }
    }

    // 解析 region
    const regionMatch = cleanedCurl.match(/slRegion=([^&\s]+)/);
    if (regionMatch) {
        result.region = regionMatch[1];
        console.log('解析到 region:', result.region);
    }

    return result;
}

// ========== 初始化 ==========

async function init() {
    try {
        const response = await apiRequest('/config');
        state.config = response.data;
        state.projects = response.data.projects || {};

        // 更新 UI
        updateProjectSelect();

        // 加载 AI 配置
        const aiProviderSelect = document.getElementById('aiProvider');
        const aiApiKeyInput = document.getElementById('aiApiKey');
        const aiModelInput = document.getElementById('aiModel');
        const aiBaseUrlInput = document.getElementById('aiBaseUrl');

        if (state.config.aiProvider) {
            aiProviderSelect.value = state.config.aiProvider;
        }

        if (state.config.aiModel) {
            aiModelInput.value = state.config.aiModel;
        }

        if (state.config.aiBaseUrl) {
            aiBaseUrlInput.value = state.config.aiBaseUrl;
        }

        // 显示 API Key 占位符
        if (state.config.hasApiKey) {
            aiApiKeyInput.value = '•••••••••••••••';
            aiApiKeyInput.dataset.hasKey = 'true';
        }

        // 根据 AI 提供商设置 Base URL 输入框的显示状态
        const baseUrlGroup = document.getElementById('baseUrlGroup');
        if (aiProviderSelect.value === 'openai-compatible') {
            baseUrlGroup.style.display = 'block';
        } else {
            baseUrlGroup.style.display = 'none';
        }

        // 更新 AI 配置显示
        const aiConfigDisplay = document.getElementById('aiConfigDisplay');
        if (aiConfigDisplay) {
            const provider = state.config.aiProvider || '未配置';
            const model = state.config.aiModel || '未配置';
            const hasKey = state.config.hasApiKey;
            aiConfigDisplay.innerHTML = `
                <div style="display: flex; gap: 20px; flex-wrap: wrap;">
                    <div><strong>提供商:</strong> ${provider}</div>
                    <div><strong>模型:</strong> ${model}</div>
                    <div><strong>API Key:</strong> ${hasKey ? '✅ 已配置' : '❌ 未配置'}</div>
                </div>
            `;
        }

        // 检查认证状态
        loadAuthStatus();

        // 初始化 bookmarklet
        initBookmarklet();

        // 初始化模板选择器
        renderTemplateSelect();
    } catch (error) {
        console.error('初始化失败:', error);
    }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', init);

// 将需要在 HTML 中调用的函数暴露到全局作用域
window.deleteProject = deleteProject;
window.viewReport = viewReport;
window.deleteReport = deleteReport;
window.goToReportPage = goToReportPage;
