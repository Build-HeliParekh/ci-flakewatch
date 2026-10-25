// Placeholder used by stubs until the implementer stage (T-13b) replaces them.
export function notImplemented(name: string, ...args: unknown[]): never {
  throw new Error(`${name} is not implemented yet (T-13b); called with ${args.length} argument(s)`);
}
