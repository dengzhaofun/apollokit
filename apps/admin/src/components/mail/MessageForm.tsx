import { useState } from "react"

import * as m from "#/paraglide/messages.js"
import { RewardEntryEditor } from "#/components/rewards/RewardEntryEditor"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import { Textarea } from "#/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select"
import { Switch } from "#/components/ui/switch"
import type { CreateMailInput, MailTargetType } from "#/lib/types/mail"
import type { RewardEntry } from "#/lib/types/rewards"

interface MessageFormProps {
  onSubmit: (values: CreateMailInput) => void | Promise<void>
  isPending?: boolean
  submitLabel?: string
}

export function MessageForm({
  onSubmit,
  isPending,
  submitLabel,
}: MessageFormProps) {
  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [targetType, setTargetType] = useState<MailTargetType>("broadcast")
  const [recipientsRaw, setRecipientsRaw] = useState("")
  const [requireRead, setRequireRead] = useState(false)
  const [expiresAt, setExpiresAt] = useState("")
  const [entries, setEntries] = useState<RewardEntry[]>([])
  const [error, setError] = useState("")

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")

    if (!title.trim() || !content.trim()) {
      setError(m.mail_error_title_content_required())
      return
    }

    const rewards = entries.filter((e) => e.id && e.count > 0)

    let targetUserIds: string[] | undefined = undefined
    if (targetType === "multicast") {
      targetUserIds = recipientsRaw
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean)
      if (targetUserIds.length === 0) {
        setError(m.mail_error_recipients_required())
        return
      }
    }

    const payload: CreateMailInput = {
      title: title.trim(),
      content: content.trim(),
      rewards,
      targetType,
      targetUserIds,
      requireRead,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
    }
    void onSubmit(payload)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="mail-title">{m.mail_field_title()} *</Label>
        <Input
          id="mail-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="mail-content">{m.mail_field_content()} *</Label>
        <Textarea
          id="mail-content"
          rows={6}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          maxLength={10_000}
        />
      </div>

      <div className="space-y-2">
        <Label>{m.mail_field_target_type()} *</Label>
        <Select
          value={targetType}
          onValueChange={(v) => setTargetType(v as MailTargetType)}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="broadcast">
              {m.mail_target_broadcast()}
            </SelectItem>
            <SelectItem value="multicast">
              {m.mail_target_multicast()}
            </SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {m.mail_field_target_hint()}
        </p>
      </div>

      {targetType === "multicast" && (
        <div className="space-y-2">
          <Label htmlFor="mail-recipients">{m.mail_field_recipients()} *</Label>
          <Textarea
            id="mail-recipients"
            rows={4}
            value={recipientsRaw}
            onChange={(e) => setRecipientsRaw(e.target.value)}
            placeholder="user-1, user-2&#10;user-3"
          />
          <p className="text-xs text-muted-foreground">
            {m.mail_field_recipients_hint()}
          </p>
        </div>
      )}

      <RewardEntryEditor
        label={m.mail_field_rewards()}
        entries={entries}
        onChange={setEntries}
        hint={m.mail_field_rewards_hint()}
      />

      <div className="flex items-center justify-between rounded-lg border p-3">
        <div className="space-y-0.5">
          <Label>{m.mail_field_require_read()}</Label>
          <p className="text-xs text-muted-foreground">
            {m.mail_field_require_read_hint()}
          </p>
        </div>
        <Switch checked={requireRead} onCheckedChange={setRequireRead} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="mail-expires">{m.mail_field_expires_at()}</Label>
        <Input
          id="mail-expires"
          type="datetime-local"
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          {m.mail_field_expires_at_hint()}
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" disabled={isPending}>
        {isPending ? m.common_loading() : (submitLabel ?? m.common_create())}
      </Button>
    </form>
  )
}
