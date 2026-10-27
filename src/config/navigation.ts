/**
 * 导航配置 —— 新增业务页面只需在此加一项，并在路由表中注册对应组件
 *
 * 顺序即侧边栏展示顺序（日记沙盒为第一项）
 */
export interface NavItem {
  /** 路由路径（与路由表 path 一致） */
  path: string;
  /** 侧边栏显示名称 */
  label: string;
  /** 图标（emoji，折叠态仅显示图标 + title 提示） */
  icon: string;
  /** 页面标题（布局头部显示） */
  title: string;
}

export const NAV_ITEMS: NavItem[] = [
  {
    path: '/sandbox/journal',
    label: '日记沙盒',
    icon: '📝',
    title: '日记沙盒 · Journal Sandbox',
  },
  {
    path: '/sandbox/cognitive',
    label: '认知沙盒',
    icon: '🧩',
    title: '认知工作流沙盒 · Cognitive Workflow Sandbox',
  },
  {
    path: '/sandbox/code-analysis',
    label: '代码分析',
    icon: '🧠',
    title: '代码分析沙盒 · Code Analysis Sandbox',
  },
  {
    path: '/sandbox/web-curate',
    label: '网页萃取',
    icon: '🌐',
    title: '网页知识萃取沙盒 · Web Curate Sandbox',
  },
  {
    path: '/',
    label: '执行控制台',
    icon: '🖥️',
    title: 'NexusMind Supervisor 控制台',
  },
];

/** 根据路径匹配导航项（支持首页 index 路由） */
export function findNavItem(pathname: string): NavItem | undefined {
  return NAV_ITEMS.find((item) => item.path === pathname);
}
