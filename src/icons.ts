declare const GLINT_ICON_NAMES: string[];
declare global { interface Window { glintIconTags?: Record<string, string[]> } }

const names = new Set(GLINT_ICON_NAMES);
const aliases: Record<string, string> = {
  sliders: 'sliders-horizontal', bolt: 'zap', chevron: 'chevron-right',
  close: 'x', up: 'chevron-up', down: 'chevron-down',
  stop: 'square', refresh: 'refresh-cw'
};
export function iconName(name: string): string {
  const normalized = names.has(name) ? name : aliases[name] || name;
  return names.has(normalized) ? normalized : 'sparkles';
}
export function icon(name: string): string {
  return '<span class="icon lucide-' + iconName(name) + '" aria-hidden="true"></span>';
}
export function brandIcon(): string {
  return '<span class="icon glint-mark" aria-hidden="true"></span>';
}

const favorites = [
  'languages', 'sparkles', 'pen', 'search', 'copy', 'clipboard', 'book-open', 'file-text',
  'text-quote', 'spell-check', 'list', 'list-checks', 'code', 'terminal', 'braces', 'regex',
  'message-circle', 'brain', 'wand-sparkles', 'lightbulb', 'globe', 'link', 'external-link', 'send',
  'notebook-pen', 'bookmark', 'star', 'heart', 'calculator', 'image', 'volume-2', 'zap'
].filter(name => names.has(name));
const chineseKeywords: Record<string, string> = {
  '翻译 语言 外语': 'languages', '解释 智能 思考 大脑': 'brain sparkles lightbulb',
  '润色 改写 编辑 写作 笔': 'pen pencil spell-check', '搜索 查找 放大镜': 'search',
  '复制 剪贴板 粘贴': 'copy clipboard', '文本 文字 字体': 'text type letter',
  '阅读 书籍 字典': 'book', '文件 文档 论文 摘要': 'file text',
  '代码 编程 开发': 'code braces terminal regex', '列表 总结 清单': 'list',
  '聊天 对话 消息': 'message chat', '链接 网址': 'link', '网页 网络 浏览器 地球': 'globe network',
  '发送 分享': 'send share', '收藏 喜欢 星星': 'star heart bookmark',
  '设置 调整': 'settings sliders', '下载 导出': 'download', '上传 导入': 'upload',
  '图片 照片 图像': 'image camera', '声音 朗读 音乐 播放': 'volume audio music play',
  '视频 录像': 'video', '计算 数学': 'calculator sigma', '时间 时钟 历史': 'clock history',
  '日历 日期': 'calendar', '任务 完成 检查': 'check list', '删除 清除': 'trash eraser',
  '工具 扳手': 'wrench tool', '安全 锁 密码': 'lock shield key', '用户 人员': 'user person',
  '文件夹 目录': 'folder', '邮件 信件': 'mail', '地图 位置': 'map location pin',
  '刷新 同步': 'refresh repeat', '运行 快捷 闪电': 'zap bolt', '终止 停止': 'square stop',
  '箭头 方向': 'arrow chevron', '表格 数据': 'table chart database', '笔记 记录': 'notebook sticky-note',
  '格式 排版': 'align indent type', '调色 外观 颜色': 'palette paint', '帮助 问题': 'help question'
};

let catalogPromise: Promise<Record<string, string[]>> | undefined;
function loadCatalog() {
  if (!catalogPromise) catalogPromise = new Promise<Record<string, string[]>>((resolve, reject) => {
    if (window.glintIconTags) { resolve(window.glintIconTags); return; }
    const script = document.createElement('script');
    script.src = './icon-catalog.js';
    script.onload = () => { script.remove(); resolve(window.glintIconTags || {}); };
    script.onerror = () => { script.remove(); catalogPromise = undefined; reject(new Error('图标索引加载失败')); };
    document.head.append(script);
  });
  return catalogPromise;
}

// A modal keeps the action editor compact and gives keyboard users a focus trap.
export function openIconPicker(current: string, onSelect: (name: string) => void) {
  const dialog = document.createElement('dialog');
  dialog.className = 'icon-dialog';
  dialog.setAttribute('aria-labelledby', 'icon-dialog-title');
  dialog.innerHTML = `<header class="icon-dialog-header"><h2 id="icon-dialog-title">选择图标</h2><span>Lucide · ${names.size} 个</span><button class="icon-button" data-picker-close aria-label="关闭图标选择">${icon('x')}</button></header>
    <div class="icon-dialog-search"><input type="search" data-icon-search placeholder="搜索：翻译、代码、book…" aria-label="搜索图标" autocomplete="off" autofocus></div>
    <div class="icon-dialog-tabs"><button data-icon-tab="common" aria-pressed="true">常用</button><button data-icon-tab="all" aria-pressed="false">全部图标</button></div>
    <div class="icon-library-grid" aria-label="图标"></div>
    <footer class="icon-dialog-footer"><span role="status"></span><div><button class="icon-button" data-picker-prev aria-label="上一页">${icon('chevron-left')}</button><span data-picker-page></span><button class="icon-button" data-picker-next aria-label="下一页">${icon('chevron-right')}</button></div></footer>`;
  document.body.append(dialog);
  const search = dialog.querySelector<HTMLInputElement>('[data-icon-search]')!;
  const grid = dialog.querySelector<HTMLElement>('.icon-library-grid')!;
  const counter = dialog.querySelector<HTMLElement>('[role=status]')!;
  let tags: Record<string, string[]> = {};
  let all = false;
  let page = 0;
  const pageSize = 32;
  let results: string[] = [];
  function renderGrid() {
    const query = search.value.trim().toLowerCase();
    const terms = query.split(/\s+/).filter(Boolean);
    const synonyms = Object.entries(chineseKeywords).filter(([keys]) => terms.some(term => keys.includes(term))).flatMap(([, words]) => words.split(' '));
    results = query ? GLINT_ICON_NAMES.filter(name => {
      const haystack = name.replaceAll('-', ' ') + ' ' + name + ' ' + (tags[name] || []).join(' ');
      return terms.every(term => haystack.includes(term)) || synonyms.some(term => haystack.includes(term));
    }) : all ? GLINT_ICON_NAMES : favorites;
    const pages = Math.max(1, Math.ceil(results.length / pageSize));
    page = Math.max(0, Math.min(page, pages - 1));
    grid.replaceChildren();
    for (const name of results.slice(page * pageSize, (page + 1) * pageSize)) {
      const button = document.createElement('button');
      button.className = 'library-icon' + (name === iconName(current) ? ' selected' : '');
      button.dataset.pickIcon = name; button.title = name;
      button.setAttribute('aria-label', name);
      button.setAttribute('aria-pressed', String(name === iconName(current)));
      button.innerHTML = icon(name);
      const label = document.createElement('span'); label.className = 'library-icon-name'; label.textContent = name;
      button.append(label); grid.append(button);
    }
    if (!results.length) { const empty = document.createElement('p'); empty.className = 'icon-library-empty'; empty.textContent = '没有找到图标，试试英文名称或更短的关键词。'; grid.append(empty); }
    counter.textContent = results.length + ' 个图标';
    dialog.querySelector('[data-picker-page]')!.textContent = (page + 1) + ' / ' + pages;
    (dialog.querySelector('[data-picker-prev]') as HTMLButtonElement).disabled = page === 0;
    (dialog.querySelector('[data-picker-next]') as HTMLButtonElement).disabled = page === pages - 1;
    dialog.querySelectorAll<HTMLButtonElement>('[data-icon-tab]').forEach(button => button.setAttribute('aria-pressed', String((button.dataset.iconTab === 'all') === all)));
  }
  search.addEventListener('input', () => { page = 0; renderGrid(); });
  dialog.addEventListener('click', event => {
    const button = (event.target as Element).closest<HTMLButtonElement>('button');
    if (!button || button.disabled) return;
    if (button.dataset.pickIcon) { onSelect(button.dataset.pickIcon); dialog.close(); }
    else if ('pickerClose' in button.dataset) dialog.close();
    else if (button.dataset.iconTab) { all = button.dataset.iconTab === 'all'; search.value = ''; page = 0; renderGrid(); }
    else if ('pickerPrev' in button.dataset) { page--; renderGrid(); }
    else if ('pickerNext' in button.dataset) { page++; renderGrid(); }
  });
  dialog.addEventListener('keydown', event => {
    if (!(event.target instanceof HTMLElement) || !event.target.dataset.pickIcon) return;
    const offset = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -8, ArrowDown: 8 } as Record<string, number>)[event.key];
    if (offset === undefined) return;
    event.preventDefault();
    const buttons = [...grid.querySelectorAll<HTMLButtonElement>('button')];
    buttons[Math.max(0, Math.min(buttons.length - 1, buttons.indexOf(event.target as HTMLButtonElement) + offset))]?.focus();
  });
  dialog.addEventListener('close', () => { dialog.remove(); document.querySelector<HTMLButtonElement>('[data-open-icon-picker]')?.focus(); });
  renderGrid(); dialog.showModal();
  void loadCatalog().then(data => { tags = data; if (dialog.isConnected) renderGrid(); }).catch(() => {
    if (dialog.isConnected) counter.textContent = '索引加载失败，仍可按名称搜索';
  });
}
