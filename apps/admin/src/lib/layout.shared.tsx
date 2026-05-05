import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';

/**
 * `links` 上的 url 是个静态字符串,fumadocs 不会按 locale 自动改写。
 * 所以直接写 `/docs/zh/api` 在英文站点击会跳到中文页,体验拧巴。
 *
 * 折中方案:把 baseOptions 改成 `getBaseOptions(locale)` 工厂,在
 * docs/$.tsx 拿到当前 locale 后调用,得到一份 OpenAPI 入口指向
 * 当前 locale 的 props。其他地方(主页/控制台等等如果将来也要嵌
 * docs layout)同样可以传 locale。
 */
type Locale = 'zh' | 'en';

const TOP_LINK_LABELS: Record<Locale, { home: string; dashboard: string; featureMap: string }> = {
  zh: { home: '首页', dashboard: '控制台', featureMap: '功能全景' },
  en: { home: 'Home', dashboard: 'Dashboard', featureMap: 'Features' },
};

export function getBaseOptions(locale: Locale = 'zh'): BaseLayoutProps {
  const labels = TOP_LINK_LABELS[locale];
  return {
    nav: {
      title: 'ApolloKit Docs',
    },
    githubUrl: 'https://github.com/dengzhaofun/apollokit',
    i18n: true,
    links: [
      { text: labels.home, url: '/' },
      { text: labels.dashboard, url: '/dashboard' },
      { text: labels.featureMap, url: `/docs/${locale}/feature-map` },
      // OpenAPI 入口跟随当前 locale,英文站不会被甩到中文目录。
      { text: 'OpenAPI', url: `/docs/${locale}/api` },
    ],
  };
}

/**
 * 兼容旧调用方:不知道 locale 时退回到默认中文。等所有调用方迁完
 * 就可以删了。
 */
export const baseOptions: BaseLayoutProps = getBaseOptions();
