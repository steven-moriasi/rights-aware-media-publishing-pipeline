export const roles = [
  "producer",
  "reviewer",
  "rights-manager",
  "publisher",
  "operator",
] as const;

export type Role = (typeof roles)[number];

export interface ActorContext {
  actorId: string;
  role: Role;
}

export class ActorContextError extends Error {}

export function actorContext(request: Request): ActorContext {
  const actorId = request.headers.get("x-actor-id")?.trim();
  const role = request.headers.get("x-actor-role")?.trim();
  if (
    actorId === undefined ||
    actorId.length === 0 ||
    !roles.includes(role as Role)
  ) {
    throw new ActorContextError("A bounded actor context is required.");
  }
  return { actorId, role: role as Role };
}

export function requireRole(context: ActorContext, allowed: Role[]): void {
  if (!allowed.includes(context.role)) {
    throw new ActorContextError("The actor role cannot perform this action.");
  }
}
