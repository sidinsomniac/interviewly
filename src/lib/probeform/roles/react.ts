// ============================================================
// React Engineer role schema.
//
// Ported verbatim from the legacy REACT_ROWS array (src/lib/probeform/rows.ts)
// and HEADER_CELLS / ROUND_SHEET_NAMES (src/lib/probeform/template.ts). Cell
// addresses match the Gurnoor sample exactly — produced Excel files are
// structurally identical to the pre-Sub-Phase-C output.
//
// Rows are grouped into 4 categories matching the inline comments of the
// legacy REACT_ROWS file: React Basics (14-20), React Advanced (22-29),
// Node (31-36), GraphQL (38-43). Each category becomes a section header
// in the LLM prompt for better grouping signal.
// ============================================================

import type { RoleSchema } from "../types";

export const reactSchema: RoleSchema = {
  roleId: "react",
  displayName: "React Engineer",
  excelTemplate: "data/templates/react.xlsx",
  sheetName: "2 - FW React",

  // Sub-Phase D: corrected from the Sub-Phase A originals which were
  // off by one row (data lived at row N, the legacy constants said N+1).
  // Verified by `pnpm tsx scripts/verify-template-cells.ts` against
  // data/templates/react.xlsx on 2026-05-27.
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
      name: "React Basics",
      rows: [
        { rowIndex: 14, competencyName: "React Basics — nested components, JSX, conditional rendering", rubricType: "development" },
        { rowIndex: 15, competencyName: "React — styling (CSS or CSS-in-JS)", rubricType: "development" },
        { rowIndex: 16, competencyName: "React — fragments, useEffect, useState", rubricType: "development" },
        { rowIndex: 17, competencyName: "React — lists, key attribute", rubricType: "development" },
        { rowIndex: 18, competencyName: "React — forms, AJAX, validation", rubricType: "development" },
        { rowIndex: 19, competencyName: "React — RTL/enzyme unit tests", rubricType: "development" },
        { rowIndex: 20, competencyName: "React — error boundaries", rubricType: "development" },
      ],
    },
    {
      name: "React Advanced",
      rows: [
        { rowIndex: 22, competencyName: "Rendering patterns (SSR/CSR/SSG/ISR/Next.js)", rubricType: "development" },
        { rowIndex: 23, competencyName: "React design patterns (Custom Hooks, HOC, etc.)", rubricType: "development" },
        { rowIndex: 24, competencyName: "Context API + useReducer", rubricType: "development" },
        { rowIndex: 25, competencyName: "useRef", rubricType: "development" },
        { rowIndex: 26, competencyName: "Memoization (useMemo, useCallback)", rubricType: "development" },
        { rowIndex: 27, competencyName: "Routing, lazy/Suspense, SPA/MPA PoV", rubricType: "development" },
        { rowIndex: 28, competencyName: "State management PoV (Redux, RTK, react-query, etc.)", rubricType: "development" },
        { rowIndex: 29, competencyName: "npm registries, dotenv, logging best practices", rubricType: "development" },
      ],
    },
    {
      name: "Node",
      rows: [
        { rowIndex: 31, competencyName: "Node — architectural concepts (MicroServices, 12-factor, etc.)", rubricType: "architecture" },
        { rowIndex: 32, competencyName: "Node — HTTP server, request/response, codes", rubricType: "architecture" },
        { rowIndex: 33, competencyName: "Node — REST API, swagger/Postman", rubricType: "architecture" },
        { rowIndex: 34, competencyName: "Node — streaming (WebSockets, SSE)", rubricType: "architecture" },
        { rowIndex: 35, competencyName: "Node — databases, ORMs, Redis", rubricType: "architecture" },
        { rowIndex: 36, competencyName: "Node frameworks (fastify, koa, express, nest.js)", rubricType: "architecture" },
      ],
    },
    {
      name: "GraphQL",
      rows: [
        { rowIndex: 38, competencyName: "GraphQL — Apollo, AppSync, Hasura, Prisma", rubricType: "architecture" },
        { rowIndex: 39, competencyName: "GraphQL — caching strategies", rubricType: "architecture" },
        { rowIndex: 40, competencyName: "GraphQL — batching, introspection, scalars", rubricType: "architecture" },
        { rowIndex: 41, competencyName: "GraphQL — errors and arguments", rubricType: "architecture" },
        { rowIndex: 42, competencyName: "GraphQL — schema + resolvers + Playground", rubricType: "architecture" },
        { rowIndex: 43, competencyName: "GraphQL — clients", rubricType: "architecture" },
      ],
    },
  ],
};
