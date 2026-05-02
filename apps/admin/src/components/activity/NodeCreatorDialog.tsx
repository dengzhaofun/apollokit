import { useState } from "react"
import { toast } from "sonner"

import { ConfigForm as CheckInConfigForm } from "#/components/check-in/ConfigForm"
import { useConfigForm as useCheckInForm } from "#/components/check-in/use-config-form"
import { GroupForm as BannerGroupForm } from "#/components/banner/GroupForm"
import { useGroupForm as useBannerGroupForm } from "#/components/banner/use-group-form"
import { LotteryPoolForm } from "#/components/lottery/PoolForm"
import { useLotteryPoolForm } from "#/components/lottery/use-pool-form"
import { DefinitionForm as TaskDefinitionForm } from "#/components/task/DefinitionForm"
import { ProductForm as ShopProductForm } from "#/components/shop/ProductForm"
import { useProductForm as useShopProductForm } from "#/components/shop/use-product-form"
import { LeaderboardConfigForm } from "#/components/leaderboard/ConfigForm"
import { useLeaderboardForm } from "#/components/leaderboard/use-config-form"
import { BlueprintForm as EntityBlueprintForm } from "#/components/entity/BlueprintForm"
import { DefinitionForm as ItemDefinitionForm } from "#/components/item/DefinitionForm"
import { DefinitionForm as CurrencyDefinitionForm } from "#/components/currency/DefinitionForm"
import { useDefinitionForm as useCurrencyDefinitionForm } from "#/components/currency/use-definition-form"
import { AssistPoolConfigForm } from "#/components/assist-pool/ConfigForm"
import { useAssistPoolForm } from "#/components/assist-pool/use-config-form"
import { Button } from "#/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select"
import { useCreateActivityNode } from "#/hooks/use-activity"
import { useCreateAssistPoolConfig } from "#/hooks/use-assist-pool"
import { useCreateBannerGroup } from "#/hooks/use-banner"
import { useCreateCheckInConfig } from "#/hooks/use-check-in"
import { useCreateCurrency } from "#/hooks/use-currency"
import {
  useCreateEntityBlueprint,
  useEntitySchema,
  useAllEntitySchemas,
} from "#/hooks/use-entity"
import { useCreateItemDefinition } from "#/hooks/use-item"
import { useCreateLeaderboardConfig } from "#/hooks/use-leaderboard"
import { useCreateLotteryPool } from "#/hooks/use-lottery"
import { useCreateShopProduct } from "#/hooks/use-shop"
import { useCreateTaskDefinition, useAllTaskCategories } from "#/hooks/use-task"
import { ApiError } from "#/lib/api-client"
import type { NodeType } from "#/lib/types/activity"
import * as m from "#/paraglide/messages.js"

interface NodeTypeOption {
  value: NodeType
  label: string
}

interface NodeTypeGroup {
  label: string
  types: NodeTypeOption[]
}

function getNodeTypeGroups(): NodeTypeGroup[] {
  return [
    {
      label: m.activity_node_group_gameplay(),
      types: [
        { value: "check_in", label: m.activity_node_type_check_in() },
        { value: "task_group", label: m.activity_node_type_task_group() },
        { value: "lottery", label: m.activity_node_type_lottery() },
        { value: "leaderboard", label: m.activity_node_type_leaderboard() },
        { value: "game_board", label: m.activity_node_type_game_board() },
        { value: "assist_pool", label: m.activity_node_type_assist_pool() },
      ],
    },
    {
      label: m.activity_node_group_content(),
      types: [
        { value: "banner", label: m.activity_node_type_banner() },
        {
          value: "entity_blueprint",
          label: m.activity_node_type_entity_blueprint(),
        },
      ],
    },
    {
      label: m.activity_node_group_economy(),
      types: [
        { value: "exchange", label: m.activity_node_type_exchange() },
        {
          value: "item_definition",
          label: m.activity_node_type_item_definition(),
        },
        {
          value: "currency_definition",
          label: m.activity_node_type_currency_definition(),
        },
      ],
    },
    {
      label: m.activity_node_group_other(),
      types: [{ value: "custom", label: m.activity_node_type_custom() }],
    },
  ]
}

interface Props {
  activityKey: string
  activityId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * "新建并挂载" — for each supported nodeType, inline the matching
 * resource Form, create the resource (with activityId pre-injected),
 * then create an activity_nodes row pointing at refId.
 *
 * The header carries dialog-local state (nodeType, node alias,
 * orderIndex). Per-nodeType sections receive `nodeAlias` so they can
 * default the resource alias to the same value when the user leaves
 * it blank in the body form.
 */
/**
 * Node types whose body Form has its own `alias` field that doubles as
 * the node alias. For these we hide the dialog-level "Node alias" input
 * so the operator only fills alias once — the section reads the form
 * value and passes it through `mountNode(refId, formAlias)`.
 *
 * `custom` has no body form (operator clicks a button) and `game_board`
 * is a virtual placeholder, so they keep the dialog-level input.
 */
const FORM_OWNS_ALIAS: ReadonlySet<NodeType> = new Set([
  "check_in",
  "task_group",
  "lottery",
  "leaderboard",
  "banner",
  "exchange",
  "assist_pool",
  "entity_blueprint",
  "item_definition",
  "currency_definition",
])

export function NodeCreatorDialog({
  activityKey,
  activityId,
  open,
  onOpenChange,
}: Props) {
  const [nodeType, setNodeType] = useState<NodeType>("check_in")
  const [nodeAlias, setNodeAlias] = useState("")
  const [orderIndex, setOrderIndex] = useState(0)

  const formOwnsAlias = FORM_OWNS_ALIAS.has(nodeType)

  const createNode = useCreateActivityNode(activityKey)

  function reset() {
    setNodeType("check_in")
    setNodeAlias("")
    setOrderIndex((n) => n + 1)
  }

  async function mountNode(
    refId: string | null,
    aliasOverride?: string | null,
  ) {
    const finalAlias = aliasOverride?.trim() || nodeAlias
    if (!finalAlias) {
      toast.error(m.activity_node_alias_required())
      return
    }
    await createNode.mutateAsync({
      alias: finalAlias,
      nodeType,
      refId,
      orderIndex,
    })
    toast.success(m.activity_node_mounted_success())
    reset()
    onOpenChange(false)
  }

  const groups = getNodeTypeGroups()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{m.activity_node_create_title()}</DialogTitle>
          <DialogDescription>
            {m.activity_node_create_description()}
          </DialogDescription>
        </DialogHeader>

        <div
          className={
            formOwnsAlias
              ? "grid grid-cols-2 gap-3 py-2"
              : "grid grid-cols-3 gap-3 py-2"
          }
        >
          <div className="flex flex-col gap-1.5">
            <Label>{m.activity_node_field_type()}</Label>
            <Select
              value={nodeType}
              onValueChange={(v) => setNodeType(v as NodeType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {groups.map((g) => (
                  <SelectGroup key={g.label}>
                    <SelectLabel>{g.label}</SelectLabel>
                    {g.types.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>
          {formOwnsAlias ? null : (
            <div className="flex flex-col gap-1.5">
              <Label>{m.activity_node_field_alias()}</Label>
              <Input
                value={nodeAlias}
                onChange={(e) => setNodeAlias(e.target.value.toLowerCase())}
                placeholder="custom_node"
              />
              <p className="text-xs text-muted-foreground">
                {m.activity_node_field_alias_help()}
              </p>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label>{m.activity_node_field_order()}</Label>
            <Input
              type="number"
              value={orderIndex}
              onChange={(e) => setOrderIndex(Number(e.target.value) || 0)}
            />
          </div>
        </div>
        {formOwnsAlias ? (
          <p className="-mt-1 text-xs text-muted-foreground">
            {m.activity_node_alias_unified_hint()}
          </p>
        ) : null}

        <div className="rounded-lg border p-4">
          <NodeFormSection
            nodeType={nodeType}
            activityId={activityId}
            nodeAlias={nodeAlias}
            mountNode={mountNode}
            mountPending={createNode.isPending}
          />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={createNode.isPending}
          >
            {m.common_cancel()}
          </Button>
          {nodeType === "custom" ? (
            <Button
              type="button"
              disabled={createNode.isPending}
              onClick={() => mountNode(null)}
            >
              {m.activity_node_submit_custom()}
            </Button>
          ) : (
            <Button
              type="submit"
              form={NODE_CREATOR_FORM_ID}
              disabled={createNode.isPending}
            >
              {m.activity_node_create_submit()}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Single form id every section's body form should set on its `<form>`,
 * so the dialog footer's submit button can target it via `form={...}`.
 */
const NODE_CREATOR_FORM_ID = "node-creator-form"

interface SectionProps {
  nodeType: NodeType
  activityId: string
  nodeAlias: string
  /**
   * Mount the just-created (or just-picked) resource as an activity
   * node. Pass the form's `alias` value as `aliasOverride` so the
   * node alias and the resource alias stay in sync — the operator
   * fills alias only once inside the body form.
   */
  mountNode: (
    refId: string | null,
    aliasOverride?: string | null,
  ) => Promise<void>
  mountPending: boolean
}

function NodeFormSection(props: SectionProps) {
  // Alias is now validated centrally inside `mountNode` (it picks the
  // form's alias as override, falling back to the dialog-level
  // nodeAlias). Sections just pass through `props.mountNode` and let
  // it surface any "alias required" toast.
  switch (props.nodeType) {
    case "check_in":
      return <CheckInSection {...props} />
    case "lottery":
      return <LotterySection {...props} />
    case "banner":
      return <BannerSection {...props} />
    case "task_group":
      return <TaskSection {...props} />
    case "exchange":
      return <ShopSection {...props} />
    case "leaderboard":
      return <LeaderboardSection {...props} />
    case "game_board":
    case "entity_blueprint":
      return <EntitySection {...props} />
    case "item_definition":
      return <ItemSection {...props} />
    case "currency_definition":
      return <CurrencySection {...props} />
    case "assist_pool":
      return <AssistPoolSection {...props} />
    case "custom":
      return <CustomSection {...props} />
    default:
      return null
  }
}

type SectionImplProps = SectionProps

function reportError(err: unknown) {
  if (err instanceof ApiError) toast.error(err.body.error)
  else toast.error(m.activity_node_create_failed())
}

function CheckInSection(props: SectionImplProps) {
  const create = useCreateCheckInConfig()
  const form = useCheckInForm({
    defaultValues: { activityId: props.activityId, alias: props.nodeAlias },
    onSubmit: async (values) => {      try {
        const config = await create.mutateAsync({
          ...values,
          activityId: props.activityId,
        })
        await props.mountNode(config.id, values.alias)
      } catch (err) {
        reportError(err)
      }
    },
  })
  return (
    <CheckInConfigForm
      form={form}
      isPending={create.isPending || props.mountPending}
      submitLabel={m.activity_node_submit_check_in()}
      hideSubmitButton
      id={NODE_CREATOR_FORM_ID}
    />
  )
}

function LotterySection(props: SectionImplProps) {
  const create = useCreateLotteryPool()
  const form = useLotteryPoolForm({
    defaultValues: { activityId: props.activityId, alias: props.nodeAlias },
    onSubmit: async (values) => {      try {
        const pool = await create.mutateAsync({
          ...values,
          activityId: props.activityId,
        })
        await props.mountNode(pool.id, values.alias)
      } catch (err) {
        reportError(err)
      }
    },
  })
  return (
    <LotteryPoolForm
      form={form}
      isPending={create.isPending || props.mountPending}
      submitLabel={m.activity_node_submit_lottery()}
      hideSubmitButton
      id={NODE_CREATOR_FORM_ID}
    />
  )
}

function BannerSection(props: SectionImplProps) {
  const create = useCreateBannerGroup()
  const form = useBannerGroupForm({
    defaultValues: { activityId: props.activityId, alias: props.nodeAlias },
    onSubmit: async (values) => {      try {
        const group = await create.mutateAsync({
          ...values,
          activityId: props.activityId,
        })
        await props.mountNode(group.id, values.alias)
      } catch (err) {
        reportError(err)
      }
    },
  })
  return (
    <BannerGroupForm
      form={form}
      isPending={create.isPending || props.mountPending}
      submitLabel={m.activity_node_submit_banner()}
      hideSubmitButton
      id={NODE_CREATOR_FORM_ID}
    />
  )
}

function TaskSection(props: SectionImplProps) {
  const create = useCreateTaskDefinition()
  const { data: categories } = useAllTaskCategories()
  return (
    <TaskDefinitionForm
      categories={categories ?? []}
      defaultValues={{ activityId: props.activityId, alias: props.nodeAlias }}
      isPending={create.isPending || props.mountPending}
      submitLabel={m.activity_node_submit_task_group()}
      hideSubmitButton
      id={NODE_CREATOR_FORM_ID}
      onSubmit={async (values) => {        try {
          const def = await create.mutateAsync({
            ...values,
            activityId: props.activityId,
          })
          await props.mountNode(def.id, values.alias)
        } catch (err) {
          reportError(err)
        }
      }}
    />
  )
}

function ShopSection(props: SectionImplProps) {
  const create = useCreateShopProduct()
  const form = useShopProductForm({
    defaultValues: { activityId: props.activityId, alias: props.nodeAlias },
    onSubmit: async (values) => {      try {
        const product = await create.mutateAsync({
          ...values,
          activityId: props.activityId,
        })
        await props.mountNode(product.id, values.alias)
      } catch (err) {
        reportError(err)
      }
    },
  })
  return (
    <ShopProductForm
      form={form}
      isPending={create.isPending || props.mountPending}
      submitLabel={m.activity_node_submit_exchange()}
      hideSubmitButton
      id={NODE_CREATOR_FORM_ID}
    />
  )
}

function LeaderboardSection(props: SectionImplProps) {
  const create = useCreateLeaderboardConfig()
  const form = useLeaderboardForm({
    defaultValues: { activityId: props.activityId, alias: props.nodeAlias },
    onSubmit: async (values) => {      try {
        const cfg = await create.mutateAsync({
          ...values,
          activityId: props.activityId,
        })
        await props.mountNode(cfg.id, values.alias)
      } catch (err) {
        reportError(err)
      }
    },
  })
  return (
    <LeaderboardConfigForm
      form={form}
      isPending={create.isPending || props.mountPending}
      submitLabel={m.activity_node_submit_leaderboard()}
      hideSubmitButton
      id={NODE_CREATOR_FORM_ID}
    />
  )
}

function EntitySection(props: SectionImplProps) {
  const { data: schemas, isPending: schemasPending } = useAllEntitySchemas()
  const [schemaId, setSchemaId] = useState<string>("")
  const { data: schema } = useEntitySchema(schemaId)
  const create = useCreateEntityBlueprint()

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-1.5">
        <Label>{m.activity_node_entity_schema_label()}</Label>
        <Select value={schemaId} onValueChange={(v) => setSchemaId(v ?? "")}>
          <SelectTrigger>
            <SelectValue
              placeholder={
                schemasPending
                  ? m.activity_node_entity_schema_loading()
                  : m.activity_node_entity_schema_placeholder()
              }
            />
          </SelectTrigger>
          <SelectContent>
            {(schemas ?? []).map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {m.activity_node_entity_schema_help()}
        </p>
      </div>

      {schema ? (
        <EntityBlueprintForm
          schema={schema}
          defaultValues={{
            activityId: props.activityId,
            alias: props.nodeAlias,
          }}
          isPending={create.isPending || props.mountPending}
          submitLabel={m.activity_node_submit_entity_blueprint()}
          hideSubmitButton
          id={NODE_CREATOR_FORM_ID}
          onSubmit={async (values) => {            try {
              const bp = await create.mutateAsync({
                ...values,
                activityId: props.activityId,
              })
              await props.mountNode(bp.id, values.alias)
            } catch (err) {
              reportError(err)
            }
          }}
        />
      ) : null}
    </div>
  )
}

function ItemSection(props: SectionImplProps) {
  const create = useCreateItemDefinition()
  return (
    <ItemDefinitionForm
      defaultValues={{ activityId: props.activityId, alias: props.nodeAlias }}
      isPending={create.isPending || props.mountPending}
      submitLabel={m.activity_node_submit_item_definition()}
      hideSubmitButton
      id={NODE_CREATOR_FORM_ID}
      onSubmit={async (values) => {        try {
          const def = await create.mutateAsync({
            ...values,
            activityId: props.activityId,
          })
          await props.mountNode(def.id, values.alias)
        } catch (err) {
          reportError(err)
        }
      }}
    />
  )
}

function CurrencySection(props: SectionImplProps) {
  const create = useCreateCurrency()
  const form = useCurrencyDefinitionForm({
    defaultValues: { activityId: props.activityId, alias: props.nodeAlias },
    onSubmit: async (values) => {      try {
        const def = await create.mutateAsync({
          ...values,
          activityId: props.activityId,
        })
        await props.mountNode(def.id, values.alias)
      } catch (err) {
        reportError(err)
      }
    },
  })
  return (
    <CurrencyDefinitionForm
      form={form}
      isPending={create.isPending || props.mountPending}
      submitLabel={m.activity_node_submit_currency_definition()}
      hideSubmitButton
      id={NODE_CREATOR_FORM_ID}
    />
  )
}

function AssistPoolSection(props: SectionImplProps) {
  const create = useCreateAssistPoolConfig()
  const form = useAssistPoolForm({
    defaultValues: { activityId: props.activityId, alias: props.nodeAlias },
    onSubmit: async (values) => {      try {
        const cfg = await create.mutateAsync({
          ...values,
          activityId: props.activityId,
        })
        await props.mountNode(cfg.id, values.alias)
      } catch (err) {
        reportError(err)
      }
    },
  })
  return (
    <AssistPoolConfigForm
      form={form}
      isPending={create.isPending || props.mountPending}
      submitLabel={m.activity_node_submit_assist_pool()}
      hideSubmitButton
      id={NODE_CREATOR_FORM_ID}
    />
  )
}

function CustomSection(props: SectionImplProps) {
  return (
    <div className="space-y-3 text-sm">
      <p className="text-muted-foreground">
        {m.activity_node_custom_description()}
      </p>
      <Button
        disabled={props.mountPending}
        onClick={async () => {          try {
            await props.mountNode(null)
          } catch (err) {
            reportError(err)
          }
        }}
      >
        {m.activity_node_submit_custom()}
      </Button>
    </div>
  )
}
