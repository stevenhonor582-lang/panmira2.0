import { defineRouting } from 'next-intl/routing';
export const routing = defineRouting({
  locales: ['zh', 'en', 'ru'],
  defaultLocale: 'zh',
  localePrefix: 'never' as const  // 非路由式：URL 不变，locale 走 cookie
});
