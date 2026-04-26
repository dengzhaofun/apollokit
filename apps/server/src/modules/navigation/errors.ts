import { ModuleError } from "../../lib/errors"

export class NavigationFavoriteNotFound extends ModuleError {
  constructor(routePath: string) {
    super(
      "navigation.favorite_not_found",
      404,
      `favorite not found: ${routePath}`,
    )
    this.name = "NavigationFavoriteNotFound"
  }
}

export class NavigationFavoriteLimitReached extends ModuleError {
  constructor(limit: number) {
    super(
      "navigation.favorite_limit_reached",
      409,
      `favorite limit reached (max ${limit} per user per project)`,
    )
    this.name = "NavigationFavoriteLimitReached"
  }
}

/**
 * Favorites are personal — admin API keys are service identities and
 * shouldn't impersonate a person. Throw this when the request reached
 * the navigation module via an api-key auth path (no `c.var.user`).
 */
export class NavigationApiKeyNotSupported extends ModuleError {
  constructor() {
    super(
      "navigation.api_key_not_supported",
      400,
      "favorites require a session user; admin API keys are not supported here",
    )
    this.name = "NavigationApiKeyNotSupported"
  }
}
