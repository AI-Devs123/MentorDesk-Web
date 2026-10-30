/** 侧边栏折叠状态的持久化 key 与读取工具。
 * 从 Sidebar 拆分到独立模块，避免该组件文件因同时导出常量而触发
 * react-refresh/only-export-components。 */
const COLLAPSED_KEY = 'nexusmind_sidebar_collapsed';

function loadCollapsed(): boolean {
  return localStorage.getItem(COLLAPSED_KEY) === 'true';
}

export { loadCollapsed, COLLAPSED_KEY };
