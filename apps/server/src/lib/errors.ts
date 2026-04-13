/**
 * Base error class for all business modules.
 *
 * Service methods throw subclasses instead of returning { error } objects or
 * raising plain Errors. HTTP routers map ModuleError instances onto JSON
 * responses via their onError handler.
 */
export class ModuleError extends Error {
  constructor(
    public readonly code: string,
    public readonly httpStatus: number,
    message: string,
  ) {
    super(message);
    this.name = "ModuleError";
  }
}
