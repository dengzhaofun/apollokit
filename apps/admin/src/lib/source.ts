import { docs } from 'collections/server';
import { loader } from 'fumadocs-core/source';
import type { I18nConfig } from 'fumadocs-core/i18n';
import { createElement } from 'react';
import * as lucideIcons from 'lucide-react';

export const i18n: I18nConfig = {
  defaultLanguage: 'zh',
  languages: ['zh', 'en'],
  parser: 'dir',
  hideLocale: 'never',
};

// IconResolver:把 frontmatter / meta.json 里的 `icon: "Rocket"` 字符串
// 映射到 lucide-react 的 React 组件。未命中时返回 undefined,fumadocs-ui
// 会自动退化到「无图标」状态。
function resolveIcon(name: string | undefined) {
  if (!name) return;
  const icon = (lucideIcons as Record<string, unknown>)[name];
  if (typeof icon === 'function' || typeof icon === 'object') {
    return createElement(icon as React.ComponentType);
  }
}

export const source = loader({
  baseUrl: '/docs',
  source: docs.toFumadocsSource(),
  i18n,
  icon: resolveIcon,
});
