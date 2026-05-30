// ============================================================
// Medha — canonical TypeScript types
// Source of truth for all shapes across client + server.
// ============================================================

import { z } from "zod";

// ------------------------------------------------------------
// 1. Top-level interview state
// ------------------------------------------------------------

// Sub-Phase C: `InterviewRound` was removed in favour of a `roleId: string`
// that keys into the role registry at src/lib/probeform/registry.ts. Adding
// a new role no longer requires changing any types.

export type InterviewOutcome =
  | "Selected"
  | "Rejected"
  | "Needs Another Round";

export type CareerStage =
  | "Experience Engineer L1"
  | "Experience Engineer L2"
  | "Senior Experience Engineer"
  | "Lead Experience Engineer"
  | "Manager Experience Engineering"
  | "REJECTED"
  | "Thinking";

export type InterviewStatus =
  | "draft"
  | "scheduled"
  | "in_progress"
  | "ended"
  | "completed"
  | "failed";

export interface InterviewMetadata {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: InterviewStatus;
  errorMessage?: string;

  candidateName: string;
  candidateTotalYears: number;
  candidateRelevantYears: number;
  roleAppliedFor: string;
  /** Lowercase role identifier keying into the role registry (e.g. "react"). */
  roleId: string;
  jdText?: string;
  chosenExerciseId?: string;

  meetingTopic: string;
  meetingId?: string;
  meetingUrl?: string;
  chatId?: string;
  organizerGuid?: string;

  questionPlan?: QuestionPlan;
  postedQuestionIndices: number[];

  transcript?: TranscriptSegment[];
  filledForm?: FilledProbeForm;
  probeFormFilePath?: string;

  // Sub-Phase E: origin tracking for the n8n handoff. "n8n" interviews
  // come in through /api/schedule-interview; "manual" through the
  // /interviews/new form. interviewerEmail is carried for downstream
  // notification flows; welcomePostedAt enables the post-welcome button's
  // idempotency check.
  source: "n8n" | "manual";
  interviewerEmail?: string;
  welcomePostedAt?: string;

  // Scope X: chat-keyword Auto-Conductor state. When `active`, a server
  // timer polls the meeting chat and advances through questionPlan.questions
  // on keyword match or per-question timeout. See src/lib/autoConductor.ts.
  autoConduct?: {
    active: boolean;
    startedAt: string;
    /** 0-based index into questionPlan.questions. -1 means "first advance will post questions[0]". */
    currentQuestionIndex: number;
    /** ISO. The next tick fires advance when Date.now() > Date.parse(this). */
    nextQuestionDeadline: string;
    lastSeenChatMessageId?: string;
    perQuestionTimeoutMs: number;
    triggerKeywords: string[];
  };

  // Scope Y: live transcript + DeepSeek-driven branching.
  liveTranscript?: LiveTranscriptChunk[];
  branchingHistory?: BranchingDecision[];
  /** True while a shouldBranch LLM call is in flight; UI shows a pulse. */
  branchingInFlight?: boolean;
}

export interface LiveTranscriptChunk {
  speaker: string;
  text: string;
  /** ISO. As reported by the sidecar. */
  timestamp: string;
  /** false = partial chunk (not persisted); true = finalized utterance (persisted + may trigger branching). */
  isFinal: boolean;
}

export interface BranchingDecision {
  action: "branch" | "continue";
  /** Present when action="branch" — the follow-up question DeepSeek proposed. */
  branchQuestionText?: string;
  /** Plain-English reasoning the LLM gave for the decision. */
  reasoning: string;
  /** ISO. When the decision was made. */
  decidedAt: string;
  /** The 0-based index of the planned question we were on when deciding (interview.autoConduct.currentQuestionIndex at the time). */
  basedOnQuestionIndex: number;
  /** True if the chat-post was stubbed (MEDHA_TEST_MODE=true). */
  testMode?: boolean;
}

// ------------------------------------------------------------
// 2. Question plan
// ------------------------------------------------------------

export interface PlannedQuestion {
  rowIndex: number;
  competencyName: string;
  rubricType: "architecture" | "development";
  questionText: string;
  followUpHints?: string[];
  isHandsOnExercise?: boolean;
  exerciseUrl?: string;
}

export interface QuestionPlan {
  roleId: string;
  generatedAt: string;
  modelProvider: string;
  modelId: string;
  questions: PlannedQuestion[];
}

// ------------------------------------------------------------
// 3. Transcript
// ------------------------------------------------------------

export interface TranscriptSegment {
  speaker: string;
  startTime: string;
  endTime: string;
  text: string;
}

// ------------------------------------------------------------
// 4. Filled probe form
// Proficiency strings must match Excel VLOOKUP vocabulary EXACTLY
// (including trailing spaces and the typo "theoritically").
// ------------------------------------------------------------

export type ProficiencyArchitecture =
  | "Did not probe"
  | "No Experience"
  | "Awareness of concepts "             // trailing space — intentional
  | "Able to explain concepts in depth " // trailing space — intentional
  | "Confident with decision making & hands on "; // trailing space — intentional

export type ProficiencyDevelopment =
  | "Did not probe"
  | "No Experience"
  | "Able to explain concepts theoritically" // typo preserved from real PS form
  | "Able to code with guidance"
  | "Confident hands on developer";

export interface CompetencyEvaluation {
  rowIndex: number;
  rubricType: "architecture" | "development";
  proficiency: ProficiencyArchitecture | ProficiencyDevelopment;
  feedbackDetails: string;
  evidenceQuotes?: string[];
}

export interface FilledProbeForm {
  roleId: string;

  header: {
    candidateName: string;
    totalYears: number;
    relevantYears: number;
    interviewedFor: string;
    evaluationDate: string;
    interviewerName: string;
    interviewerOid: string;
    interviewOutcome: InterviewOutcome;
    selectedForLevel?: CareerStage;
    rejectionReason?: string;
    sectionsToBeTrainedOn?: string;
    domainFeedbackSummary: string;
    teachableSkillGapDetails?: string;
    handsOnExerciseId?: string;
  };

  competencies: CompetencyEvaluation[];
}

export interface ProbeFormMeta {
  app: "interviewly";
  version: string;
  modelProvider: string;
  modelId: string;
  generatedAt: string;
  meetingId: string;
  transcriptSha256: string;
  recruiterEmail: string;
  botUserEmail: string;
  /** True when the probe form was generated from a TEST_MODE fixture rather than a real meeting. */
  testMode?: boolean;
  /** Identifier of the fixture used (e.g. "react/good-hire") when testMode is true. */
  fixtureId?: string;
}

// ------------------------------------------------------------
// 5. API request / response shapes
// ------------------------------------------------------------

export interface CreateInterviewRequest {
  candidateName: string;
  candidateTotalYears: number;
  candidateRelevantYears: number;
  roleAppliedFor: string;
  /** Lowercase role identifier from the role registry (e.g. "react"). */
  roleId: string;
  jdText?: string;
  chosenExerciseId?: string;
  meetingTopic: string;
}
export type CreateInterviewResponse =
  | { ok: true; interview: InterviewMetadata }
  | { ok: false; error: string };

export type GetInterviewResponse =
  | { ok: true; interview: InterviewMetadata }
  | { ok: false; error: string };

export interface PostQuestionRequest {
  rowIndex: number;
}
export type PostQuestionResponse =
  | { ok: true; messageId: string; postedAt: string }
  | { ok: false; error: string };

export type EndInterviewResponse =
  | { ok: true; downloadUrl: string }
  | { ok: false; error: string };

export interface ScheduleInterviewRequest {
  candidateName: string;
  candidateEmail: string;
  jobTitle: string;
  jobDescription: string;
  requiredSkills: string;
  yearsExperience: number;
  scoringDetails: {
    overallScore: number;
    skillsMatch?: number;
    experienceMatch?: number;
    strengths: string;
    gaps?: string;
    recommendation: string;
  };
  interviewerEmail: string;
  scheduledFor?: string;     // ISO; default now + 5 min
  durationMinutes?: number;  // default 45
}

export type ScheduleInterviewResponse =
  | {
      ok: true;
      interviewId: string;
      meetingId: string;
      meetingUrl: string;
      meetingSubject: string;
      chatId: string;
      scheduledFor: string;
      calendarEventId: string;
      // Sub-Phase E: n8n consumes these so the interviewer email can
      // include "Open in Medha" alongside "Join Teams Meeting".
      dashboardUrl: string;
      liveUrl: string;
      resultUrl: string;
    }
  | { ok: false; error: string };

// ------------------------------------------------------------
// 6. Zod schemas (runtime validation + LLM structured output)
// ------------------------------------------------------------

export const CreateInterviewRequestSchema = z.object({
  candidateName: z.string().min(1),
  candidateTotalYears: z.number().min(0).max(50),
  candidateRelevantYears: z.number().min(0).max(50),
  roleAppliedFor: z.string().min(1),
  roleId: z.string().min(1),
  jdText: z.string().optional(),
  chosenExerciseId: z.string().optional(),
  meetingTopic: z.string().min(1),
});

export const ScheduleInterviewRequestSchema = z.object({
  candidateName: z.string().min(1),
  candidateEmail: z.string().email(),
  jobTitle: z.string().min(1),
  jobDescription: z.string().min(1),
  requiredSkills: z.string(),
  yearsExperience: z.number().min(0).max(50),
  scoringDetails: z.object({
    overallScore: z.number(),
    skillsMatch: z.number().optional(),
    experienceMatch: z.number().optional(),
    strengths: z.string(),
    gaps: z.string().optional(),
    recommendation: z.string(),
  }),
  interviewerEmail: z.string().email(),
  scheduledFor: z.string().optional(),
  durationMinutes: z.number().optional(),
});

export const PlannedQuestionSchema = z.object({
  rowIndex: z.number().int().min(1),
  competencyName: z.string(),
  rubricType: z.enum(["architecture", "development"]),
  questionText: z.string().min(10),
  followUpHints: z.array(z.string()).optional(),
  isHandsOnExercise: z.boolean().optional(),
  // Accept "" as an explicit sentinel for "no exercise". DeepSeek (and
  // some Gemini outputs) emit the field on every question with "" when
  // isHandsOnExercise is false, instead of omitting the key. Treat that
  // as equivalent to omission rather than failing the whole plan.
  exerciseUrl: z.union([z.string().url(), z.literal("")]).optional(),
});

export const QuestionPlanSchema = z.object({
  roleId: z.string().min(1),
  questions: z.array(PlannedQuestionSchema),
});

// Exact proficiency strings — trailing spaces and typo preserved verbatim.
// DO NOT retype these — copy from this file wherever they are needed.
export const ProficiencyArchitectureSchema = z.enum([
  "Did not probe",
  "No Experience",
  "Awareness of concepts ",
  "Able to explain concepts in depth ",
  "Confident with decision making & hands on ",
]);

export const ProficiencyDevelopmentSchema = z.enum([
  "Did not probe",
  "No Experience",
  "Able to explain concepts theoritically",
  "Able to code with guidance",
  "Confident hands on developer",
]);

export const CompetencyEvaluationSchema = z.object({
  rowIndex: z.number().int(),
  rubricType: z.enum(["architecture", "development"]),
  proficiency: z.union([ProficiencyArchitectureSchema, ProficiencyDevelopmentSchema]),
  feedbackDetails: z.string().min(1),
  evidenceQuotes: z.array(z.string()).optional(),
});

export const FilledProbeFormSchema = z.object({
  roleId: z.string().min(1),
  header: z.object({
    candidateName: z.string(),
    totalYears: z.number(),
    relevantYears: z.number(),
    interviewedFor: z.string(),
    evaluationDate: z.string(),
    interviewerName: z.string(),
    interviewerOid: z.string(),
    interviewOutcome: z.enum(["Selected", "Rejected", "Needs Another Round"]),
    selectedForLevel: z.enum([
      "Experience Engineer L1",
      "Experience Engineer L2",
      "Senior Experience Engineer",
      "Lead Experience Engineer",
      "Manager Experience Engineering",
      "REJECTED",
      "Thinking",
    ]).optional(),
    rejectionReason: z.string().optional(),
    sectionsToBeTrainedOn: z.string().optional(),
    domainFeedbackSummary: z.string().min(1),
    teachableSkillGapDetails: z.string().optional(),
    handsOnExerciseId: z.string().optional(),
  }),
  competencies: z.array(CompetencyEvaluationSchema),
});
