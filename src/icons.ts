declare const GLINT_ICON_NAMES: string[];
declare global { interface Window { glintIconTags?: Record<string, string[]> } }

const names = new Set(GLINT_ICON_NAMES);
export const iconCount = names.size;
const aliases: Record<string, string> = {
  sliders: 'sliders-horizontal', bolt: 'zap', chevron: 'chevron-right',
  close: 'x', up: 'chevron-up', down: 'chevron-down',
  stop: 'square', refresh: 'refresh-cw'
};
export function iconName(name: string): string {
  const normalized = names.has(name) ? name : aliases[name] || name;
  return names.has(normalized) ? normalized : 'sparkles';
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
export function findIcons(query: string, all: boolean, tags: Record<string, string[]>) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return all ? GLINT_ICON_NAMES : favorites;
  const synonyms = Object.entries(chineseKeywords).filter(([keys]) => terms.some(term => keys.includes(term))).flatMap(([, words]) => words.split(' '));
  return GLINT_ICON_NAMES.filter(name => {
    const haystack = name.replaceAll('-', ' ') + ' ' + name + ' ' + (tags[name] || []).join(' ');
    return terms.every(term => haystack.includes(term)) || synonyms.some(term => haystack.includes(term));
  });
}
export function loadCatalog() {
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
