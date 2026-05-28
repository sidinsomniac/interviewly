// ============================================================
// Sub-Phase C: shared schema types for the role-driven probe form.
//
// Every role under `src/lib/probeform/roles/` exports a `RoleSchema`
// that's consumed by the question planner, transcript mapper, and
// Excel filler. Adding a new role = drop a new file in `roles/`,
// drop a new .xlsx in `data/templates/`, register it in `registry.ts`.
//
// This module has zero runtime dependencies so it's safe to import
// from both server and client code (the UI dropdown imports RoleSchema
// to render the role's displayName).
// ============================================================

export type RubricType = "architecture" | "development";

export interface CompetencyRow {
  /** 1-based row index in the Excel sheet — matches the source template. */
  rowIndex: number;
  competencyName: string;
  rubricType: RubricType;
}

export interface CategoryDef {
  /** Human-readable category name surfaced to the LLM in the prompt. */
  name: string;
  rows: CompetencyRow[];
}

export interface HeaderFieldDef {
  /**
   * Field name on FilledProbeForm.header (e.g. "candidateName", "totalYears").
   * Kept as a plain string to avoid a circular import with src/types — the
   * schema author is responsible for matching the canonical header field.
   */
  field: string;
  /** Excel cell reference, e.g. "C5". */
  cell: string;
  /** Whether the filler should error if this field is missing on the form. */
  required?: boolean;
}

export interface ExerciseDef {
  id: string;
  title: string;
  language: string;
  starterUrl?: string;
}

export interface RoleSchema {
  /** Lowercase identifier, e.g. "react", "java-backend". Used as the API roleId and the fixture filename role. */
  roleId: string;
  /** Display name shown in the UI dropdown, dashboards, and Excel filenames. */
  displayName: string;
  /** Excel template path relative to project root, e.g. "data/templates/react.xlsx". */
  excelTemplate: string;
  /** Worksheet name within the template — the filler writes into this sheet. */
  sheetName: string;
  /** Header field → cell mappings. */
  header: HeaderFieldDef[];
  /** Competency categories. Each row's rowIndex maps directly to the Excel row. */
  categories: CategoryDef[];
  /** Optional hands-on exercises associated with the role. Empty for Phase 1.5. */
  exercises?: ExerciseDef[];
}

/** Flatten a schema's categories into a single CompetencyRow list. */
export function flattenRows(schema: RoleSchema): CompetencyRow[] {
  return schema.categories.flatMap((c) => c.rows);
}
