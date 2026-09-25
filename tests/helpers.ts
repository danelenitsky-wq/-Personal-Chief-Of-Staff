import { createMemoryRepositories, emptyStore, defaultProfile, type MemoryStore } from "@/lib/db/memory/store";
import { createServices } from "@/services";

export const USER_A = "user-a";
export const USER_B = "user-b";
/** Wednesday 2026-09-23 10:00 in Asia/Jerusalem (07:00 UTC). */
export const NOW = new Date("2026-09-23T07:00:00Z");
export const TODAY = "2026-09-23";

export function setup(now: Date = NOW) {
  const store: MemoryStore = emptyStore();
  for (const id of [USER_A, USER_B]) {
    store.profiles.push({ ...defaultProfile(id, now.toISOString()), timezone: "Asia/Jerusalem" });
  }
  let current = now;
  const clock = () => current;
  const repos = createMemoryRepositories(store, clock);
  const services = createServices(repos, { clock });
  return {
    store,
    repos,
    services,
    advance(ms: number) {
      current = new Date(current.getTime() + ms);
    },
  };
}
