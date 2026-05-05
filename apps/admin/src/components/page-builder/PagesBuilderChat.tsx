/**
 * Left-pane chat for the AI page builder.
 *
 * Drives the `pages-builder` agent (apps/server/src/modules/admin-agent/
 * agents/pages-builder.ts) over the same `/api/v1/ai/admin/chat`
 * SSE endpoint as form-fill / global-assistant. The differences:
 *   - `agentName: "pages-builder"`
 *   - `context.pageProjectId` carried in every request (route handler
 *     rejects without it)
 *   - No mention popover, no patch-card UX — every tool runs
 *     server-side (`execute`), so the chat just renders text +
 *     compact tool-call summaries.
 *
 * Persisted history comes from `/api/v1/page/{projectId}/conversations`
 * (workspace route hands it in as `initialMessages`). We don't
 * re-persist on the client — the server's `/chat` handler writes new
 * messages itself when it wires the agent up (PR 8 follow-up; for now
 * the agent run streams to the user but doesn't yet write to
 * page_project_conversations on every turn — the AIAssistPanel
 * persistence is local to admin-agent module).
 */

import * as React from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { ArrowUpIcon, Bot, SquareIcon, User } from "lucide-react";
import { toast } from "sonner";

import {
  Conversation,
  ConversationEmptyState,
  Message,
  MessageContent,
  Response,
} from "#/components/ai-elements";
import { Button } from "#/components/ui/button";
import { Textarea } from "#/components/ui/textarea";
import { cn } from "#/lib/utils";

const ENDPOINT = "/api/v1/ai/admin/chat";

interface ToolPart {
  type: string;
  toolCallId?: string;
  state?:
    | "input-streaming"
    | "input-available"
    | "output-available"
    | "output-error";
  input?: unknown;
  output?: unknown;
  errorText?: string;
}

export function PagesBuilderChat(props: {
  projectId: string;
  initialMessages: UIMessage[];
}) {
  const { projectId, initialMessages } = props;

  const transport = React.useMemo(
    () =>
      new DefaultChatTransport({
        api: ENDPOINT,
        credentials: "include",
        prepareSendMessagesRequest: ({ messages, body }) => ({
          body: {
            ...(body ?? {}),
            messages,
            agentName: "pages-builder",
            context: {
              // pages-builder ignores surface; we still send "dashboard"
              // because the route validator requires a valid AdminSurface.
              surface: "dashboard",
              pageProjectId: projectId,
            },
          },
        }),
      }),
    [projectId],
  );

  const { messages, sendMessage, status, error, stop } = useChat({
    messages: initialMessages,
    transport,
    onError: (err) => {
      console.error("[pages-builder]", err);
      toast.error(`AI 助手出错：${err.message}`);
    },
  });

  React.useEffect(() => {
    if (error) {
      toast.error(error.message);
    }
  }, [error]);

  const [input, setInput] = React.useState("");
  const isStreaming = status === "submitted" || status === "streaming";

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput("");
    void sendMessage({ text });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      onSubmit(e as unknown as React.FormEvent);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <Conversation className="px-3 py-3">
        {messages.length === 0 ? (
          <ConversationEmptyState
            title={
              <span className="flex items-center justify-center gap-2">
                <Bot className="size-5 text-muted-foreground" />
                跟 AI 描述你想要的活动页
              </span>
            }
            description={
              <span>
                例如：「做一个春节签到页，绑 check-in
                模块，主色用红色，加一个排行榜」
              </span>
            }
          />
        ) : (
          messages.map((msg) => (
            <RenderedMessage key={msg.id} msg={msg} />
          ))
        )}
        {isStreaming ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Bot className="size-3 animate-pulse" />
            正在生成…
          </div>
        ) : null}
      </Conversation>

      <form
        onSubmit={onSubmit}
        className="border-t bg-background p-2 flex gap-2 items-end"
      >
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="描述你想要的页面 / 修改…"
          rows={2}
          className="resize-none"
          disabled={isStreaming}
        />
        {isStreaming ? (
          <Button type="button" size="icon" variant="outline" onClick={stop}>
            <SquareIcon className="size-4" />
          </Button>
        ) : (
          <Button type="submit" size="icon" disabled={!input.trim()}>
            <ArrowUpIcon className="size-4" />
          </Button>
        )}
      </form>
    </div>
  );
}

function RenderedMessage({ msg }: { msg: UIMessage }) {
  if (msg.role === "system") return null;
  const role = msg.role === "user" ? "user" : "assistant";

  return (
    <Message from={role}>
      {role === "assistant" ? (
        <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted">
          <Bot className="size-4" />
        </div>
      ) : null}
      <div className="flex flex-col gap-1.5 max-w-[85%]">
        {msg.parts.map((part, i): React.ReactNode => {
          if (part.type === "text") {
            return (
              <MessageContent key={i} variant="contained">
                <Response>{(part as { text: string }).text}</Response>
              </MessageContent>
            );
          }
          if (typeof part.type === "string" && part.type.startsWith("tool-")) {
            return (
              <MessageContent key={i} variant="flat" className="w-full">
                <ToolCard part={part as unknown as ToolPart} />
              </MessageContent>
            );
          }
          return null;
        })}
      </div>
      {role === "user" ? (
        <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted">
          <User className="size-4" />
        </div>
      ) : null}
    </Message>
  );
}

function ToolCard({ part }: { part: ToolPart }) {
  const toolName = part.type.replace(/^tool-/, "");
  const stateColor =
    part.state === "output-available"
      ? "border-emerald-500/40 bg-emerald-500/10"
      : part.state === "output-error"
        ? "border-rose-500/40 bg-rose-500/10"
        : "border-amber-500/40 bg-amber-500/10";
  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2 text-xs space-y-1",
        stateColor,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono">{toolName}</span>
        <span className="text-[10px] uppercase tracking-wide opacity-70">
          {part.state ?? "calling"}
        </span>
      </div>
      {part.state === "output-error" && part.errorText ? (
        <p className="text-rose-200">{part.errorText}</p>
      ) : null}
      {/* Show a summary line — operators don't need the full payload
          inline (they can inspect via DevTools / version timeline). */}
      <ToolSummary toolName={toolName} part={part} />
    </div>
  );
}

function ToolSummary({
  toolName,
  part,
}: {
  toolName: string;
  part: ToolPart;
}) {
  // Only worth surfacing for the proposeDraft / publish / rollback
  // flows — most other tools (list*) are silent infra.
  const out = part.output as
    | {
        ok?: boolean;
        versionId?: string;
        versionNumber?: number;
        publishedVersionId?: string;
        message?: string;
      }
    | undefined;
  if (toolName === "proposePageDraft") {
    if (out?.ok === false) {
      return <p className="text-rose-200">{out.message ?? "schema 校验失败"}</p>;
    }
    if (out?.versionNumber) {
      return <p>已生成 v{out.versionNumber} 草稿</p>;
    }
  }
  if (toolName === "publishVersion" && out?.publishedVersionId) {
    return <p>已发布 → 子域立即生效</p>;
  }
  if (toolName === "rollbackToVersion" && out?.versionNumber) {
    return <p>已回滚为 v{out.versionNumber}</p>;
  }
  return null;
}
