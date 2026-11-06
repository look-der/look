/* ============================================================
   管理后台逻辑
   - 登录拿 token（存 localStorage）
   - 新增 / 编辑 / 删除作品，支持多文件上传与删除
   ============================================================ */
(function () {
  const $ = (s) => document.querySelector(s);
  const TOKEN_KEY = 'portfolio_admin_token';

  const loginBox = $('#loginBox');
  const panelBox = $('#panelBox');
  const loginMsg = $('#loginMsg');
  const formMsg = $('#formMsg');
  const form = $('#projectForm');
  const categorySel = $('#category');
  const existingFilesEl = $('#existingFiles');
  const filesInput = $('#files');
  const drop = $('#drop');

  let token = localStorage.getItem(TOKEN_KEY) || '';
  let categories = [];
  let projects = [];
  let editingId = null;
  let removeList = []; // 编辑时待删除的文件 url

  // ---------- 鉴权头 ----------
  const authHeader = () => ({ Authorization: 'Bearer ' + token });

  // ---------- 消息 ----------
  function showMsg(el, text, ok) {
    el.textContent = text;
    el.className = 'msg ' + (ok ? 'ok' : 'err');
  }
  function clearMsg(el) { el.className = 'msg'; el.textContent = ''; }

  // ---------- 登录 ----------
  async function doLogin() {
    clearMsg(loginMsg);
    const password = $('#password').value;
    if (!password) { showMsg(loginMsg, '请输入密码', false); return; }
    try {
      const r = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const data = await r.json();
      if (!r.ok) { showMsg(loginMsg, data.error || '登录失败', false); return; }
      token = data.token;
      localStorage.setItem(TOKEN_KEY, token);
      enterPanel();
    } catch (e) {
      showMsg(loginMsg, '网络错误：' + e.message, false);
    }
  }

  function logout() {
    token = '';
    localStorage.removeItem(TOKEN_KEY);
    panelBox.classList.add('hidden');
    loginBox.classList.remove('hidden');
    $('#password').value = '';
  }

  // ---------- 进入面板 ----------
  async function enterPanel() {
    loginBox.classList.add('hidden');
    panelBox.classList.remove('hidden');
    await loadCategories();
    await loadProjects();
  }

  async function loadCategories() {
    categories = await fetch('/api/categories').then((r) => r.json());
    categorySel.innerHTML = categories
      .map((c) => `<option value="${c.id}">${c.name}</option>`)
      .join('');
  }

  async function loadProjects() {
    projects = await fetch('/api/projects').then((r) => r.json());
    $('#count').textContent = projects.length;
    const list = $('#list');
    if (!projects.length) {
      list.innerHTML = '<p style="color:var(--ink-soft);font-size:14px;">还没有作品，先在上方添加一条吧。</p>';
      return;
    }
    list.innerHTML = projects
      .map((p) => {
        const cat = (categories.find((c) => c.id === p.category) || {}).name || p.category;
        return `
        <div class="list-item">
          <div class="li-main">
            <div class="li-title">${escapeHtml(p.title)}</div>
            <div class="li-meta">${cat} · ${p.date || ''} · ${(p.files || []).length} 个文件</div>
          </div>
          <div class="li-actions">
            <button class="mini-btn" data-edit="${p.id}">编辑</button>
            <button class="mini-btn danger" data-del="${p.id}">删除</button>
          </div>
        </div>`;
      })
      .join('');
    list.querySelectorAll('[data-edit]').forEach((b) =>
      b.addEventListener('click', () => startEdit(b.dataset.edit))
    );
    list.querySelectorAll('[data-del]').forEach((b) =>
      b.addEventListener('click', () => deleteProject(b.dataset.del))
    );
  }

  // ---------- 表单：新增 / 编辑 ----------
  function resetForm() {
    editingId = null;
    removeList = [];
    form.reset();
    $('#projId').value = '';
    $('#formHeading').textContent = '新增作品';
    $('#submitBtn').textContent = '提交作品';
    existingFilesEl.innerHTML = '';
    clearMsg(formMsg);
  }

  function startEdit(id) {
    const p = projects.find((x) => x.id === id);
    if (!p) return;
    editingId = id;
    removeList = [];
    $('#projId').value = id;
    $('#title').value = p.title || '';
    $('#category').value = p.category || categories[0].id;
    $('#date').value = p.date || '';
    $('#summary').value = p.summary || '';
    $('#tags').value = (p.tags || []).join(', ');
    $('#description').value = p.description || '';
    $('#formHeading').textContent = '编辑作品';
    $('#submitBtn').textContent = '保存修改';
    renderExistingFiles(p.files || []);
    clearMsg(formMsg);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderExistingFiles(files) {
    existingFilesEl.innerHTML = files
      .filter((f) => !removeList.includes(f.url))
      .map(
        (f) => `
        <div class="ef-item">
          <span class="ef-name">${escapeHtml(f.name)}</span>
          <a class="file-dl" href="${f.url}" target="_blank" rel="noopener">查看</a>
          <span class="ef-remove" data-url="${f.url}">移除</span>
        </div>`
      )
      .join('');
    existingFilesEl.querySelectorAll('.ef-remove').forEach((el) =>
      el.addEventListener('click', () => {
        removeList.push(el.dataset.url);
        renderExistingFiles(files);
      })
    );
  }

  // ---------- 提交 ----------
  async function submitForm(e) {
    e.preventDefault();
    clearMsg(formMsg);
    const fd = new FormData();
    fd.append('title', $('#title').value.trim());
    fd.append('category', $('#category').value);
    fd.append('date', $('#date').value.trim());
    fd.append('summary', $('#summary').value.trim());
    fd.append('tags', $('#tags').value.trim());
    fd.append('description', $('#description').value.trim());

    const fileList = filesInput.files;
    for (let i = 0; i < fileList.length; i++) fd.append('files', fileList[i]);

    const isEdit = !!editingId;
    if (isEdit) fd.append('removeFiles', JSON.stringify(removeList));

    const url = isEdit ? '/api/projects/' + editingId : '/api/projects';
    const method = isEdit ? 'PUT' : 'POST';

    try {
      const r = await fetch(url, {
        method,
        headers: authHeader(),
        body: fd
      });
      const data = await r.json();
      if (!r.ok) {
        if (r.status === 401) { showMsg(formMsg, '登录已失效，请重新登录', false); logout(); }
        else showMsg(formMsg, data.error || '提交失败', false);
        return;
      }
      showMsg(formMsg, isEdit ? '已保存修改' : '作品已添加', true);
      resetForm();
      await loadProjects();
    } catch (err) {
      showMsg(formMsg, '网络错误：' + err.message, false);
    }
  }

  async function deleteProject(id) {
    const p = projects.find((x) => x.id === id);
    if (!p) return;
    if (!confirm('确定删除《' + p.title + '》及其所有附件吗？此操作不可恢复。')) return;
    try {
      const r = await fetch('/api/projects/' + id, { method: 'DELETE', headers: authHeader() });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        if (r.status === 401) { showMsg(formMsg, '登录已失效，请重新登录', false); logout(); }
        else alert(d.error || '删除失败');
        return;
      }
      await loadProjects();
    } catch (e) {
      alert('网络错误：' + e.message);
    }
  }

  // ---------- 文件选择（点击 + 拖拽） ----------
  drop.addEventListener('click', () => filesInput.click());
  filesInput.addEventListener('change', () => {
    drop.textContent = filesInput.files.length
      ? '已选择 ' + filesInput.files.length + ' 个文件（可再次点击追加）'
      : '点击选择文件，或把文件拖到这里';
  });
  ['dragover', 'dragenter'].forEach((ev) =>
    drop.addEventListener(ev, (e) => { e.preventDefault(); drop.style.borderColor = 'var(--accent)'; })
  );
  ['dragleave', 'drop'].forEach((ev) =>
    drop.addEventListener(ev, (e) => { e.preventDefault(); drop.style.borderColor = ''; })
  );
  drop.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    if (dt && dt.files.length) {
      filesInput.files = dt.files;
      drop.textContent = '已选择 ' + dt.files.length + ' 个文件';
    }
  });

  // ---------- 工具 ----------
  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  // ---------- 绑定 ----------
  $('#loginBtn').addEventListener('click', doLogin);
  $('#password').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
  $('#logoutBtn').addEventListener('click', logout);
  $('#resetBtn').addEventListener('click', resetForm);
  form.addEventListener('submit', submitForm);

  // 若已登录则直接进入
  if (token) enterPanel();
})();
