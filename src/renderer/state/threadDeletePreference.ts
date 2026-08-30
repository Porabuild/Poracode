// Kept at the historical key so an existing opt-out survives the upgrade from
// the three-way "thread only / thread + worktree" dialog to a single confirm.
const PREF_KEY = "poracode-delete-worktree-pref";

export function shouldConfirmThreadDelete(): boolean {
  // That older UI also supported "thread-only", which cannot safely migrate to
  // deleting without asking — it never authorised worktree removal. So only the
  // explicit destructive choice suppresses the confirmation; anything else asks.
  return localStorage.getItem(PREF_KEY) !== "thread-and-worktree";
}

export function setConfirmThreadDelete(confirm: boolean): void {
  if (confirm) localStorage.removeItem(PREF_KEY);
  else localStorage.setItem(PREF_KEY, "thread-and-worktree");
}
