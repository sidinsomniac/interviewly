import type { InterviewMetadata } from "@/types/index";
import { persistInterviews, loadInterviews } from "@/lib/persist";

const globalForStore = globalThis as unknown as {
  __interviewlyInterviews?: Map<string, InterviewMetadata>;
};

const interviews: Map<string, InterviewMetadata> =
  globalForStore.__interviewlyInterviews ?? loadInterviews();

if (process.env.NODE_ENV !== "production") {
  globalForStore.__interviewlyInterviews = interviews;
}

export const store = {
  create(data: Omit<InterviewMetadata, "id" | "createdAt" | "updatedAt">): InterviewMetadata {
    const now = new Date().toISOString();
    const interview: InterviewMetadata = {
      ...data,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    interviews.set(interview.id, interview);
    persistInterviews(interviews);
    return interview;
  },

  get(id: string): InterviewMetadata | undefined {
    return interviews.get(id);
  },

  update(id: string, patch: Partial<InterviewMetadata>): InterviewMetadata | undefined {
    const existing = interviews.get(id);
    if (!existing) return undefined;
    const updated: InterviewMetadata = { ...existing, ...patch, id, updatedAt: new Date().toISOString() };
    interviews.set(id, updated);
    persistInterviews(interviews);
    return updated;
  },

  list(): InterviewMetadata[] {
    return Array.from(interviews.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  },

  delete(id: string): boolean {
    const deleted = interviews.delete(id);
    if (deleted) persistInterviews(interviews);
    return deleted;
  },
};
