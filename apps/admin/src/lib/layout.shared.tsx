import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';

export const baseOptions: BaseLayoutProps = {
  nav: {
    title: 'ApolloKit Docs',
  },
  githubUrl: 'https://github.com/dengzhaofun/apollokit',
  i18n: true,
  links: [
    { text: '首页', url: '/' },
    { text: '控制台', url: '/dashboard' },
    { text: 'OpenAPI', url: '/openapi.json' },
  ],
};
