export const KB_CONFIG = {
  INDEX_APP_TOKEN: process.env.KB_INDEX_APP_TOKEN || '',
  INDEX_TABLE_ID: process.env.KB_INDEX_TABLE_ID || '',
  CATEGORIES: ['开发知识', '行业资料', '产品信息', '业务产出'] as const,
} as const;

export type Category = (typeof KB_CONFIG.CATEGORIES)[number];
