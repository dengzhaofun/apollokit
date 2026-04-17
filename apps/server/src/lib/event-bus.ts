/**
 * Lightweight in-runtime event bus.
 *
 * Subscribers register at module-barrel load time (same isolate-scoped
 * singleton pattern as service factories). Publishers (services) call
 * `events.emit(type, payload)` after their primary write succeeds.
 *
 * This is deliberately NOT a durable queue. For cross-worker delivery or
 * persistent retry, use the webhook pathway with `webhook_deliveries`.
 * Use this bus only for side effects that are OK to miss on cold start.
 *
 * Extending the type map:
 *   declare module "./event-bus" {
 *     interface EventMap {
 *       "score.contributed": { organizationId: string; endUserId: string; ... };
 *     }
 *   }
 *
 * Handlers run sequentially (no parallelism) in registration order. A
 * throwing handler is logged and does not break other handlers or the
 * publishing caller — emit() is always safe.
 */

/** Type map for events. Augment via module augmentation. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface EventMap {}

type EventKey = keyof EventMap & string;

type Handler<K extends EventKey> = (
  payload: EventMap[K],
) => void | Promise<void>;

export type EventBus = {
  on: <K extends EventKey>(type: K, handler: Handler<K>) => () => void;
  off: <K extends EventKey>(type: K, handler: Handler<K>) => void;
  emit: <K extends EventKey>(type: K, payload: EventMap[K]) => Promise<void>;
};

export function createEventBus(): EventBus {
  const handlers = new Map<string, Set<Handler<EventKey>>>();

  function on<K extends EventKey>(type: K, handler: Handler<K>) {
    let set = handlers.get(type);
    if (!set) {
      set = new Set();
      handlers.set(type, set);
    }
    set.add(handler as Handler<EventKey>);
    return () => off(type, handler);
  }

  function off<K extends EventKey>(type: K, handler: Handler<K>) {
    handlers.get(type)?.delete(handler as Handler<EventKey>);
  }

  async function emit<K extends EventKey>(type: K, payload: EventMap[K]) {
    const set = handlers.get(type);
    if (!set || set.size === 0) return;
    for (const handler of Array.from(set)) {
      try {
        await (handler as Handler<K>)(payload);
      } catch (err) {
        console.error(`[event-bus] handler for "${type}" threw:`, err);
      }
    }
  }

  return { on, off, emit };
}
