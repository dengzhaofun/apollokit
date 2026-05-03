/**
 * Ask-AI 浮动面板 —— 挂在 docs 页面右下角,点开后侧拉一个对话面板。
 *
 * 跟 fumadocs CLI 默认生成的版本(Next.js + 自带 button)相比,这里
 * 三处改动:
 *   1. buttonVariants 用 admin 自家的 `variant` 系(default/secondary/
 *      ghost/outline/destructive/link),不是 CLI 模板里的 `color`;
 *   2. cn 来自 `#/lib/utils`,跟其他业务组件保持一致;
 *   3. useChat sendMessage 时把 `data-locale` part 注入,后端
 *      `routes/api/v1/chat.ts` 据此分片 Orama 索引。
 */
'use client';
import {
  type ComponentProps,
  createContext,
  type ReactNode,
  type SyntheticEvent,
  use,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Loader2,
  MessageCircleIcon,
  RefreshCw,
  SearchIcon,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import { cn } from '#/lib/utils';
import { buttonVariants } from '#/components/ui/button';
import { useChat, type UseChatHelpers } from '@ai-sdk/react';
import { DefaultChatTransport, type Tool, type UIToolInvocation } from 'ai';
import { Markdown } from './markdown';
import * as Presence from '@radix-ui/react-presence';
import type { ChatUIMessage, SearchDocsTool } from '#/routes/api/v1/chat';

const Context = createContext<{
  open: boolean;
  setOpen: (open: boolean) => void;
  chat: UseChatHelpers<ChatUIMessage>;
  locale: string;
} | null>(null);

function useAISearchContext() {
  const ctx = use(Context);
  if (!ctx) throw new Error('AISearch components must be wrapped in <AISearch />');
  return ctx;
}

function useChatContext() {
  return useAISearchContext().chat;
}

export function AISearchPanelHeader({
  className,
  ...props
}: ComponentProps<'div'>) {
  const { setOpen } = useAISearchContext();

  return (
    <div
      className={cn(
        'sticky top-0 flex items-start gap-2 border rounded-xl bg-fd-secondary text-fd-secondary-foreground shadow-sm',
        className,
      )}
      {...props}
    >
      <div className="px-3 py-2 flex-1">
        <p className="text-sm font-medium mb-2">Ask AI</p>
        <p className="text-xs text-fd-muted-foreground">
          AI may be inaccurate — verify important details against the docs.
        </p>
      </div>

      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        className={cn(
          buttonVariants({
            size: 'icon-sm',
            variant: 'ghost',
            className: 'text-fd-muted-foreground rounded-full',
          }),
        )}
        onClick={() => setOpen(false)}
      >
        <X />
      </button>
    </div>
  );
}

export function AISearchInputActions() {
  const { messages, status, setMessages, regenerate } = useChatContext();
  const isLoading = status === 'streaming';

  if (messages.length === 0) return null;

  return (
    <>
      {!isLoading && messages.at(-1)?.role === 'assistant' && (
        <button
          type="button"
          className={cn(
            buttonVariants({
              variant: 'secondary',
              size: 'sm',
              className: 'rounded-full gap-1.5',
            }),
          )}
          onClick={() => regenerate()}
        >
          <RefreshCw className="size-4" />
          Retry
        </button>
      )}
      <button
        type="button"
        className={cn(
          buttonVariants({
            variant: 'secondary',
            size: 'sm',
            className: 'rounded-full',
          }),
        )}
        onClick={() => setMessages([])}
      >
        Clear
      </button>
    </>
  );
}

const StorageKeyInput = '__ai_search_input';
export function AISearchInput(props: ComponentProps<'form'>) {
  const { status, sendMessage, stop } = useChatContext();
  const { locale } = useAISearchContext();
  const [input, setInput] = useState(() =>
    typeof window === 'undefined'
      ? ''
      : (window.localStorage.getItem(StorageKeyInput) ?? ''),
  );
  const isLoading = status === 'streaming' || status === 'submitted';
  const onStart = (e?: SyntheticEvent) => {
    e?.preventDefault();
    const message = input.trim();
    if (message.length === 0) return;

    void sendMessage({
      role: 'user',
      parts: [
        {
          type: 'data-locale',
          // 后端读这里来决定搜索哪个语种的索引,以及用什么语言答题。
          // pathname 不是必须,留着将来给系统提示词加“当前阅读哪一页”用。
          data: { locale, pathname: typeof location === 'undefined' ? undefined : location.pathname },
        },
        {
          type: 'text',
          text: message,
        },
      ],
    });
    setInput('');
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(StorageKeyInput);
    }
  };

  useEffect(() => {
    if (isLoading) document.getElementById('nd-ai-input')?.focus();
  }, [isLoading]);

  return (
    <form
      {...props}
      className={cn('flex items-start pe-2', props.className)}
      onSubmit={onStart}
    >
      <Input
        value={input}
        placeholder={isLoading ? 'AI is answering…' : 'Ask a question'}
        autoFocus
        className="p-3"
        disabled={isLoading}
        onChange={(e) => {
          setInput(e.target.value);
          if (typeof window !== 'undefined') {
            window.localStorage.setItem(StorageKeyInput, e.target.value);
          }
        }}
        onKeyDown={(event) => {
          if (!event.shiftKey && event.key === 'Enter') {
            onStart(event);
          }
        }}
      />
      {isLoading ? (
        <button
          key="bn"
          type="button"
          className={cn(
            buttonVariants({
              variant: 'secondary',
              className: 'transition-all rounded-full mt-2 gap-2',
            }),
          )}
          onClick={() => stop()}
        >
          <Loader2 className="size-4 animate-spin text-fd-muted-foreground" />
          Stop
        </button>
      ) : (
        <button
          key="bn"
          type="submit"
          className={cn(
            buttonVariants({
              variant: 'default',
              className: 'transition-all rounded-full mt-2',
            }),
          )}
          disabled={input.length === 0}
        >
          <Send className="size-4" />
        </button>
      )}
    </form>
  );
}

function List(props: Omit<ComponentProps<'div'>, 'dir'>) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    function callback() {
      const container = containerRef.current;
      if (!container) return;

      container.scrollTo({
        top: container.scrollHeight,
        behavior: 'instant',
      });
    }

    const observer = new ResizeObserver(callback);
    callback();

    const element = containerRef.current?.firstElementChild;

    if (element) {
      observer.observe(element);
    }

    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      {...props}
      className={cn(
        'fd-scroll-container overflow-y-auto min-w-0 flex flex-col',
        props.className,
      )}
    >
      {props.children}
    </div>
  );
}

function Input(props: ComponentProps<'textarea'>) {
  const ref = useRef<HTMLDivElement>(null);
  const shared = cn('col-start-1 row-start-1', props.className);

  return (
    <div className="grid flex-1">
      <textarea
        id="nd-ai-input"
        {...props}
        className={cn(
          'resize-none bg-transparent placeholder:text-fd-muted-foreground focus-visible:outline-none',
          shared,
        )}
      />
      <div ref={ref} className={cn(shared, 'break-all invisible')}>
        {`${props.value?.toString() ?? ''}\n`}
      </div>
    </div>
  );
}

const roleName: Record<string, string> = {
  user: 'You',
  assistant: 'ApolloKit',
};

function Message({
  message,
  ...props
}: { message: ChatUIMessage } & ComponentProps<'div'>) {
  let markdown = '';
  const searchCalls: UIToolInvocation<SearchDocsTool>[] = [];

  for (const part of message.parts ?? []) {
    if (part.type === 'text') {
      markdown += part.text;
      continue;
    }

    if (part.type.startsWith('tool-')) {
      const toolName = part.type.slice('tool-'.length);
      const p = part as UIToolInvocation<Tool>;

      if (toolName !== 'search_docs' || !p.toolCallId) continue;
      searchCalls.push(p as UIToolInvocation<SearchDocsTool>);
    }
  }

  return (
    <div onClick={(e) => e.stopPropagation()} {...props}>
      <p
        className={cn(
          'mb-1 text-sm font-medium text-fd-muted-foreground',
          message.role === 'assistant' && 'text-fd-primary',
        )}
      >
        {roleName[message.role] ?? 'unknown'}
      </p>
      <div className="prose prose-sm dark:prose-invert max-w-none text-sm">
        <Markdown text={markdown} />
      </div>

      {searchCalls.map((call) => {
        const output = call.output as
          | { results?: { url: string }[] }
          | undefined;
        return (
          <div
            key={call.toolCallId}
            className="flex flex-row gap-2 items-center mt-3 rounded-lg border bg-fd-secondary text-fd-muted-foreground text-xs p-2"
          >
            <SearchIcon className="size-4" />
            {call.state === 'output-error' || call.state === 'output-denied' ? (
              <p className="text-fd-error">{call.errorText ?? 'Failed to search'}</p>
            ) : (
              <p>
                {!output
                  ? 'Searching docs…'
                  : `${output.results?.length ?? 0} doc snippets`}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function AISearch({
  children,
  locale = 'zh',
}: {
  children: ReactNode;
  locale?: string;
}) {
  const [open, setOpen] = useState(false);
  const chat = useChat<ChatUIMessage>({
    id: 'docs-ask-ai',
    transport: new DefaultChatTransport({
      api: '/api/v1/chat',
    }),
  });

  return (
    <Context
      value={useMemo(
        () => ({ chat, open, setOpen, locale }),
        [chat, open, locale],
      )}
    >
      {children}
    </Context>
  );
}

export function AISearchTrigger({
  position = 'default',
  className,
  children,
  ...props
}: ComponentProps<'button'> & { position?: 'default' | 'float' }) {
  const { open, setOpen } = useAISearchContext();

  return (
    <button
      type="button"
      data-state={open ? 'open' : 'closed'}
      className={cn(
        position === 'float' && [
          'fixed bottom-4 right-4 z-20 flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium shadow-lg',
          'bg-primary text-primary-foreground hover:bg-primary/90 transition-[translate,opacity]',
          open && 'translate-y-10 opacity-0 pointer-events-none',
        ],
        className,
      )}
      onClick={() => setOpen(!open)}
      {...props}
    >
      {children ?? (
        <>
          <Sparkles className="size-4" />
          Ask AI
        </>
      )}
    </button>
  );
}

export function AISearchPanel() {
  const { open, setOpen } = useAISearchContext();
  useHotKey();

  return (
    <>
      <style>{`
        @keyframes ask-ai-open {
          from { translate: 100% 0; }
          to { translate: 0 0; }
        }
        @keyframes ask-ai-close {
          from { width: var(--ai-chat-width); }
          to { width: 0px; }
        }
      `}</style>
      <Presence.Presence present={open}>
        <div
          data-state={open ? 'open' : 'closed'}
          className="fixed inset-0 z-30 backdrop-blur-xs bg-fd-overlay data-[state=open]:animate-fd-fade-in data-[state=closed]:animate-fd-fade-out lg:hidden"
          onClick={() => setOpen(false)}
        />
      </Presence.Presence>
      <Presence.Presence present={open}>
        <div
          className={cn(
            'overflow-hidden z-30 bg-fd-card text-fd-card-foreground [--ai-chat-width:400px] 2xl:[--ai-chat-width:460px]',
            'max-lg:fixed max-lg:inset-x-2 max-lg:inset-y-4 max-lg:border max-lg:rounded-2xl max-lg:shadow-xl',
            'lg:fixed lg:right-0 lg:top-0 lg:h-dvh lg:border-s lg:shadow-xl',
            open
              ? 'animate-fd-dialog-in lg:animate-[ask-ai-open_200ms]'
              : 'animate-fd-dialog-out lg:animate-[ask-ai-close_200ms]',
          )}
        >
          <div className="flex flex-col size-full p-2 lg:p-3 lg:w-(--ai-chat-width)">
            <AISearchPanelHeader />
            <AISearchPanelList className="flex-1" />
            <div className="rounded-xl border bg-fd-secondary text-fd-secondary-foreground shadow-sm has-focus-visible:shadow-md">
              <AISearchInput />
              <div className="flex items-center gap-1.5 p-1 empty:hidden">
                <AISearchInputActions />
              </div>
            </div>
          </div>
        </div>
      </Presence.Presence>
    </>
  );
}

export function AISearchPanelList({
  className,
  style,
  ...props
}: ComponentProps<'div'>) {
  const chat = useChatContext();
  const messages = chat.messages.filter((msg) => msg.role !== 'system');

  return (
    <List
      className={cn('py-4 overscroll-contain', className)}
      style={{
        maskImage:
          'linear-gradient(to bottom, transparent, white 1rem, white calc(100% - 1rem), transparent 100%)',
        ...style,
      }}
      {...props}
    >
      {messages.length === 0 ? (
        <div className="text-sm text-fd-muted-foreground/80 size-full flex flex-col items-center justify-center text-center gap-2">
          <MessageCircleIcon fill="currentColor" stroke="none" />
          <p onClick={(e) => e.stopPropagation()}>Ask anything about ApolloKit.</p>
        </div>
      ) : (
        <div className="flex flex-col px-3 gap-4">
          {chat.error && (
            <div className="p-2 bg-fd-secondary text-fd-secondary-foreground border rounded-lg">
              <p className="text-xs text-fd-muted-foreground mb-1">
                Request Failed: {chat.error.name}
              </p>
              <p className="text-sm">{chat.error.message}</p>
            </div>
          )}
          {messages.map((item) => (
            <Message key={item.id} message={item} />
          ))}
        </div>
      )}
    </List>
  );
}

function useHotKey() {
  const { open, setOpen } = useAISearchContext();

  useEffect(() => {
    function onKeyPress(e: KeyboardEvent) {
      if (e.key === 'Escape' && open) {
        setOpen(false);
        e.preventDefault();
        return;
      }

      if (e.key === '/' && (e.metaKey || e.ctrlKey) && !open) {
        setOpen(true);
        e.preventDefault();
      }
    }

    window.addEventListener('keydown', onKeyPress);
    return () => window.removeEventListener('keydown', onKeyPress);
  }, [open, setOpen]);
}
