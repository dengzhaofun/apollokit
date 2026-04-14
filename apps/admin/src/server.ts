import { paraglideMiddleware } from './paraglide/server.js'
import handler, { createServerEntry } from '@tanstack/react-start/server-entry'

export default createServerEntry({
  async fetch(req: Request): Promise<Response> {
    return paraglideMiddleware(req, () => handler.fetch(req))
  },
})
