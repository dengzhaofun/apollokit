import { Badge } from "#/components/ui/badge"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select"
import * as m from "#/paraglide/messages.js"
import {
  getLinkRouteDefinition,
  LINK_ROUTES,
  type InternalRoute,
  type LinkAction,
  type LinkActionKind,
  validateLinkAction,
} from "#/lib/types/link"

interface LinkActionEditorProps {
  label?: string
  value: LinkAction
  onChange: (next: LinkAction) => void
}

/**
 * Editor for a `LinkAction` value (see lib/types/link.ts). Used by banner
 * creation/edit and dialogue option editors — do not fork this for a
 * specific module, keep the ergonomics consistent everywhere.
 */
export function LinkActionEditor({
  label,
  value,
  onChange,
}: LinkActionEditorProps) {
  const validationError = validateLinkAction(value)

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          {label ?? m.link_action()}
        </Label>
        <Select
          value={value.type}
          onValueChange={(v) => onChange(defaultForKind(v as LinkActionKind))}
        >
          <SelectTrigger className="h-8 w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{m.link_none()}</SelectItem>
            <SelectItem value="external">{m.link_external()}</SelectItem>
            <SelectItem value="internal">{m.link_internal()}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {value.type === "external" ? (
        <ExternalEditor value={value} onChange={onChange} />
      ) : value.type === "internal" ? (
        <InternalEditor value={value} onChange={onChange} />
      ) : null}

      {validationError ? (
        <p className="text-xs text-destructive">{validationError}</p>
      ) : null}
    </div>
  )
}

function defaultForKind(kind: LinkActionKind): LinkAction {
  switch (kind) {
    case "none":
      return { type: "none" }
    case "external":
      return { type: "external", url: "", openIn: "_blank" }
    case "internal":
      return { type: "internal", route: "home", params: {} }
  }
}

function ExternalEditor({
  value,
  onChange,
}: {
  value: Extract<LinkAction, { type: "external" }>
  onChange: (next: LinkAction) => void
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <div className="col-span-2 space-y-1">
        <Label className="text-xs">{m.link_url()}</Label>
        <Input
          placeholder={m.link_action_url_placeholder()}
          value={value.url}
          onChange={(e) => onChange({ ...value, url: e.target.value })}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">{m.link_open_in()}</Label>
        <Select
          value={value.openIn ?? "_blank"}
          onValueChange={(v) =>
            onChange({ ...value, openIn: v as "_blank" | "_self" })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_blank">{m.link_open_blank()}</SelectItem>
            <SelectItem value="_self">{m.link_open_self()}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

function InternalEditor({
  value,
  onChange,
}: {
  value: Extract<LinkAction, { type: "internal" }>
  onChange: (next: LinkAction) => void
}) {
  const def = getLinkRouteDefinition(value.route)
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label className="text-xs">{m.link_route()}</Label>
        <Select
          value={value.route}
          onValueChange={(v) =>
            onChange({
              type: "internal",
              route: v as InternalRoute,
              params: {}, // reset params whenever route changes
            })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LINK_ROUTES.map((r) => (
              <SelectItem key={r.route} value={r.route}>
                <span>{r.label}</span>
                {r.status === "pending" ? (
                  <Badge variant="outline" className="ml-2">
                    {m.link_pending_badge()}
                  </Badge>
                ) : null}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {def && def.params.length > 0 ? (
        <div className="space-y-2">
          {def.params.map((spec) => {
            const current = value.params?.[spec.key] ?? ""
            return (
              <div key={spec.key} className="space-y-1">
                <Label className="text-xs">
                  {spec.key}
                  {spec.optional ? "" : " *"}
                </Label>
                <Input
                  value={current}
                  placeholder={spec.type === "uuid" ? m.link_param_hint_uuid() : ""}
                  onChange={(e) => {
                    const nextParams = { ...(value.params ?? {}) }
                    if (e.target.value) nextParams[spec.key] = e.target.value
                    else delete nextParams[spec.key]
                    onChange({ ...value, params: nextParams })
                  }}
                />
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
