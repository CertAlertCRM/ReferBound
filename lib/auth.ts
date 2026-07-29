// Back-compat shim over the account session system (lib/session.ts).
// isAgentAuthed(): is ANY account signed in on this browser — used by the
// partner portal to decide whether to even check ownership for the agent bar.

import { currentAccountId } from "@/lib/session";

export function isAgentAuthed(): boolean {
  return currentAccountId() !== null;
}

export { currentAccountId };
