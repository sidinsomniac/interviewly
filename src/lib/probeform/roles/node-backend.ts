// ============================================================
// Node.js Backend Engineer role schema.
//
// Sub-Phase D: generated via scripts/generate-role-schemas.ts on
// 2026-05-27 against DeepSeek V4-Flash. Categories + competency rows
// + exercises drafted by the LLM; header block injected to match the
// universal Excel cell layout (verified in Sub-Phase D).
//
// Excel template: data/templates/node-backend.xlsx
// Sheet:          "2 - Node Backend"
// ============================================================

import type { RoleSchema } from "../types";

export const nodeBackendSchema: RoleSchema = {
  roleId: "node-backend",
  displayName: "Node.js Backend Engineer",
  excelTemplate: "data/templates/node-backend.xlsx",
  sheetName: "2 - Node Backend",

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
      name: "Runtime & Event Loop",
      rows: [
        { rowIndex: 14, competencyName: "Event Loop — microtasks vs macrotasks order", rubricType: "architecture" },
        { rowIndex: 15, competencyName: "Worker Threads — shared memory vs message passing", rubricType: "architecture" },
        { rowIndex: 16, competencyName: "Streams — backpressure handling with highWaterMark", rubricType: "development" },
        { rowIndex: 17, competencyName: "Node 20 Test Runner — describe/it vs Jest migration", rubricType: "development" },
        { rowIndex: 18, competencyName: "ESM vs CJS — interop and package.json exports", rubricType: "development" },
        { rowIndex: 19, competencyName: "Error Handling — async error propagation and unhandledRejection", rubricType: "development" },
        { rowIndex: 20, competencyName: "Cluster vs Worker Threads — scaling strategies", rubricType: "architecture" },
      ],
    },
    {
      name: "Frameworks & API Design",
      rows: [
        { rowIndex: 22, competencyName: "Fastify — schema-based validation and serialization", rubricType: "development" },
        { rowIndex: 23, competencyName: "NestJS — dependency injection and module scoping", rubricType: "development" },
        { rowIndex: 24, competencyName: "Express — middleware error handling and async wrappers", rubricType: "development" },
        { rowIndex: 25, competencyName: "Zod — schema composition and discriminated unions", rubricType: "development" },
        { rowIndex: 26, competencyName: "GraphQL — DataLoader batching and caching", rubricType: "architecture" },
        { rowIndex: 27, competencyName: "Microservice Patterns — saga vs CQRS tradeoffs", rubricType: "architecture" },
        { rowIndex: 28, competencyName: "OpenTelemetry — trace propagation and span context", rubricType: "development" },
        { rowIndex: 29, competencyName: "API Versioning — header vs URI vs content negotiation", rubricType: "architecture" },
      ],
    },
    {
      name: "Data & Messaging",
      rows: [
        { rowIndex: 31, competencyName: "Prisma — relation queries and N+1 prevention", rubricType: "development" },
        { rowIndex: 32, competencyName: "TypeORM — query builder vs find options performance", rubricType: "development" },
        { rowIndex: 33, competencyName: "BullMQ — job lifecycle and rate limiting", rubricType: "development" },
        { rowIndex: 34, competencyName: "Redis — pub/sub vs streams for message queues", rubricType: "architecture" },
        { rowIndex: 35, competencyName: "Database Migrations — rollback strategies and zero-downtime", rubricType: "architecture" },
        { rowIndex: 36, competencyName: "Caching — Redis TTL and cache invalidation patterns", rubricType: "architecture" },
      ],
    },
    {
      name: "Tooling & Observability",
      rows: [
        { rowIndex: 38, competencyName: "pnpm — workspace protocol and dependency hoisting", rubricType: "development" },
        { rowIndex: 39, competencyName: "Vitest — mocking and coverage with c8", rubricType: "development" },
        { rowIndex: 40, competencyName: "Docker — multi-stage builds and layer caching", rubricType: "development" },
        { rowIndex: 41, competencyName: "Node 20 — native fetch and undici", rubricType: "development" },
        { rowIndex: 42, competencyName: "Logging — structured logging and correlation IDs", rubricType: "development" },
        { rowIndex: 43, competencyName: "Health Checks — readiness vs liveness probes", rubricType: "architecture" },
      ],
    },
  ],

  exercises: [
    { id: "stream-aggregator", title: "Stream Aggregator", language: "typescript" },
    { id: "rate-limiter", title: "Rate Limiter Middleware", language: "typescript" },
    { id: "user-service-crud", title: "User Service CRUD with Zod", language: "typescript" },
    { id: "graphql-dataloader", title: "GraphQL DataLoader Batching", language: "typescript" },
    { id: "bullmq-job-processor", title: "BullMQ Job Processor", language: "typescript" },
  ],
};
