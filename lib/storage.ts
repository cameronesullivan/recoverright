import { z } from "zod";
import { GuidedSessionSchema, type GuidedSession } from "./exercises/session";
import { IntakeSchema } from "./intake";
import { ChatMessageSchema, RecoveryPlanSchema, type ChatMessage } from "./plan-schema";

/**
 * All plan storage goes through the `PlanStore` interface. Today it is backed
 * by the browser's localStorage. To move to a database with user accounts,
 * write another implementation (for example one that calls your API routes)
 * and change `planStore` at the bottom of this file. Pages only use
 * `planStore`, so they won't need to change.
 */

export const SavedPlanSchema = z.object({
  version: z.literal(1),
  id: z.string().min(1),
  createdAt: z.string(),
  /** Week 1, day 1 of the plan (YYYY-MM-DD). */
  planStartDate: z.string(),
  /** What week 1 is based on, e.g. "your injury date". */
  planStartAnchor: z.string(),
  intake: IntakeSchema,
  plan: RecoveryPlanSchema,
  chat: z.array(ChatMessageSchema),
  /**
   * Guided exercise sessions. Plans saved before this feature have none.
   * Each session is validated on its own, so one bad entry can't hide the plan.
   */
  sessions: z
    .array(z.unknown())
    .optional()
    .transform((items) =>
      (items ?? []).flatMap((item) => {
        const result = GuidedSessionSchema.safeParse(item);
        return result.success ? [result.data] : [];
      }),
    ),
});

export type SavedPlan = z.infer<typeof SavedPlanSchema>;

/** Most sessions kept per plan, so localStorage doesn't fill up. */
const MAX_SESSIONS_PER_PLAN = 365;

export interface PlanSummary {
  id: string;
  title: string;
  injuryName: string;
  createdAt: string;
  planStartDate: string;
}

export interface PlanStore {
  list(): Promise<PlanSummary[]>;
  get(id: string): Promise<SavedPlan | null>;
  save(plan: SavedPlan): Promise<void>;
  updateChat(id: string, chat: ChatMessage[]): Promise<void>;
  /** Add a finished guided session to a plan. */
  addSession(id: string, session: GuidedSession): Promise<void>;
  remove(id: string): Promise<void>;
}

export class StorageError extends Error {}

const STORAGE_KEY = "recoverright:plans:v1";

function createLocalStoragePlanStore(): PlanStore {
  /** Raw stored entries, including any that no longer validate (kept so they aren't lost). */
  function readRaw(): unknown[] {
    if (typeof window === "undefined") return [];
    let raw: string | null;
    try {
      raw = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      throw new StorageError("Your browser is blocking saved data, so plans can't be loaded.");
    }
    if (!raw) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function readValid(): SavedPlan[] {
    return readRaw().flatMap((entry) => {
      const result = SavedPlanSchema.safeParse(entry);
      return result.success ? [result.data] : [];
    });
  }

  function idOf(entry: unknown): string | undefined {
    return typeof entry === "object" && entry !== null && "id" in entry && typeof entry.id === "string"
      ? entry.id
      : undefined;
  }

  function writeRaw(entries: unknown[]): void {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch {
      throw new StorageError(
        "Your browser couldn't save this plan. It may be out of storage space or blocking saved data. Try deleting an old plan.",
      );
    }
  }

  return {
    async list() {
      return readValid()
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((p) => ({
          id: p.id,
          title: p.plan.title,
          injuryName: p.plan.injuryName,
          createdAt: p.createdAt,
          planStartDate: p.planStartDate,
        }));
    },
    async get(id) {
      return readValid().find((p) => p.id === id) ?? null;
    },
    async save(plan) {
      const others = readRaw().filter((entry) => idOf(entry) !== plan.id);
      writeRaw([plan, ...others]);
    },
    async updateChat(id, chat) {
      const current = readValid().find((p) => p.id === id);
      if (!current) return;
      const updated: SavedPlan = { ...current, chat };
      writeRaw(readRaw().map((entry) => (idOf(entry) === id ? updated : entry)));
    },
    async addSession(id, session) {
      const current = readValid().find((p) => p.id === id);
      if (!current) throw new StorageError("This plan couldn't be found in your browser, so the session wasn't saved.");
      const sessions = [...current.sessions.filter((s) => s.id !== session.id), session].slice(-MAX_SESSIONS_PER_PLAN);
      const updated: SavedPlan = { ...current, sessions };
      writeRaw(readRaw().map((entry) => (idOf(entry) === id ? updated : entry)));
    },
    async remove(id) {
      writeRaw(readRaw().filter((entry) => idOf(entry) !== id));
    },
  };
}

export const planStore: PlanStore = createLocalStoragePlanStore();
