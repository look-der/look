/* ============================================================
   展示前端逻辑
   - 拉取分类与作品，渲染卡片网格与筛选
   - 点击卡片打开详情弹窗（图片预览 + 文件下载）
   ============================================================ */
(function () {
  const $ = (sel) => document.querySelector(sel);
  const grid = $('#grid');
  const filtersEl = $('#filters');
  const emptyEl = $('#empty');
  const modal = $('#modal');
  const modalBody = $('#modalBody');

  let categories = [];      // [{id,name,desc}]
  let projects = [];        // 全部作品
  let activeCat = 'all';

  const catName = (id) => (categories.find((c) => c.id === id) || {}).name || id;

  // 文件类型 -> 图标样式类与文字
  const TYPE_META = {
    image: { cls: 'fi-image', label: 'IMG' },
    pdf: { cls: 'fi-pdf', label: 'PDF' },
    cad: { cls: 'fi-cad', label: 'CAD' },
    doc: { cls: 'fi-doc', label: 'DOC' },
    office: { cls: 'fi-office', label: 'OFF' },
    zip: { cls: 'fi-zip', label: 'ZIP' },
    file: { cls: 'fi-file', label: 'FILE' }
  };

  function fmtSize(bytes) {
    if (!bytes && bytes !== 0) return '';
    const mb = bytes / 1024 / 1024;
    if (mb >= 1) return mb.toFixed(1) + ' MB';
    return (bytes / 1024).toFixed(0) + ' KB';
  }

  // ---------- 渲染分类筛选 ----------
  function renderFilters() {
    const all = [{ id: 'all', name: '全部' }].concat(categories);
    filtersEl.innerHTML = all
      .map(
        (c) =>
          `<button class="filter ${c.id === activeCat ? 'active' : ''}" data-cat="${c.id}">${c.name}</button>`
      )
      .join('');
    filtersEl.querySelectorAll('.filter').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeCat = btn.dataset.cat;
        renderFilters();
        renderGrid();
      });
    });
  }

  // ---------- 渲染卡片网格 ----------
  function renderGrid() {
    const list =
      activeCat === 'all' ? projects : projects.filter((p) => p.category === activeCat);

    if (!list.length) {
      grid.innerHTML = '';
      emptyEl.hidden = false;
      return;
    }
    emptyEl.hidden = true;
    grid.innerHTML = list
      .map((p) => {
        const cover = p.cover
          ? `<img src="${p.cover}" alt="${escapeHtml(p.title)}" loading="lazy" />`
          : `<span>暂无封面</span>`;
        const tags = (p.tags || [])
          .slice(0, 2)
          .map((t) => `<span class="tag">${escapeHtml(t)}</span>`)
          .join('');
        return `
        <article class="card" data-id="${p.id}">
          <div class="card-cover">${cover}<span class="card-badge">${catName(p.category)}</span></div>
          <div class="card-body">
            <h3 class="card-title">${escapeHtml(p.title)}</h3>
            <p class="card-summary">${escapeHtml(p.summary || '点击查看详情')}</p>
            <div class="card-meta">
              <span>${tags || '<span class="tag">作品</span>'}</span>
              <span>${(p.files || []).length} 个文件</span>
            </div>
          </div>
        </article>`;
      })
      .join('');

    grid.querySelectorAll('.card').forEach((card) => {
      card.addEventListener('click', () => openModal(card.dataset.id));
    });
  }

  // ---------- 详情弹窗 ----------
  function openModal(id) {
    const p = projects.find((x) => x.id === id);
    if (!p) return;
    const images = (p.files || []).filter((f) => f.type === 'image');
    const gallery = images.length
      ? `<div class="modal-gallery">${images
          .map((f) => `<img src="${f.url}" alt="${escapeHtml(f.name)}" />`)
          .join('')}</div>`
      : '';
    const fileRows = (p.files || []).length
      ? `<ul class="file-list">${p.files
          .map((f) => {
            const m = TYPE_META[f.type] || TYPE_META.file;
            return `
            <li class="file-item">
              <span class="file-icon ${m.cls}">${m.label}</span>
              <span class="file-name">${escapeHtml(f.name)}</span>
              <span class="file-size">${fmtSize(f.size)}</span>
              <a class="file-dl" href="${f.url}" target="_blank" rel="noopener" download>下载</a>
            </li>`;
          })
          .join('')}</ul>`
      : `<p class="modal-desc">该作品暂未附文件。</p>`;

    const coverBlock = p.cover
      ? `<img class="modal-cover" src="${p.cover}" alt="${escapeHtml(p.title)}" />`
      : `<div class="modal-cover-ph"></div>`;

    modalBody.innerHTML = `
      ${coverBlock}
      <div class="modal-content">
        <h2 class="modal-title">${escapeHtml(p.title)}</h2>
        <div><span class="modal-cat">${catName(p.category)}</span><span class="modal-date">${escapeHtml(p.date || '')}</span></div>
        ${gallery}
        <p class="modal-desc">${escapeHtml(p.description || p.summary || '')}</p>
        <h3 style="font-size:16px;margin:0 0 12px;">附件（${p.files ? p.files.length : 0}）</h3>
        ${fileRows}
      </div>`;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    modal.hidden = true;
    document.body.style.overflow = '';
  }
  modal.addEventListener('click', (e) => {
    if (e.target.hasAttribute('data-close')) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) closeModal();
  });

  // ---------- 工具 ----------
  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  // ---------- 初始化 ----------
  async function init() {
    $('#year').textContent = new Date().getFullYear();
    try {
      categories = await fetch('/api/categories').then((r) => r.json());
    } catch (e) {
      categories = [];
    }
    renderFilters();

    try {
      projects = await fetch('/api/projects').then((r) => r.json());
    } catch (e) {
      grid.innerHTML = '<div class="loading">数据加载失败，请确认服务已启动。</div>';
      return;
    }
    renderGrid();
  }

  init();
})();
