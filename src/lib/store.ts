import type { InterviewMetadata } from "@/types/index";

const interviews = new Map<string, InterviewMetadata>();

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
    return updated;
  },

  list(): InterviewMetadata[] {
    return Array.from(interviews.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  },

  delete(id: string): boolean {
    return interviews.delete(id);
  },
};
