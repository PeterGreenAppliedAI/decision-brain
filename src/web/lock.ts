/** One write job at a time across the page's actions (add a repository, sync, demo steps). */
let holder: string | null = null;
export const busyWith = () => holder;
export function acquire(what: string): boolean { if (holder) return false; holder = what; return true; }
export function release(): void { holder = null; }
