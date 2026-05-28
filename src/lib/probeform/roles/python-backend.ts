// ============================================================
// Python Backend Engineer role schema.
//
// Sub-Phase D: generated via scripts/generate-role-schemas.ts on
// 2026-05-27 against DeepSeek V4-Flash. Categories + competency rows
// + exercises drafted by the LLM; header block injected to match the
// universal Excel cell layout (verified in Sub-Phase D).
//
// Excel template: data/templates/python-backend.xlsx
// Sheet:          "2 - Python Backend"
// ============================================================

import type { RoleSchema } from "../types";

export const pythonBackendSchema: RoleSchema = {
  roleId: "python-backend",
  displayName: "Python Backend Engineer",
  excelTemplate: "data/templates/python-backend.xlsx",
  sheetName: "2 - Python Backend",

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
      name: "Async & Concurrency",
      rows: [
        { rowIndex: 14, competencyName: "asyncio — event loop + coroutine lifecycle", rubricType: "architecture" },
        { rowIndex: 15, competencyName: "async/await — blocking vs non-blocking I/O pitfalls", rubricType: "development" },
        { rowIndex: 16, competencyName: "GIL — impact on CPU-bound vs I/O-bound tasks", rubricType: "architecture" },
        { rowIndex: 17, competencyName: "asyncio.gather vs asyncio.create_task vs asyncio.wait", rubricType: "development" },
        { rowIndex: 18, competencyName: "async context managers + async generators", rubricType: "development" },
        { rowIndex: 19, competencyName: "uvicorn + gunicorn worker model (async workers)", rubricType: "architecture" },
        { rowIndex: 20, competencyName: "async-django — ASGI vs WSGI + middleware", rubricType: "architecture" },
      ],
    },
    {
      name: "ORM & Data Access",
      rows: [
        { rowIndex: 22, competencyName: "SQLAlchemy 2.x — select() vs query() + eager loading", rubricType: "development" },
        { rowIndex: 23, competencyName: "Django ORM — select_related vs prefetch_related + subqueries", rubricType: "development" },
        { rowIndex: 24, competencyName: "N+1 query detection and mitigation strategies", rubricType: "architecture" },
        { rowIndex: 25, competencyName: "Index design — composite indexes, partial indexes, covering indexes", rubricType: "architecture" },
        { rowIndex: 26, competencyName: "SQLAlchemy — session lifecycle + flush vs commit", rubricType: "development" },
        { rowIndex: 27, competencyName: "Django ORM — F() expressions + annotate vs aggregate", rubricType: "development" },
        { rowIndex: 28, competencyName: "Raw SQL vs ORM tradeoffs + SQL injection prevention", rubricType: "architecture" },
        { rowIndex: 29, competencyName: "Migrations — Alembic vs Django migrations + zero-downtime", rubricType: "architecture" },
      ],
    },
    {
      name: "Web Frameworks & APIs",
      rows: [
        { rowIndex: 31, competencyName: "FastAPI — dependency injection + Depends() scoping", rubricType: "development" },
        { rowIndex: 32, competencyName: "Django REST Framework — serializers + ViewSets vs APIView", rubricType: "development" },
        { rowIndex: 33, competencyName: "Pydantic v2 — model_validator vs field_validator + custom types", rubricType: "development" },
        { rowIndex: 34, competencyName: "Middleware — custom middleware for auth/logging/rate limiting", rubricType: "architecture" },
        { rowIndex: 35, competencyName: "Background tasks — Celery vs FastAPI BackgroundTasks + task routing", rubricType: "architecture" },
        { rowIndex: 36, competencyName: "API versioning strategies — URL vs header vs content negotiation", rubricType: "architecture" },
      ],
    },
    {
      name: "Testing & Type Safety",
      rows: [
        { rowIndex: 38, competencyName: "pytest — fixtures + conftest scoping + parametrize", rubricType: "development" },
        { rowIndex: 39, competencyName: "mypy — strict mode + type narrowing + overloads", rubricType: "development" },
        { rowIndex: 40, competencyName: "Mocking — unittest.mock vs pytest-mock + patching strategies", rubricType: "development" },
        { rowIndex: 41, competencyName: "Integration testing — test containers vs fixtures + database isolation", rubricType: "architecture" },
        { rowIndex: 42, competencyName: "Property-based testing — hypothesis + strategies", rubricType: "development" },
        { rowIndex: 43, competencyName: "Type hints — generics + Protocols vs ABC + TypedDict", rubricType: "development" },
      ],
    },
  ],

  exercises: [
    { id: "rate-limiter", title: "Rate Limiter with Token Bucket", language: "python" },
    { id: "user-service-crud", title: "User CRUD with Async SQLAlchemy", language: "python" },
    { id: "stream-aggregator", title: "Streaming Log Aggregator with asyncio", language: "python" },
    { id: "task-queue-worker", title: "Celery Task Queue for Image Processing", language: "python" },
  ],
};
