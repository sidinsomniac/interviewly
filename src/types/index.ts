// ============================================================
// Interviewly — canonical TypeScript types
// Source of truth for all shapes across client + server.
// ============================================================

import { z } from "zod";

// ------------------------------------------------------------
// 1. Top-level interview state
// ------------------------------------------------------------

export type InterviewRound = "Core" | "React";

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
  round: InterviewRound;
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
  round: InterviewRound;
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
  round: InterviewRound;

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
  round: InterviewRound;
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
  round: z.enum(["Core", "React"]),
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
  round: z.enum(["Core", "React"]),
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
  round: z.enum(["Core", "React"]),
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
