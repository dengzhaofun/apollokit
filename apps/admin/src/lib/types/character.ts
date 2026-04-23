export type CharacterSide = "left" | "right"

export interface Character {
  id: string
  organizationId: string
  alias: string | null
  name: string
  description: string | null
  avatarUrl: string | null
  portraitUrl: string | null
  defaultSide: CharacterSide | null
  isActive: boolean
  metadata: unknown
  createdAt: string
  updatedAt: string
}

export interface CreateCharacterInput {
  alias?: string | null
  name: string
  description?: string | null
  avatarUrl?: string | null
  portraitUrl?: string | null
  defaultSide?: CharacterSide | null
  isActive?: boolean
}

export type UpdateCharacterInput = Partial<CreateCharacterInput>

export interface CharacterListResponse {
  items: Character[]
}
