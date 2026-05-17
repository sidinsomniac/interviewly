export interface CompetencyRow {
  rowIndex: number;
  competencyName: string;
  rubricType: "architecture" | "development";
}

// Round 1 — Core (sheet: "1 - HTML, CSS & NFRs"), rows 14–41
export const CORE_ROWS: CompetencyRow[] = [
  // ARCHITECTURE (rows 14–19)
  { rowIndex: 14, competencyName: "Architecture (frontend, MFE, SPA/MPA, ModuleFederation, etc.)", rubricType: "architecture" },
  { rowIndex: 15, competencyName: "Tech-stack decision clarity", rubricType: "architecture" },
  { rowIndex: 16, competencyName: "Rendering techniques (SSR/CSR/SSG/ISR/ESR/PWA)", rubricType: "architecture" },
  { rowIndex: 17, competencyName: "Design system & CSS organization PoV", rubricType: "architecture" },
  { rowIndex: 18, competencyName: "Hands-on with Design Systems, Storybook, Design Tokens", rubricType: "architecture" },
  { rowIndex: 19, competencyName: "PWA (browser caching, service workers, strategies)", rubricType: "architecture" },
  // Web Basics / HTML / CSS (rows 21–26)
  { rowIndex: 21, competencyName: "HTML — semantic, DOM", rubricType: "development" },
  { rowIndex: 22, competencyName: "HTML — native forms, validation, FormData", rubricType: "development" },
  { rowIndex: 23, competencyName: "Browser storage (cookies / localStorage / sessionStorage / IndexedDB)", rubricType: "development" },
  { rowIndex: 24, competencyName: "CSS — CSSOM, selectors, cascading, specificity", rubricType: "development" },
  { rowIndex: 25, competencyName: "Responsive design, layouts (flex, grid, float)", rubricType: "development" },
  { rowIndex: 26, competencyName: "Preprocessors, frameworks, CSS-in-JS", rubricType: "development" },
  // JavaScript / TypeScript (rows 28–34)
  { rowIndex: 28, competencyName: "JS — events, DOM manipulation", rubricType: "development" },
  { rowIndex: 29, competencyName: "JS — promises, fetch, modules, debounce/throttle", rubricType: "development" },
  { rowIndex: 30, competencyName: "Code structure quality", rubricType: "architecture" },
  { rowIndex: 31, competencyName: "Unit testing", rubricType: "architecture" },
  { rowIndex: 32, competencyName: "TS — basics", rubricType: "development" },
  { rowIndex: 33, competencyName: "TS — advanced types", rubricType: "development" },
  { rowIndex: 34, competencyName: "TS — with frameworks + tsconfig", rubricType: "architecture" },
  // Tooling & Bundlers (rows 36–37)
  { rowIndex: 36, competencyName: "Bundlers (webpack, vite, etc.)", rubricType: "architecture" },
  { rowIndex: 37, competencyName: "Tooling (linters, formatters, git hooks)", rubricType: "architecture" },
  // NFRs (rows 39–41)
  { rowIndex: 39, competencyName: "NFR — Performance", rubricType: "architecture" },
  { rowIndex: 40, competencyName: "NFR — Security", rubricType: "architecture" },
  { rowIndex: 41, competencyName: "NFR — Accessibility", rubricType: "architecture" },
];

// Round 2 — Framework React (sheet: "2 - FW React"), rows 14–43
export const REACT_ROWS: CompetencyRow[] = [
  // React Basics (rows 14–20)
  { rowIndex: 14, competencyName: "React Basics — nested components, JSX, conditional rendering", rubricType: "development" },
  { rowIndex: 15, competencyName: "React — styling (CSS or CSS-in-JS)", rubricType: "development" },
  { rowIndex: 16, competencyName: "React — fragments, useEffect, useState", rubricType: "development" },
  { rowIndex: 17, competencyName: "React — lists, key attribute", rubricType: "development" },
  { rowIndex: 18, competencyName: "React — forms, AJAX, validation", rubricType: "development" },
  { rowIndex: 19, competencyName: "React — RTL/enzyme unit tests", rubricType: "development" },
  { rowIndex: 20, competencyName: "React — error boundaries", rubricType: "development" },
  // React Advanced (rows 22–29)
  { rowIndex: 22, competencyName: "Rendering patterns (SSR/CSR/SSG/ISR/Next.js)", rubricType: "development" },
  { rowIndex: 23, competencyName: "React design patterns (Custom Hooks, HOC, etc.)", rubricType: "development" },
  { rowIndex: 24, competencyName: "Context API + useReducer", rubricType: "development" },
  { rowIndex: 25, competencyName: "useRef", rubricType: "development" },
  { rowIndex: 26, competencyName: "Memoization (useMemo, useCallback)", rubricType: "development" },
  { rowIndex: 27, competencyName: "Routing, lazy/Suspense, SPA/MPA PoV", rubricType: "development" },
  { rowIndex: 28, competencyName: "State management PoV (Redux, RTK, react-query, etc.)", rubricType: "development" },
  { rowIndex: 29, competencyName: "npm registries, dotenv, logging best practices", rubricType: "development" },
  // Node (rows 31–36)
  { rowIndex: 31, competencyName: "Node — architectural concepts (MicroServices, 12-factor, etc.)", rubricType: "architecture" },
  { rowIndex: 32, competencyName: "Node — HTTP server, request/response, codes", rubricType: "architecture" },
  { rowIndex: 33, competencyName: "Node — REST API, swagger/Postman", rubricType: "architecture" },
  { rowIndex: 34, competencyName: "Node — streaming (WebSockets, SSE)", rubricType: "architecture" },
  { rowIndex: 35, competencyName: "Node — databases, ORMs, Redis", rubricType: "architecture" },
  { rowIndex: 36, competencyName: "Node frameworks (fastify, koa, express, nest.js)", rubricType: "architecture" },
  // GraphQL (rows 38–43)
  { rowIndex: 38, competencyName: "GraphQL — Apollo, AppSync, Hasura, Prisma", rubricType: "architecture" },
  { rowIndex: 39, competencyName: "GraphQL — caching strategies", rubricType: "architecture" },
  { rowIndex: 40, competencyName: "GraphQL — batching, introspection, scalars", rubricType: "architecture" },
  { rowIndex: 41, competencyName: "GraphQL — errors and arguments", rubricType: "architecture" },
  { rowIndex: 42, competencyName: "GraphQL — schema + resolvers + Playground", rubricType: "architecture" },
  { rowIndex: 43, competencyName: "GraphQL — clients", rubricType: "architecture" },
];

export const ROWS_BY_ROUND: Record<"Core" | "React", CompetencyRow[]> = {
  Core: CORE_ROWS,
  React: REACT_ROWS,
};
