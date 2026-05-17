export const HEADER_CELLS = {
  candidateName:           "C5",
  totalYears:              "C6",
  relevantYears:           "C7",
  interviewedFor:          "C8",
  evaluationDate:          "C9",   // MM/DD/YYYY
  interviewerName:         "F5",
  interviewerOid:          "F6",
  interviewOutcome:        "I5",
  selectedForLevel:        "I6",
  rejectionReason:         "I7",
  sectionsToBeTrainedOn:   "I8",
  domainFeedbackSummary:   "D10",
  teachableSkillGapDetails:"C11",
  handsOnExerciseId:       "C12",
} as const;

export const ROUND_SHEET_NAMES = {
  Core:  "1 - HTML, CSS & NFRs",
  React: "2 - FW React",
} as const;

// Both rounds: column F = proficiency dropdown, column G = feedback text
function cellMap(rowIndices: number[]): Record<number, { proficiencyCell: string; feedbackCell: string }> {
  return Object.fromEntries(
    rowIndices.map((r) => [r, { proficiencyCell: `F${r}`, feedbackCell: `G${r}` }])
  );
}

// Core round rows: 14-19, 21-26, 28-34, 36-37, 39-41
export const CORE_CELL_MAP = cellMap([
  14, 15, 16, 17, 18, 19,
  21, 22, 23, 24, 25, 26,
  28, 29, 30, 31, 32, 33, 34,
  36, 37,
  39, 40, 41,
]);

// React round rows: 14-20, 22-29, 31-36, 38-43
export const REACT_CELL_MAP = cellMap([
  14, 15, 16, 17, 18, 19, 20,
  22, 23, 24, 25, 26, 27, 28, 29,
  31, 32, 33, 34, 35, 36,
  38, 39, 40, 41, 42, 43,
]);

export const CELL_MAP_BY_ROUND: Record<"Core" | "React", typeof CORE_CELL_MAP> = {
  Core:  CORE_CELL_MAP,
  React: REACT_CELL_MAP,
};
