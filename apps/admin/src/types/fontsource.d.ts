/**
 * @fontsource-variable/* 包默认导出的是 CSS 副作用 import,没有 TS 类型。
 * 这里声明 ambient module 让 TS check 通过。
 *
 * 影响范围:src/routes/__root.tsx 里的 3 个字体 import。
 */
declare module "@fontsource-variable/inter"
declare module "@fontsource-variable/noto-sans-sc"
declare module "@fontsource-variable/jetbrains-mono"
declare module "@fontsource-variable/geist"
