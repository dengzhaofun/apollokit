export interface ClientCredential {
  id: string
  tenantId: string
  name: string
  publishableKey: string
  devMode: boolean
  enabled: boolean
  expiresAt: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export interface ClientCredentialCreated {
  id: string
  name: string
  publishableKey: string
  secret: string
  devMode: boolean
  enabled: boolean
  expiresAt: string | null
  createdAt: string
}

export interface RotateResult {
  id: string
  publishableKey: string
  secret: string
}
