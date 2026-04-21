import { docs } from 'collections/server';
import { loader } from 'fumadocs-core/source';
import type { I18nConfig } from 'fumadocs-core/i18n';

export const i18n: I18nConfig = {
  defaultLanguage: 'zh',
  languages: ['zh', 'en'],
  // 'dir' 表示 content/docs/zh/ 与 content/docs/en/ 两个并列根
  parser: 'dir',
  // 始终在 URL 上展示 locale(/docs/zh/..., /docs/en/...),避免与默认语言相关的 rewrite
  hideLocale: 'never',
};

export const source = loader({
  baseUrl: '/docs',
  source: docs.toFumadocsSource(),
  i18n,
});
