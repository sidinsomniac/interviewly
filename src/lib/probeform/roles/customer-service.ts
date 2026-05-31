// ============================================================
// Customer Service Associate role schema.
//
// Phase-P2 (2026-06-01): added as a NON-TECHNICAL happy path for booth
// visitors with no engineering background. Conversational interview,
// permissive intent-based scoring, no coding exercises.
//
// Excel template — BOOTH-DAY REUSE: there is no dedicated
// customer-service.xlsx, so we borrow frontend-generic's template,
// sheet name, and header cell mappings. The FILLED feedback values
// (F/G columns, written per rowIndex) are correct CS content; only the
// template's static row labels + sheet name read "HTML/CSS" — cosmetic.
// Post-expo: drop a real customer-service.xlsx and flip excelTemplate +
// sheetName. The 16 CS competency rows are mapped to rowIndex 14-29,
// which sit within frontend-generic's 14-43 row range so the filler
// writes into valid cells.
//
// Tuning fields (Phase-P2):
//   targetQuestionCount: 5      → short, warm interview (overrides budget)
//   maxBranchesPerQuestion: 1   → at most one gentle follow-up per question
// ============================================================

import type { RoleSchema } from "../types";

export const customerServiceSchema: RoleSchema = {
  roleId: "customer-service",
  displayName: "Customer Service Associate",
  // Phase-P3 (2026-06-01): useSimpleProbeForm routes this role to the
  // built-in single-sheet ExcelJS generator (generateSimpleProbeForm), so
  // excelTemplate/sheetName below are IGNORED at generation time. They stay
  // populated only because RoleSchema requires them (the filler is never
  // invoked for this role). This is what stops the React-template fallback
  // that produced "Career Stage: Experience Engineer L1" on a CS candidate.
  excelTemplate: "data/templates/frontend-generic.xlsx",
  sheetName: "1 - HTML, CSS & NFRs",
  useSimpleProbeForm: true,
  targetQuestionCount: 5,
  // Round-4 (2026-06-01): raised 1 → 2 so the booth audience sees at least
  // one visible follow-up. autoConductor's getBranchingConfig also hardcodes
  // CS to CAP 2 + looser thresholds (60 chars / 30s / 10% skip).
  maxBranchesPerQuestion: 2,

  // Header cells reused verbatim from frontend-generic (same template file).
  header: [
    { field: "candidateName",            cell: "C4",  required: true },
    { field: "totalYears",               cell: "C5",  required: true },
    { field: "relevantYears",            cell: "C6",  required: true },
    { field: "interviewedFor",           cell: "C7",  required: true },
    { field: "evaluationDate",           cell: "C8",  required: true },
    { field: "interviewerName",          cell: "F4",  required: true },
    { field: "interviewerOid",           cell: "F5",  required: true },
    { field: "interviewOutcome",         cell: "I4",  required: true },
    { field: "selectedForLevel",         cell: "I5" },
    { field: "rejectionReason",          cell: "I6" },
    { field: "sectionsToBeTrainedOn",    cell: "I7" },
    { field: "domainFeedbackSummary",    cell: "D9",  required: true },
    { field: "teachableSkillGapDetails", cell: "C10" },
    { field: "handsOnExerciseId",        cell: "C11" },
  ],

  categories: [
    {
      name: "Communication",
      rows: [
        { rowIndex: 14, competencyName: "Active listening — paraphrases the customer's concern before responding", rubricType: "development" },
        { rowIndex: 15, competencyName: "Clear written communication — chats and emails are free of typos and jargon", rubricType: "development" },
        { rowIndex: 16, competencyName: "Verbal clarity — speaks at a measured pace without excessive filler", rubricType: "development" },
        { rowIndex: 17, competencyName: "Tone modulation — adapts to whether the customer is calm, frustrated, or in a hurry", rubricType: "development" },
      ],
    },
    {
      name: "Customer Focus",
      rows: [
        { rowIndex: 18, competencyName: "Empathy — acknowledges the customer's feelings before offering a solution", rubricType: "development" },
        { rowIndex: 19, competencyName: "Problem identification — separates the symptom the customer reports from the underlying issue", rubricType: "development" },
        { rowIndex: 20, competencyName: "De-escalation — keeps composure when the customer is upset", rubricType: "development" },
        { rowIndex: 21, competencyName: "Going beyond — offers a small extra (a tip, a workaround) when it costs little and helps", rubricType: "development" },
      ],
    },
    {
      name: "Reliability and Work Ethic",
      rows: [
        { rowIndex: 22, competencyName: "Punctuality — arrives on time for shifts and meetings", rubricType: "development" },
        { rowIndex: 23, competencyName: "Attendance — minimal unplanned absences", rubricType: "development" },
        { rowIndex: 24, competencyName: "Task ownership — sees a customer ticket through to closure", rubricType: "development" },
        { rowIndex: 25, competencyName: "Follow-through — circles back when a commitment was made", rubricType: "development" },
      ],
    },
    {
      name: "Teamwork and Adaptability",
      rows: [
        { rowIndex: 26, competencyName: "Peer collaboration — shares context with colleagues so handoffs work", rubricType: "development" },
        { rowIndex: 27, competencyName: "Learning agility — picks up a new product or process in a week without hand-holding", rubricType: "development" },
        { rowIndex: 28, competencyName: "Flexibility — handles a shift change or queue reassignment without friction", rubricType: "development" },
        { rowIndex: 29, competencyName: "Initiative — flags recurring customer pain to a supervisor instead of just resolving each ticket", rubricType: "development" },
      ],
    },
  ],

  exercises: [],
};
