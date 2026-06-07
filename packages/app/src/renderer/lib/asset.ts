// 把 game/ 相对路径转成 asset:// URL（逐段编码，兼容空格 / 中文 / 特殊字符）
export const assetUrl = (rel: string): string =>
  'asset://game/' + rel.split('/').map(encodeURIComponent).join('/')
