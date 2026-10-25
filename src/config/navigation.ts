/**
 * 导航配置 —— 新增业务页面只需在此加一项，并在路由表中注册对应组件
 *
 * 顺序即侧边栏展示顺序（日记沙箱为第一项）
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
    label: '日记沙箱',
    icon: '📝',
    title: '日记沙箱 · Journal Sandbox',
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
