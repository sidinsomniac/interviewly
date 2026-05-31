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
  source: "n8n" | "manual" | "screening";
  interviewerEmail?: string;
  welcomePostedAt?: string;

  /**
   * Phase K: recruiter who owns the interview workflow. Distinct from
   * `interviewerEmail` (the panel-member doing the actual conversation).
   * Set by the screening flow (`/recruiter/screen`). Used as the To: for
   * the scheduled-interview confirmation email and the probe-form-ready
   * notification email.
   */
  recruiterEmail?: string;

  /**
   * Phase G: interview-style selector picked at scheduling.
   *   - "manual" → recruiter drives (Post Welcome + Start Auto-Conduct buttons, chat keyword triggers).
   *   - "auto"   → Medha auto-runs by voice + chat (full behavior lands in Phase H).
   * Defaults to "manual" on read for legacy records that pre-date this field.
   */
  conductMode: "manual" | "auto";

  /**
   * Phase J: ISO string of the interview's scheduled start time. Set by
   * /api/schedule-interview (n8n flow); absent on manual /api/interviews
   * creations. The interviewScheduler reads this to fire /auto-conduct/start
   * automatically for Mode B at the scheduled moment.
   */
  scheduledFor?: string;

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
    // Phase H — Mode B intro+consent gate. While `awaitingConsent` is true,
    // the conductor's poll tick short-circuits both keyword and timeout
    // advance paths; the only thing that flips it off is the candidate
    // typing /\bi\s+agree\b/i in the meeting chat. `consentReceivedAt` is
    // stamped at the same moment for audit. Both optional — legacy JSON
    // records load without migration.
    awaitingConsent?: boolean;
    consentReceivedAt?: string;
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
  /**
   * ISO timestamp the question was posted to chat (Phase J).
   * Stamped by postQuestionByIndex and consumed by the
   * transcript-mapping LLM prompt to window utterances per question.
   */
  postedAt?: string;
  /**
   * Phase K — per-question time budget. Drives the conductor's
   * nextQuestionDeadline (replaces the flat DEFAULT_TIMEOUT_MS for plans
   * that carry it). Bounded 60–900 sec by the Zod schema.
   */
  expectedDurationSec?: number;
  /**
   * Phase K — difficulty tier used by the planner to size budget and
   * by the recruiter UI for at-a-glance pacing.
   *   easy   ≈ 90–180s definitional / conceptual
   *   medium ≈ 240–360s explanation w/ trade-offs / short code
   *   hard   ≈ 480–900s system design / longer coding / multi-step
   */
  difficulty?: "easy" | "medium" | "hard";
}

export interface QuestionPlan {
  roleId: string;
  generatedAt: string;
  modelProvider: string;
  modelId: string;
  questions: PlannedQuestion[];
  /**
   * Phase K — plan-level total budget (sum of expectedDurationSec +
   * ~10% recruiter buffer). Advisory: the conductor doesn't enforce it;
   * present for the dashboard and future analytics.
   */
  totalBudgetSec?: number;
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
  /** Phase G: "manual" | "auto" — defaults to "manual" if omitted. */
  conductMode?: "manual" | "auto";
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
  /** Phase G: "manual" | "auto" — defaults to "manual" if omitted. */
  conductMode?: "manual" | "auto";
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
  conductMode: z.enum(["manual", "auto"]).default("manual"),
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
  conductMode: z.enum(["manual", "auto"]).default("manual"),
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
  // isHandsOnExercise is false, instead of omitting the key. The
  // .transform() normalizes "" → undefined so downstream consumers
  // only ever see a real URL or undefined.
  exerciseUrl: z
    .union([z.string().url(), z.literal("")])
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
  // Phase J — ISO timestamp the question was posted to chat. Stamped
  // by postQuestionByIndex when the question fires; absent on freshly-
  // generated plans before first post.
  postedAt: z.string().optional(),
  // Phase K — per-question time budget (60–900 sec). Optional so legacy
  // plans without this field still parse. Conductor falls back to the
  // flat DEFAULT_TIMEOUT_MS when absent.
  expectedDurationSec: z.number().int().min(60).max(900).optional(),
  // Phase K — difficulty tier. Optional for legacy plans. The planner
  // biases distribution by candidate seniority.
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
});

export const QuestionPlanSchema = z.object({
  roleId: z.string().min(1),
  questions: z.array(PlannedQuestionSchema),
  // Phase K — plan-level budget (sum + buffer). Optional so legacy plans
  // still parse. We don't enforce the 2700s cap at the schema layer;
  // logging a too-large value beats rejecting the whole plan.
  totalBudgetSec: z.number().int().positive().optional(),
});

// ============================================================
// Phase J — resume screening (extract + score) schemas.
//
// Profile is the LLM extraction output from a candidate's resume;
// Score is the role-rubric scoring output (verdict + reasoning).
// Both schemas validate LLM responses in /api/screen.
// ============================================================
export const CandidateProfileSchema = z.object({
  candidateName: z.string(),
  candidateEmail: z.string(),               // "" if not extractable
  candidateTotalYears: z.number().min(0).max(60),
  candidateRelevantYears: z.number().min(0).max(60),
  roleAppliedFor: z.string(),               // human-readable
  keySkills: z.array(z.string()).max(20),
  notableProjects: z.array(z.string()).max(10),
});
export type CandidateProfile = z.infer<typeof CandidateProfileSchema>;

export const ScreeningScoreSchema = z.object({
  verdict: z.enum(["selected", "rejected", "borderline"]),
  confidence: z.number().min(0).max(1),
  strengths: z.array(z.string()).min(1).max(6),
  gaps: z.array(z.string()).min(1).max(6),
  summary: z.string().min(20),
  recommendedDifficultyBias: z.enum(["easy", "medium", "hard"]),
});
export type ScreeningScore = z.infer<typeof ScreeningScoreSchema>;

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
