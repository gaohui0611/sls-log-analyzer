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
            <div class="toast-message">${message}</div>
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

document.getElementById('analyzeBtn').addEventListener('click', async () => {
    const projectId = document.getElementById('projectSelect').value;
    const timeRange = document.getElementById('timeRangeSelect').value;
    const query = document.getElementById('queryInput').value.trim();
    const size = parseInt(document.getElementById('sizeSelect').value);
    const customPrompt = document.getElementById('customPromptInput')?.value.trim() || ''; // 获取自定义prompt

    if (!projectId) {
        showAlert('analyze-tab', '请先选择一个项目', 'error');
        return;
    }

    showLoading('analyzeLoading');
    document.getElementById('analyzeResult').innerHTML = '';

    try {
        const response = await apiRequest('/analyze', {
            method: 'POST',
            body: JSON.stringify({ projectId, timeRange, query, size, customPrompt }) // 传递自定义prompt
        });

        renderAnalysisResult(response.data);
    } catch (error) {
        showAlert('analyze-tab', `❌ 分析失败: ${error.message}`, 'error');
    } finally {
        hideLoading('analyzeLoading');
    }
});

function renderAnalysisResult(data) {
    const container = document.getElementById('analyzeResult');

    let html = `
    <div class="card" style="margin-top: 30px;">
      <h3>📊 分析结果</h3>
      <div class="report-item">
        <div class="header">
          <div>
            <div class="title">${data.projectName} / ${data.logStoreName}</div>
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
          <span class="param-value">${data.size || 100}</span>
        </div>
      </div>
    </div>
  `;

    // 统计信息
    if (data.stats) {
        html += `
      <div class="card">
        <h3>📈 日志统计</h3>
        <div style="display: flex; gap: 20px; flex-wrap: wrap;">
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
        // 错误列表
        if (data.stats.errors && data.stats.errors.length > 0) {
            html += `
        <h4 style="margin-top: 20px;">⚠️ 错误 (${data.stats.errors.length})</h4>
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

    // AI 分析
    if (data.aiAnalysis && data.aiAnalysis.content) {
        html += `
      <div class="card">
        <h3>🤖 AI 智能分析</h3>
        <div class="markdown-content">${renderMarkdown(data.aiAnalysis.content)}</div>
      </div>
    `;
    }

    // 分析依据的日志详情
    if (data.logs && data.logs.length > 0) {
        html += `
      <div class="card">
        <h3>📋 分析依据日志详情 (前10条)</h3>
        <div style="max-height: 500px; overflow-y: auto;">
    `;
        data.logs.slice(0, 10).forEach((log, index) => {
            const level = (log.level || log.LEVEL || 'INFO').toUpperCase();
            const message = log.content || log.message || log.msg || '';
            const time = log.__time__ ? new Date(log.__time__ * 1000).toLocaleString('zh-CN') : '-';
            const traceId = log.TID || log.traceId || log.trace_id || '';
            const userId = log.userId || log.user_id || '';
            
            html += `
          <div class="log-entry ${level.toLowerCase()}" style="margin-bottom: 12px; padding: 12px; background: var(--apple-gray-6); border-radius: 8px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
              <span style="font-weight: 600;">日志 #${index + 1}</span>
              <span class="tag tag-${level.toLowerCase()}">${level}</span>
            </div>
            <div style="font-size: 12px; color: var(--apple-text-secondary); margin-bottom: 4px;">
              🕐 ${time}
            </div>
            ${traceId ? `<div style="font-size: 12px; color: var(--apple-text-secondary); margin-bottom: 4px;">🔗 TraceID: ${traceId}</div>` : ''}
            ${userId ? `<div style="font-size: 12px; color: var(--apple-text-secondary); margin-bottom: 4px;">👤 UserID: ${userId}</div>` : ''}
            <div style="margin-top: 8px; padding: 8px; background: rgba(0,0,0,0.03); border-radius: 4px; font-family: monospace; font-size: 13px; white-space: pre-wrap; word-break: break-all;">
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

    container.innerHTML = html;
}

function renderMarkdown(text) {
    return text
        .replace(/###\s(.+)/g, '<h3>$1</h3>')
        .replace(/##\s(.+)/g, '<h2>$1</h2>')
        .replace(/#\s(.+)/g, '<h1>$1</h1>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/`(.+?)`/g, '<code>$1</code>')
        .replace(/\n/g, '<br>');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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
    // 先切换到分析标签页
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelector('[data-tab="analyze"]').classList.add('active');
    document.getElementById('analyze-tab').classList.add('active');

    // 立即显示加载状态
    const container = document.getElementById('analyzeResult');
    container.innerHTML = `
        <div class="card" style="margin-top: 30px; text-align: center; padding: 40px;">
            <div class="report-loading active">
                <div class="spinner"></div>
            </div>
            <p style="margin-top: 20px; color: #666;">正在加载报告详情...</p>
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
    <div style="padding: 15px; background: #d1ecf1; color: #0c5460; border-radius: 10px;">
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
      <div style="padding: 15px; background: #d4edda; color: #155724; border-radius: 10px;">
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
      <div style="padding: 15px; background: #f8d7da; color: #721c24; border-radius: 10px;">
        <h4 style="margin: 0 0 10px 0;">❌ 连接测试失败</h4>
        <div style="font-size: 0.9rem;">
          <div><strong>错误:</strong> ${error.message}</div>
          ${error.details ? `<div style="margin-top: 10px;"><strong>详情:</strong><pre style="background: rgba(0,0,0,0.1); padding: 10px; border-radius: 5px; overflow-x: auto; margin-top: 5px;">${JSON.stringify(error.details, null, 2)}</pre></div>` : ''}
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
            <div style="color: var(--apple-green);">✅ 连接成功</div>
            <div style="margin-top: 8px; font-size: 13px; color: var(--apple-text-secondary);">
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
    resultEl.innerHTML = '<div style="padding: 12px; background: #e3f2fd; color: #fff; border-radius: 8px;">⏳ 保存中...</div>';

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
        resultEl.innerHTML = '<div style="padding: 12px; background: #fff3cd; color: #856404; border-radius: 8px;">📝 请输入 API Key 进行测试（留空则保存时使用已保存的 Key）</div>';
        return;
    }

    if (!model) {
        resultEl.innerHTML = '<div style="padding: 12px; background: #f8d7da; color: #721c24; border-radius: 8px;">❌ 请填写模型名称</div>';
        return;
    }

    if (provider === 'openai-compatible' && !baseUrl) {
        resultEl.innerHTML = '<div style="padding: 12px; background: #f8d7da; color: #721c24; border-radius: 8px;">❌ 需要填写 Base URL</div>';
        return;
    }

    // 显示测试中状态
    resultEl.innerHTML = '<div style="padding: 12px; background: #e3f2fd; color: #0c5460; border-radius: 8px;">⏳ 测试中...</div>';

    try {
        const response = await apiRequest('/test-ai', {
            method: 'POST',
            body: JSON.stringify({ provider, apiKey, baseUrl, model })
        });

        const data = response.data;
        const responseText = data.response || '';
        showToast(`测试成功！模型: ${data.model}`, 'success');
        resultEl.innerHTML = `<div style="padding: 12px; background: #d4edda; color: #155724; border-radius: 8px;">✅ 测试成功！<br><span style="font-size: 13px;">模型: ${data.model} | 响应: ${responseText.substring(0, 40)}${responseText.length > 40 ? '...' : ''}</span></div>`;
    } catch (error) {
        showToast(`测试失败: ${error.message}`, 'error');
        resultEl.innerHTML = `<div style="padding: 12px; background: #f8d7da; color: #721c24; border-radius: 8px;">❌ 测试失败: ${error.message}</div>`;
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
                authDetailEl.innerHTML = `<p style="color: var(--apple-red);">${data.validationError}</p>`;
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
            authDetailEl.innerHTML = `<p style="color: var(--apple-red);">❌ ${error.message}</p>`;
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
