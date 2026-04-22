// client-safe —— 只放不依赖 `fumadocs-core/source` (node:path) 的纯配置,
// 这样 __root.tsx 这种 root-level 客户端模块引用 i18nUI 时不会把 Node
// 内置模块拖进浏览器 bundle。真正的 `source`(loader 实例)在
// `./source-server.ts`,仅供 server fn / server handler 使用。

import { defineI18n } from 'fumadocs-core/i18n';
import { defineI18nUI } from 'fumadocs-ui/i18n';
import { createElement } from 'react';
import * as lucideIcons from 'lucide-react';

export const i18n = defineI18n({
  defaultLanguage: 'zh',
  languages: ['zh', 'en'],
  parser: 'dir',
  hideLocale: 'never',
});

// i18nUI.provider(lang) 生成 fumadocs-ui <RootProvider i18n=...> 需要的 shape,
// 里面含 locales 列表 + 每种语言的 displayName。RootProvider 必须拿到这份
// 配置,否则 DocsLayout 里的 LanguageSelect 会抛 Missing <I18nProvider />。
export const i18nUI = defineI18nUI(i18n, {
  translations: {
    zh: { displayName: '中文' },
    en: { displayName: 'English' },
  },
});

// IconResolver:把 frontmatter / meta.json 里的 `icon: "Rocket"` 字符串
// 映射到 lucide-react 的 React 组件。未命中时返回 undefined,fumadocs-ui
// 会退化到「无图标」。loader({ icon: resolveIcon }) 在 source-server.ts 里。
export function resolveIcon(name: string | undefined) {
  if (!name) return;
  const icon = (lucideIcons as Record<string, unknown>)[name];
  if (typeof icon === 'function' || typeof icon === 'object') {
    return createElement(icon as React.ComponentType);
  }
}
