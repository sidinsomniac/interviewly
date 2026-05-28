// ============================================================
// Java Backend Engineer role schema.
//
// Sub-Phase D: generated via scripts/generate-role-schemas.ts on
// 2026-05-27 against DeepSeek V4-Flash. Categories + competency rows
// + exercises drafted by the LLM; header block injected to match the
// universal Excel cell layout (verified in Sub-Phase D).
//
// Excel template: data/templates/java-backend.xlsx
// Sheet:          "2 - Java Backend"
// ============================================================

import type { RoleSchema } from "../types";

export const javaBackendSchema: RoleSchema = {
  roleId: "java-backend",
  displayName: "Java Backend Engineer",
  excelTemplate: "data/templates/java-backend.xlsx",
  sheetName: "2 - Java Backend",

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
      name: "Spring Boot & Autoconfiguration",
      rows: [
        { rowIndex: 14, competencyName: "Spring Boot — @ConditionalOnClass / @ConditionalOnProperty", rubricType: "architecture" },
        { rowIndex: 15, competencyName: "Spring Boot — auto-configuration ordering / overriding", rubricType: "architecture" },
        { rowIndex: 16, competencyName: "Spring Boot — embedded Tomcat vs Undertow vs Netty", rubricType: "architecture" },
        { rowIndex: 17, competencyName: "Spring Boot — actuator endpoints / health indicators", rubricType: "development" },
        { rowIndex: 18, competencyName: "Spring Boot — @ConfigurationProperties vs @Value", rubricType: "development" },
        { rowIndex: 19, competencyName: "Spring Boot — profile-specific configuration / YAML multi-document", rubricType: "development" },
        { rowIndex: 20, competencyName: "Spring Boot — spring.factories / auto-configuration imports", rubricType: "architecture" },
      ],
    },
    {
      name: "Spring Data JPA & Hibernate",
      rows: [
        { rowIndex: 22, competencyName: "JPA — N+1 query detection / @EntityGraph", rubricType: "development" },
        { rowIndex: 23, competencyName: "Hibernate — first-level vs second-level cache", rubricType: "architecture" },
        { rowIndex: 24, competencyName: "JPA — @OneToMany fetch strategies (LAZY vs EAGER)", rubricType: "development" },
        { rowIndex: 25, competencyName: "Hibernate — batch fetching / @BatchSize", rubricType: "development" },
        { rowIndex: 26, competencyName: "Spring Data JPA — derived query methods vs @Query", rubricType: "development" },
        { rowIndex: 27, competencyName: "JPA — optimistic vs pessimistic locking", rubricType: "architecture" },
        { rowIndex: 28, competencyName: "Hibernate — inheritance strategies (JOINED vs TABLE_PER_CLASS)", rubricType: "architecture" },
        { rowIndex: 29, competencyName: "Spring Data JPA — Specification / QueryDSL", rubricType: "development" },
      ],
    },
    {
      name: "Transaction Management & Concurrency",
      rows: [
        { rowIndex: 31, competencyName: "Spring — @Transactional propagation (REQUIRED vs REQUIRES_NEW)", rubricType: "development" },
        { rowIndex: 32, competencyName: "Spring — @Transactional isolation levels (READ_COMMITTED vs REPEATABLE_READ)", rubricType: "architecture" },
        { rowIndex: 33, competencyName: "Java — synchronized vs ReentrantLock vs StampedLock", rubricType: "development" },
        { rowIndex: 34, competencyName: "Java — ConcurrentHashMap internal segments / computeIfAbsent", rubricType: "development" },
        { rowIndex: 35, competencyName: "Java — ExecutorService / ThreadPoolExecutor tuning", rubricType: "architecture" },
        { rowIndex: 36, competencyName: "Java — volatile vs AtomicInteger vs LongAdder", rubricType: "development" },
      ],
    },
    {
      name: "REST, Security & Observability",
      rows: [
        { rowIndex: 38, competencyName: "REST — HATEOAS / Richardson Maturity Model", rubricType: "architecture" },
        { rowIndex: 39, competencyName: "Spring Security — OAuth2 / JWT token validation", rubricType: "development" },
        { rowIndex: 40, competencyName: "Spring Security — method security (@PreAuthorize)", rubricType: "development" },
        { rowIndex: 41, competencyName: "Micrometer — custom metrics / @Timed", rubricType: "development" },
        { rowIndex: 42, competencyName: "Docker — multi-stage builds / layer caching", rubricType: "architecture" },
        { rowIndex: 43, competencyName: "Project Reactor — Mono vs Flux / backpressure", rubricType: "development" },
      ],
    },
  ],

  exercises: [
    { id: "rate-limiter", title: "Rate Limiter", language: "java" },
    { id: "order-service-crud", title: "Order Service CRUD", language: "java" },
    { id: "transactional-outbox", title: "Transactional Outbox", language: "java" },
    { id: "reactive-stream-aggregator", title: "Reactive Stream Aggregator", language: "java" },
  ],
};
