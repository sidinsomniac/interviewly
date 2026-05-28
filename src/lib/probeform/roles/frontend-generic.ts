// ============================================================
// Frontend Engineer (HTML/CSS/JS) role schema.
//
// Sub-Phase D: generated via scripts/generate-role-schemas.ts on
// 2026-05-27 against DeepSeek V4-Flash. Categories + competency rows
// + exercises drafted by the LLM; header block injected to match the
// universal Excel cell layout (verified in Sub-Phase D).
//
// Excel template: data/templates/frontend-generic.xlsx
// Sheet:          "1 - HTML, CSS & NFRs"
// ============================================================

import type { RoleSchema } from "../types";

export const frontendGenericSchema: RoleSchema = {
  roleId: "frontend-generic",
  displayName: "Frontend Engineer (HTML/CSS/JS)",
  excelTemplate: "data/templates/frontend-generic.xlsx",
  sheetName: "1 - HTML, CSS & NFRs",

  // Corrected mappings from Sub-Phase D verify pass (2026-05-27).
  // Cell addresses match data/templates/<roleId>.xlsx structurally.
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
      name: "HTML & Accessibility",
      rows: [
        { rowIndex: 14, competencyName: "HTML5 semantic elements — landmark roles + heading hierarchy", rubricType: "architecture" },
        { rowIndex: 15, competencyName: "ARIA — live regions, role=alert, aria-expanded, aria-controls", rubricType: "development" },
        { rowIndex: 16, competencyName: "Focus management — tabindex, focus trapping, skip links", rubricType: "development" },
        { rowIndex: 17, competencyName: "Screen reader testing — NVDA/VoiceOver patterns", rubricType: "development" },
        { rowIndex: 18, competencyName: "Forms — validation, error messages, aria-invalid, aria-describedby", rubricType: "development" },
        { rowIndex: 19, competencyName: "SEO — meta tags, Open Graph, structured data (JSON-LD)", rubricType: "architecture" },
        { rowIndex: 20, competencyName: "Security — CSP, CSRF tokens, XSS prevention", rubricType: "architecture" },
      ],
    },
    {
      name: "CSS & Layout",
      rows: [
        { rowIndex: 22, competencyName: "CSS Grid — grid-template-areas, auto-fit vs auto-fill, gap", rubricType: "development" },
        { rowIndex: 23, competencyName: "Flexbox — alignment, wrapping, order, flex shorthand", rubricType: "development" },
        { rowIndex: 24, competencyName: "Container queries — container-type, container-name, @container", rubricType: "development" },
        { rowIndex: 25, competencyName: "Custom properties — var(), @property, fallback strategies", rubricType: "development" },
        { rowIndex: 26, competencyName: "CSS layers — @layer, cascade control, specificity management", rubricType: "architecture" },
        { rowIndex: 27, competencyName: "CSS architecture — BEM, CUBE, naming conventions", rubricType: "architecture" },
        { rowIndex: 28, competencyName: "Responsive design — mobile-first, breakpoints, fluid typography", rubricType: "architecture" },
        { rowIndex: 29, competencyName: "Rendering pipeline — CSSOM, layout, paint, compositing", rubricType: "architecture" },
      ],
    },
    {
      name: "JavaScript & TypeScript",
      rows: [
        { rowIndex: 31, competencyName: "ES2023 — array findLast, toSorted, toReversed, with", rubricType: "development" },
        { rowIndex: 32, competencyName: "Modules — import/export, dynamic import, tree shaking", rubricType: "development" },
        { rowIndex: 33, competencyName: "Async iterators — for await...of, async generators", rubricType: "development" },
        { rowIndex: 34, competencyName: "Event loop — microtasks vs macrotasks, requestAnimationFrame", rubricType: "architecture" },
        { rowIndex: 35, competencyName: "TypeScript — utility types, generics, type guards", rubricType: "development" },
        { rowIndex: 36, competencyName: "Polyfills — core-js, transpilation, browser support strategies", rubricType: "architecture" },
      ],
    },
    {
      name: "Performance & PWA",
      rows: [
        { rowIndex: 38, competencyName: "Core Web Vitals — LCP, FID/INP, CLS measurement + optimization", rubricType: "architecture" },
        { rowIndex: 39, competencyName: "Service workers — install, activate, fetch, cache strategies", rubricType: "development" },
        { rowIndex: 40, competencyName: "PWA — manifest, offline support, push notifications", rubricType: "architecture" },
        { rowIndex: 41, competencyName: "Build tools — Vite config, HMR, code splitting", rubricType: "development" },
        { rowIndex: 42, competencyName: "Performance optimization — lazy loading, critical CSS, image optimization", rubricType: "architecture" },
        { rowIndex: 43, competencyName: "Browser APIs — IntersectionObserver, ResizeObserver, MutationObserver", rubricType: "development" },
      ],
    },
  ],

  exercises: [
    { id: "accessible-form", title: "Accessible Form with Validation", language: "javascript" },
    { id: "responsive-grid-layout", title: "Responsive Grid Layout", language: "javascript" },
    { id: "image-gallery-lazy-load", title: "Image Gallery with Lazy Loading", language: "javascript" },
    { id: "pwa-offline-page", title: "PWA Offline Page", language: "javascript" },
  ],
};
