import { useState } from "react"
import { toast } from "sonner"

import { ConfigForm as CheckInConfigForm } from "#/components/check-in/ConfigForm"
import { GroupForm as BannerGroupForm } from "#/components/banner/GroupForm"
import { LotteryPoolForm } from "#/components/lottery/PoolForm"
import { DefinitionForm as TaskDefinitionForm } from "#/components/task/DefinitionForm"
import { ProductForm as ShopProductForm } from "#/components/shop/ProductForm"
import { LeaderboardConfigForm } from "#/components/leaderboard/ConfigForm"
import { BlueprintForm as EntityBlueprintForm } from "#/components/entity/BlueprintForm"
import { DefinitionForm as ItemDefinitionForm } from "#/components/item/DefinitionForm"
import { DefinitionForm as CurrencyDefinitionForm } from "#/components/currency/DefinitionForm"
import { AssistPoolConfigForm } from "#/components/assist-pool/ConfigForm"
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
export function NodeCreatorDialog({
  activityKey,
  activityId,
  open,
  onOpenChange,
}: Props) {
  const [nodeType, setNodeType] = useState<NodeType>("check_in")
  const [nodeAlias, setNodeAlias] = useState("")
  const [orderIndex, setOrderIndex] = useState(0)

  const createNode = useCreateActivityNode(activityKey)

  function reset() {
    setNodeType("check_in")
    setNodeAlias("")
    setOrderIndex((n) => n + 1)
  }

  async function mountNode(refId: string | null) {
    await createNode.mutateAsync({
      alias: nodeAlias,
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

        <div className="grid grid-cols-3 gap-3 py-2">
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
          <div className="flex flex-col gap-1.5">
            <Label>{m.activity_node_field_alias()}</Label>
            <Input
              value={nodeAlias}
              onChange={(e) => setNodeAlias(e.target.value.toLowerCase())}
              placeholder="day7_checkin"
            />
            <p className="text-xs text-muted-foreground">
              {m.activity_node_field_alias_help()}
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{m.activity_node_field_order()}</Label>
            <Input
              type="number"
              value={orderIndex}
              onChange={(e) => setOrderIndex(Number(e.target.value) || 0)}
            />
          </div>
        </div>

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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface SectionProps {
  nodeType: NodeType
  activityId: string
  nodeAlias: string
  mountNode: (refId: string | null) => Promise<void>
  mountPending: boolean
}

function NodeFormSection(props: SectionProps) {
  function aliasRequired() {
    if (!props.nodeAlias) {
      toast.error(m.activity_node_alias_required())
      return true
    }
    return false
  }

  switch (props.nodeType) {
    case "check_in":
      return <CheckInSection {...props} aliasRequired={aliasRequired} />
    case "lottery":
      return <LotterySection {...props} aliasRequired={aliasRequired} />
    case "banner":
      return <BannerSection {...props} aliasRequired={aliasRequired} />
    case "task_group":
      return <TaskSection {...props} aliasRequired={aliasRequired} />
    case "exchange":
      return <ShopSection {...props} aliasRequired={aliasRequired} />
    case "leaderboard":
      return <LeaderboardSection {...props} aliasRequired={aliasRequired} />
    case "game_board":
    case "entity_blueprint":
      return <EntitySection {...props} aliasRequired={aliasRequired} />
    case "item_definition":
      return <ItemSection {...props} aliasRequired={aliasRequired} />
    case "currency_definition":
      return <CurrencySection {...props} aliasRequired={aliasRequired} />
    case "assist_pool":
      return <AssistPoolSection {...props} aliasRequired={aliasRequired} />
    case "custom":
      return <CustomSection {...props} aliasRequired={aliasRequired} />
    default:
      return null
  }
}

type SectionImplProps = SectionProps & { aliasRequired: () => boolean }

function reportError(err: unknown) {
  if (err instanceof ApiError) toast.error(err.body.error)
  else toast.error(m.activity_node_create_failed())
}

function CheckInSection(props: SectionImplProps) {
  const create = useCreateCheckInConfig()
  return (
    <CheckInConfigForm
      defaultValues={{ activityId: props.activityId, alias: props.nodeAlias }}
      isPending={create.isPending || props.mountPending}
      submitLabel={m.activity_node_submit_check_in()}
      onSubmit={async (values) => {
        if (props.aliasRequired()) return
        try {
          const config = await create.mutateAsync({
            ...values,
            activityId: props.activityId,
          })
          await props.mountNode(config.id)
        } catch (err) {
          reportError(err)
        }
      }}
    />
  )
}

function LotterySection(props: SectionImplProps) {
  const create = useCreateLotteryPool()
  return (
    <LotteryPoolForm
      defaultValues={{ activityId: props.activityId, alias: props.nodeAlias }}
      isPending={create.isPending || props.mountPending}
      submitLabel={m.activity_node_submit_lottery()}
      onSubmit={async (values) => {
        if (props.aliasRequired()) return
        try {
          const pool = await create.mutateAsync({
            ...values,
            activityId: props.activityId,
          })
          await props.mountNode(pool.id)
        } catch (err) {
          reportError(err)
        }
      }}
    />
  )
}

function BannerSection(props: SectionImplProps) {
  const create = useCreateBannerGroup()
  return (
    <BannerGroupForm
      defaultValues={{ activityId: props.activityId, alias: props.nodeAlias }}
      isPending={create.isPending || props.mountPending}
      submitLabel={m.activity_node_submit_banner()}
      onSubmit={async (values) => {
        if (props.aliasRequired()) return
        try {
          const group = await create.mutateAsync({
            ...values,
            activityId: props.activityId,
          })
          await props.mountNode(group.id)
        } catch (err) {
          reportError(err)
        }
      }}
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
      onSubmit={async (values) => {
        if (props.aliasRequired()) return
        try {
          const def = await create.mutateAsync({
            ...values,
            activityId: props.activityId,
          })
          await props.mountNode(def.id)
        } catch (err) {
          reportError(err)
        }
      }}
    />
  )
}

function ShopSection(props: SectionImplProps) {
  const create = useCreateShopProduct()
  return (
    <ShopProductForm
      defaultValues={{ activityId: props.activityId, alias: props.nodeAlias }}
      isPending={create.isPending || props.mountPending}
      submitLabel={m.activity_node_submit_exchange()}
      onSubmit={async (values) => {
        if (props.aliasRequired()) return
        try {
          const product = await create.mutateAsync({
            ...values,
            activityId: props.activityId,
          })
          await props.mountNode(product.id)
        } catch (err) {
          reportError(err)
        }
      }}
    />
  )
}

function LeaderboardSection(props: SectionImplProps) {
  const create = useCreateLeaderboardConfig()
  return (
    <LeaderboardConfigForm
      defaultValues={{ activityId: props.activityId, alias: props.nodeAlias }}
      isPending={create.isPending || props.mountPending}
      submitLabel={m.activity_node_submit_leaderboard()}
      onSubmit={async (values) => {
        if (props.aliasRequired()) return
        try {
          const cfg = await create.mutateAsync({
            ...values,
            activityId: props.activityId,
          })
          await props.mountNode(cfg.id)
        } catch (err) {
          reportError(err)
        }
      }}
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
        <Select value={schemaId} onValueChange={setSchemaId}>
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
          onSubmit={async (values) => {
            if (props.aliasRequired()) return
            try {
              const bp = await create.mutateAsync({
                ...values,
                activityId: props.activityId,
              })
              await props.mountNode(bp.id)
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
      onSubmit={async (values) => {
        if (props.aliasRequired()) return
        try {
          const def = await create.mutateAsync({
            ...values,
            activityId: props.activityId,
          })
          await props.mountNode(def.id)
        } catch (err) {
          reportError(err)
        }
      }}
    />
  )
}

function CurrencySection(props: SectionImplProps) {
  const create = useCreateCurrency()
  return (
    <CurrencyDefinitionForm
      defaultValues={{ activityId: props.activityId, alias: props.nodeAlias }}
      isPending={create.isPending || props.mountPending}
      submitLabel={m.activity_node_submit_currency_definition()}
      onSubmit={async (values) => {
        if (props.aliasRequired()) return
        try {
          const def = await create.mutateAsync({
            ...values,
            activityId: props.activityId,
          })
          await props.mountNode(def.id)
        } catch (err) {
          reportError(err)
        }
      }}
    />
  )
}

function AssistPoolSection(props: SectionImplProps) {
  const create = useCreateAssistPoolConfig()
  return (
    <AssistPoolConfigForm
      defaultValues={{ activityId: props.activityId, alias: props.nodeAlias }}
      isPending={create.isPending || props.mountPending}
      submitLabel={m.activity_node_submit_assist_pool()}
      onSubmit={async (values) => {
        if (props.aliasRequired()) return
        try {
          const cfg = await create.mutateAsync({
            ...values,
            activityId: props.activityId,
          })
          await props.mountNode(cfg.id)
        } catch (err) {
          reportError(err)
        }
      }}
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
        onClick={async () => {
          if (props.aliasRequired()) return
          try {
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
