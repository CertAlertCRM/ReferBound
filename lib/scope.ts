// Whose leads is this request allowed to see?
//
// One file, because the answer has to be identical in eight places. The list,
// the stat tiles, the grow queue, the export, the deal page and every route
// under it all have to agree, and the moment two of them disagree a producer
// sees a number they can't drill into — or worse, drills into a colleague's
// client.
//
// The shape of the problem, restated:
//
//   Every member of an agency reads and writes against the OWNER's data
//   account. account.id is the owner's id for everyone on the team; that is
//   what makes partners, templates and the book shared in the first place.
//   account.selfId is who is actually signed in. So account_id answers "which
//   agency" and producer_id answers "which person", and until now nothing
//   asked the second question.
//
// The enforcement rule, which matters more than the UI:
//
//   A producer's scope is decided by the SERVER from their session, never by
//   the query string. Sending ?scope=team as a producer does not widen
//   anything; it is ignored. The tabs are a convenience for the owner, not the
//   mechanism.

import type { Account } from "@/lib/account";

export type Scope = "mine" | "team" | "unassigned" | "all";

export type ScopeContext = {
  // The scope actually applied, after the session has had its say.
  scope: Scope;
  // Does this person get tabs? Owners of a team, and nobody else.
  canSeeTeam: boolean;
  // Is this a team account at all? False for solo and producer-plan accounts,
  // which must behave exactly as they did before any of this existed.
  isTeam: boolean;
  // The signed-in person.
  producerId: string;
  // True when the signed-in person is a producer under an owner.
  isProducer: boolean;
};

const SCOPES: Scope[] = ["mine", "team", "unassigned", "all"];

export function parseScope(raw: string | null | undefined): Scope | null {
  const s = String(raw ?? "").trim().toLowerCase();
  return (SCOPES as string[]).includes(s) ? (s as Scope) : null;
}

// Whether this account has anyone else on it.
//
// Deliberately a separate query rather than something inferred from the plan:
// an agency plan with no producers yet is still a solo experience and should
// not grow a set of tabs that all show the same thing. Caitlyn had the Agency
// plan for a while before her two producers were on it.
export async function teamSize(dbClient: any, ownerId: string): Promise<number> {
  const { count } = await dbClient
    .from("accounts")
    .select("id", { count: "exact", head: true })
    .eq("team_owner_id", ownerId);
  return count ?? 0;
}

// Resolve what this request may see.
//
// `hasTeam` is passed in rather than looked up here so a route that already
// knows (or already fetched the roster) doesn't pay for a second round trip on
// the auth path. lib/account.ts learned the hard way what happens when the
// login path grows a query that can fail.
export function resolveScope(
  account: Account,
  requested: string | null | undefined,
  hasTeam: boolean
): ScopeContext {
  const producerId = account.selfId;

  // A producer under an owner sees their own work. Full stop — the requested
  // scope is not consulted, because it arrives from the client.
  if (account.isTeamMember) {
    return { scope: "mine", canSeeTeam: false, isTeam: true, producerId, isProducer: true };
  }

  // A solo agent, or an owner who hasn't added anyone yet. No scoping at all:
  // "all" here means the query is left untouched, which keeps every existing
  // account behaving precisely as it does today.
  if (!hasTeam) {
    return { scope: "all", canSeeTeam: false, isTeam: false, producerId, isProducer: false };
  }

  // An owner with a team. Defaults to their own book, per the way David
  // described it — an owner is a producer first and an owner second.
  const scope = parseScope(requested) ?? "mine";
  return { scope, canSeeTeam: true, isTeam: true, producerId, isProducer: false };
}

// Narrow a PostgREST query on referrals to the resolved scope.
//
// The null case is the one worth explaining. producer_id only started being
// written recently, so an agency that has been logging leads for months has
// rows with no producer on them. There is no honest way to guess who logged
// those, so:
//
//   - They are never shown to a producer. Attributing a colleague's client to
//     someone by accident is a worse failure than hiding an old row.
//   - They belong to the OWNER's "mine", because on an account that was solo
//     before it had a team, that is exactly whose they were.
//   - The owner also gets them as their own tab, so they can be assigned
//     properly rather than living in a shadow forever.
//
// Applies to any table with account_id + producer_id columns.
export function scopeQuery<T>(q: T, ctx: ScopeContext): T {
  const query = q as any;
  switch (ctx.scope) {
    case "all":
      return query;
    case "mine":
      // The owner's own book includes the unattributed backlog; a producer's
      // does not. isProducer is what separates the two.
      return ctx.isProducer
        ? query.eq("producer_id", ctx.producerId)
        : query.or(`producer_id.eq.${ctx.producerId},producer_id.is.null`);
    case "team":
      // Everyone but me, and nothing unattributed — an owner looking at "the
      // team" wants the team, not a pile of rows from before anyone was hired.
      return query.not("producer_id", "is", null).neq("producer_id", ctx.producerId);
    case "unassigned":
      return query.is("producer_id", null);
    default:
      return query;
  }
}

// Filter rows already in memory the same way.
//
// The grow endpoint pages the whole book into memory before it can rank
// anything, so it cannot push this into the query. Keeping both in one file is
// what stops them drifting apart.
export function scopeRows<T extends { producer_id?: string | null }>(
  rows: T[],
  ctx: ScopeContext
): T[] {
  switch (ctx.scope) {
    case "all":
      return rows;
    case "mine":
      return rows.filter((r) =>
        ctx.isProducer
          ? r.producer_id === ctx.producerId
          : r.producer_id === ctx.producerId || r.producer_id == null
      );
    case "team":
      return rows.filter((r) => r.producer_id != null && r.producer_id !== ctx.producerId);
    case "unassigned":
      return rows.filter((r) => r.producer_id == null);
    default:
      return rows;
  }
}

export const SCOPE_LABELS: Record<Scope, string> = {
  mine: "My leads",
  team: "My team",
  unassigned: "Unassigned",
  all: "Everyone",
};
