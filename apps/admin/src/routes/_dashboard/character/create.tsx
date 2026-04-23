import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"
import { toast } from "sonner"

import { CharacterForm } from "#/components/character/CharacterForm"
import { PageHeaderActions } from "#/components/PageHeader"
import { Button } from "#/components/ui/button"
import { useCreateCharacter } from "#/hooks/use-character"
import { ApiError } from "#/lib/api-client"
import * as m from "#/paraglide/messages.js"

export const Route = createFileRoute("/_dashboard/character/create")({
  component: CharacterCreatePage,
})

function CharacterCreatePage() {
  const navigate = useNavigate()
  const mutation = useCreateCharacter()

  return (
    <>
      <PageHeaderActions>
        <Button asChild variant="ghost" size="sm">
          <Link to="/character">
            <ArrowLeft className="size-4" />
            {m.character_back_to_list()}
          </Link>
        </Button>
      </PageHeaderActions>

      <main className="flex-1 p-6">
        <div className="mx-auto max-w-3xl">
          <CharacterForm
            isPending={mutation.isPending}
            submitLabel={m.common_create()}
            onSubmit={async (values) => {
              try {
                const row = await mutation.mutateAsync(values)
                toast.success(m.character_created())
                navigate({
                  to: "/character/$characterId",
                  params: { characterId: row.id },
                })
              } catch (err) {
                if (err instanceof ApiError) toast.error(err.body.error)
                else toast.error(m.character_failed_create())
              }
            }}
          />
        </div>
      </main>
    </>
  )
}
