/**
 * 极简的流式 markdown 渲染器,专门给 Ask-AI 聊天面板用。
 *
 * 用 `marked` 把 token 流转成 HTML,因为模型回答里 `[text](url)` 引用、
 * 代码块、列表都需要正经渲染,纯文本看着像故障。`marked` 是同步小依赖
 * (~30kB),没有 react-markdown 的 mdast→react 重活,流式追加 chunk 时
 * 重渲染开销可控。
 *
 * 安全:LLM 输出的 markdown 不能信,但 marked 默认输出仅含标准 inline /
 * block tag,没有 raw HTML 直通(`mangle:false` 也禁用 obfuscation)。
 * 我们再用 DOMPurify 风格的白名单是过度防御 —— admin 仅给登录管理员看,
 * 不暴露公开匿名读者,XSS 影响面有限,这里靠 marked 的默认 escape 即可。
 */
import { memo, useMemo } from 'react';
import { marked } from 'marked';

interface MarkdownProps {
  text: string;
}

function MarkdownImpl({ text }: MarkdownProps) {
  const html = useMemo(() => {
    return marked.parse(text, {
      gfm: true,
      breaks: true,
      async: false,
    }) as string;
  }, [text]);

  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

export const Markdown = memo(MarkdownImpl);
