# AGENTS.md — WEB_NOVEL

## 1. PROJECT OVERVIEW

Project: WEB_NOVEL — Vietnamese Web Novel Platform.

Tech stack:

- Next.js 16 App Router
- React 19
- TypeScript (Strict Mode)
- MySQL
- Prisma ORM
- Tailwind CSS
- shadcn/ui
- React Hook Form
- Zod
- GSAP
- Axios
- Socket.IO (real-time features)
- Yjs (collaborative editor, when applicable)

Architecture:

- Next.js App Router
- Server Components by default
- Client Components only when necessary
- API/business logic separated from UI
- Prisma as database access layer
- Zod for input validation
- Authentication and authorization enforced server-side

Primary product features:

- User authentication and profiles
- Story discovery and search
- Story details
- Volume and chapter management
- Chapter reading experience
- Reading history
- Follow/bookmark stories
- Comments and interactions
- Wallet and transactions
- Notifications
- Real-time collaboration editor

## 2. ABSOLUTE RULES

1. This is a WEB application.
   - NEVER use React Native.
   - NEVER activate or use `vercel-react-native-skills`.
   - Prefer Next.js, React DOM and web-specific solutions.

2. Do not rewrite existing architecture without understanding it.

3. Do not install new dependencies without explaining why they are necessary.

4. Do not modify unrelated files.

5. Do not delete existing functionality to make implementation easier.

6. Do not use `any` unless absolutely necessary and explicitly justified.

7. Never expose secrets, API keys, tokens or sensitive environment variables.

8. Do not invent database fields, API endpoints, environment variables or existing functionality.
   Inspect the actual project first.

9. Follow existing naming conventions, folder structure and coding patterns.

10. Prefer simple, maintainable solutions over unnecessary abstractions.

11. Do not claim that a feature works unless it has been verified.

12. Never silently ignore errors or suppress TypeScript errors to make code compile.

13. Never change database configuration or run migrations against production.

14. Never write runtime-generated files to `public`; store runtime media with Cloudinary.

15. Reuse primitives from `components/ui` and patterns from `components/shared`; do not create ad-hoc button or input styles.

## 3. AGENT SKILLS SYSTEM

Before implementing a task:

1. Identify the task category.
2. Identify the relevant installed Agent Skills.
3. Read the corresponding SKILL.md files.
4. Apply only the skills relevant to the current task.
5. Do not load every skill unnecessarily.
6. If a requested skill is missing, identify the closest available alternative.
7. Never claim a skill was activated if its instructions were not actually read.

### 3.1 Skill Routing Table

| Task                           | Required Skills                              |
| ------------------------------ | -------------------------------------------- |
| New feature / architecture     | project-architect, writing-plans             |
| React / Next.js implementation | vercel-react-best-practices                  |
| Next.js performance            | vercel-optimize, vercel-react-best-practices |
| Component composition          | vercel-composition-patterns                  |
| UI / UX review                 | web-design-guidelines                        |
| Code quality / writing         | writing-guidelines                           |
| Deployment                     | deploy-to-vercel, vercel-cli-with-tokens     |
| GSAP implementation            | gsap-core, gsap-react                        |
| GSAP scrolling                 | gsap-scrolltrigger                           |
| GSAP animation performance     | gsap-performance                             |
| Advanced GSAP plugins          | gsap-plugins                                 |
| GSAP timeline                  | gsap-timeline                                |
| GSAP utilities                 | gsap-utils                                   |
| Page transitions               | vercel-react-view-transitions                |
| Debugging                      | systematic-debugging                         |
| Test-driven implementation     | test-driven-development                      |
| Implementation planning        | writing-plans                                |
| Final verification             | verification-before-completion               |
| Code review                    | code-review                                  |

Important:

- These are routing rules, not instructions to activate every listed skill.
- Use the skills actually installed in `.agents/skills/`.
- If a skill does not exist, do not pretend it exists.
- Do not use React Native skills under any circumstances.

### 3.2 Skill Selection Rules

For a task involving multiple areas:

- Select the minimum set of skills that covers the task.
- Combine skills when their responsibilities complement each other.
- Avoid loading overlapping skills without a clear reason.

Examples:

New reading feature:

- project-architect
- writing-plans
- vercel-react-best-practices
- web-design-guidelines

Optimize chapter page:

- vercel-optimize
- vercel-react-best-practices
- systematic-debugging
- verification-before-completion

GSAP reader animation:

- gsap-core
- gsap-react
- gsap-performance

Fix Prisma query:

- systematic-debugging
- prisma-client-api (if installed)
- vercel-react-best-practices (if React/Next.js integration is involved)

Code review:

- code-review
- vercel-react-best-practices (when reviewing React/Next.js code)

## 4. MANDATORY WORKFLOW

### Phase 1 — Understand

Before modifying code:

1. Restate the objective internally.
2. Identify affected features and modules.
3. Inspect structure and signatures first (use `leanctx` MCP tools when available before reading full files).
4. Inspect relevant files, types, schemas, APIs and database models.
5. Identify existing patterns and dependencies.
6. Identify potential side effects.

Do not scan the entire repository unless necessary.

Search for existing implementations before creating new ones.

### Phase 2 — Analyze

Evaluate:

- Correctness
- Performance
- Security
- Database impact
- Maintainability
- User experience
- Compatibility with existing architecture

For architectural decisions:

- Compare at least two approaches when meaningful.
- Explain performance trade-offs.
- Explain complexity and maintenance trade-offs.
- Consider bundle size and rendering behavior.
- Select the most appropriate approach.

Do not force multiple alternatives for trivial changes.

### Phase 3 — Plan

For medium and large tasks:

1. Define the implementation steps.
2. List files that need modification.
3. List new files if necessary.
4. Identify database migrations if needed.
5. Define tests and verification criteria.
6. Identify potential regressions.

Do not start implementation before the plan is clear.

For small fixes, use a lightweight plan.

### Phase 4 — Implement

During implementation:

- Make focused changes.
- Preserve existing conventions.
- Avoid unnecessary dependencies.
- Avoid duplicated business logic.
- Reuse existing components and utilities.
- Keep Server Components as the default.
- Use Client Components only when browser-side interactivity is required.
- Keep business logic out of presentation components.
- Use strong TypeScript types.

### Phase 5 — Verify

After implementation:

1. Run relevant lint checks.
2. Run TypeScript checks.
3. Run relevant tests.
4. Build the application when appropriate.
5. Inspect changed files.
6. Check for regressions.
7. Verify the requested behavior.

Do not report tests as passed if they were not executed.

### Phase 6 — Report

Provide:

- What changed
- Why the solution was chosen
- Files modified
- Database changes
- Tests executed
- Test results
- Remaining risks or limitations

Keep the report concise and factual.

## 5. ARCHITECTURE RULES

### 5.1 Next.js

- Use App Router conventions.
- Prefer Server Components.
- Use Server Actions or Route Handlers according to the existing architecture.
- Keep data access on the server.
- Do not expose server-only modules to client bundles.
- Avoid unnecessary `use client`.
- Avoid fetching data in multiple layers without a reason.
- Use metadata APIs correctly.
- Use loading and error boundaries where appropriate.

### 5.2 React

- Keep components focused on a single responsibility.
- Avoid giant components.
- Avoid unnecessary prop drilling.
- Use composition when it simplifies component relationships.
- Keep state as close as possible to where it is used.
- Avoid unnecessary context subscriptions.
- Use `useMemo` and `useCallback` only when they provide meaningful benefits.
- Do not use memoization as a substitute for fixing bad architecture.
- Avoid rerendering large content trees because of unrelated UI state changes.

### 5.3 TypeScript

- Enable and preserve strict typing.
- Prefer explicit interfaces and types for important boundaries.
- Avoid `any`.
- Avoid unnecessary type assertions.
- Properly type API responses.
- Properly type Prisma query results.
- Validate external input at runtime using Zod.

## 6. DATABASE AND PRISMA RULES

Use the Prisma-related skill when available.

### Query optimization

1. Use `select` to retrieve only required fields.
2. Avoid fetching large relational objects unnecessarily.
3. Avoid N+1 queries.
4. Use pagination for large collections.
5. Use cursor pagination for large or frequently changing lists where appropriate.
6. Every unbounded `findMany` must be reviewed.
7. Never fetch full chapter content when displaying a chapter list.
8. Avoid returning database-only fields to the client.
9. Inspect generated SQL when query behavior is unclear.
10. Consider database indexes based on actual query patterns.

### WEB_NOVEL-specific considerations

Story list:

- Fetch only required story fields.
- Avoid loading all chapters.
- Paginate results.

Story detail:

- Fetch only required metadata and statistics.
- Avoid loading complete chapter content.

Chapter list:

- Return chapter identifiers, titles, chapter numbers and necessary metadata.
- Do not retrieve full chapter content.

Chapter detail:

- Retrieve only the requested chapter content and necessary neighboring chapter metadata.
- Do not retrieve every chapter in a story just to display navigation.

Reading history:

- Avoid duplicate records where the business rule requires uniqueness.
- Use appropriate indexes.

Wallet:

- Use database transactions for balance changes.
- Ensure balance updates and transaction records remain consistent.
- Prevent double spending and race conditions.
- Never trust a client-provided wallet balance.

Comments:

- Paginate.
- Avoid loading unnecessary user relations.
- Apply authorization before modification or deletion.

### Database indexes

Before adding indexes:

1. Inspect the Prisma schema.
2. Inspect existing migrations.
3. Identify actual query filters and sorting.
4. Check whether an index already exists.
5. Add only useful indexes.

Consider:

- Foreign keys
- Story slug lookups
- Story and chapter relationships
- Chapter ordering
- Reading history queries
- Follow relationships
- Transaction history

Do not invent indexes without checking the schema.

## 7. API AND SECURITY

- Validate all external input with Zod.
- Enforce authentication on protected operations.
- Enforce authorization on resource-level operations.
- Never trust user IDs supplied by the client for ownership checks.
- Never trust client-provided prices or wallet balances.
- Prevent unauthorized chapter access.
- Prevent users from modifying another user's resources.
- Handle errors consistently.
- Avoid leaking database errors or internal stack traces.
- Apply rate limiting to sensitive endpoints where appropriate.
- Use transactions for operations requiring atomicity.
- Protect against duplicate requests and race conditions where relevant.

## 8. CACHING AND RENDERING

Use `vercel-optimize` and `vercel-react-best-practices` when relevant.

### General rules

- Distinguish request-level deduplication from persistent caching.
- Use `React.cache()` when request-scoped deduplication is appropriate.
- Use persistent caching only when data is suitable for it.
- Define an explicit invalidation strategy.
- Use the caching APIs supported by the actual installed Next.js version and project configuration.
- Do not blindly apply caching to every query.
- Do not cache personalized or authorization-dependent data in a shared cache.
- Do not cache data with side effects as if it were a pure read.

### Metadata and page data

When metadata and a page need the same data:

- Avoid duplicate database queries.
- Share an appropriate request-scoped data function.
- Ensure arguments and cache scope are consistent.

### Side effects

Separate pure reads from side effects:

- View counters
- Reading history updates
- Notifications
- Wallet changes
- Analytics events

Do not hide side effects inside functions intended to be cached.

### Cache invalidation

For mutations:

- Identify affected data.
- Define the invalidation strategy.
- Use appropriate tags or paths.
- Avoid broad invalidation when targeted invalidation is possible.

## 9. REACT STATE AND PERFORMANCE

Use `vercel-composition-patterns` when component composition or state architecture is involved.

- Keep state local when possible.
- Avoid placing all application state in a global provider.
- Separate authentication state from reader UI state.
- Avoid rerendering chapter content when changing font size, theme or reader settings.
- Avoid recalculating expensive derived data on unrelated renders.
- Use virtualization only when list size and rendering cost justify it.
- Avoid premature optimization.

### Reader-specific rules

The chapter reader is a performance-critical feature.

- Keep chapter content rendering isolated.
- Avoid unnecessary rerenders of the entire reader.
- Avoid loading all chapters for navigation.
- Paginate or fetch neighboring chapters as needed.
- Keep reading settings independent from chapter data.
- Avoid unnecessary client-side data duplication.
- Optimize scroll and progress tracking.
- Ensure keyboard navigation works correctly.

## 10. GSAP AND ANIMATION

Use relevant GSAP skills only when animation is requested or required.

Skill routing:

- gsap-core: fundamental GSAP animation.
- gsap-react: React integration.
- gsap-scrolltrigger: scroll-based animation.
- gsap-performance: animation optimization.
- gsap-plugins: advanced plugins.
- gsap-timeline: coordinated sequences.
- gsap-utils: reusable animation utilities.

Rules:

- Use `useGSAP()` where appropriate.
- Clean up animations, timelines and ScrollTriggers.
- Avoid memory leaks.
- Prefer transform and opacity for animation.
- Avoid animating expensive layout properties unnecessarily.
- Respect reduced-motion preferences.
- Avoid unnecessary animation libraries.
- Ensure animations do not interfere with reading or accessibility.

## 11. UI / UX AND ACCESSIBILITY

Use `web-design-guidelines` for UI reviews and user-facing component work.

- Mobile-first responsive design.
- Consistent spacing and typography.
- Consistent component behavior.
- Support dark mode.
- Use semantic HTML.
- Provide keyboard navigation.
- Maintain visible focus states.
- Use accessible labels.
- Manage focus correctly in dialogs and drawers.
- Respect reduced-motion preferences.
- Handle loading, empty and error states.
- Avoid unnecessary visual complexity.

### Reader interface

- Support left/right keyboard chapter navigation.
- Support mobile-friendly navigation.
- Ensure chapter content is readable.
- Make font size and theme settings accessible.
- Prevent drawers and overlays from blocking essential reading interactions.
- Keep the reading experience responsive.

## 12. DEBUGGING AND REFACTORING

Use `systematic-debugging` when available.

Required approach:

1. Reproduce the issue.
2. Identify expected and actual behavior.
3. Collect relevant evidence.
4. Trace the root cause.
5. Identify the smallest correct fix.
6. Implement the fix.
7. Add or update regression tests.
8. Verify the result.

Investigate the appropriate layer:

- Network waterfall
- Browser console
- React rendering
- Prisma query logs
- SQL execution
- API responses
- Authentication and authorization
- Cache behavior

Do not apply speculative fixes without evidence.

Do not refactor unrelated code during bug fixing.

## 13. TESTING STRATEGY

Use `test-driven-development` and `verification-before-completion` when available.

Prioritize testing critical business flows.

### Authentication

- Registration
- Login
- Logout
- Session validation
- Protected routes

### Reading

- Story details
- Chapter details
- Chapter navigation
- Reading history
- Reading progress
- Access restrictions

### Wallet

- Balance updates
- Transactions
- Concurrent requests
- Duplicate requests
- Insufficient balance
- Rollback on failure

### Social features

- Follow/unfollow
- Comments
- Notifications

### Editor

- Content persistence
- Concurrent editing
- Conflict handling
- Connection recovery

Use the testing tools already configured in the project.

Do not introduce a new testing framework without justification.

## 14. TOKEN AND CONTEXT EFFICIENCY

Token efficiency is important.

### MCP Context Compression (`leanctx`)

When `leanctx` MCP tools are available in the environment:

1. **Inspect structure first:** Use `leanctx` tree/skeleton inspection tools to map folder layouts, Prisma models, and function signatures before reading full files.
2. **Targeted full-file reads:** Only read complete file contents for the specific files scheduled for modification in Phase 3 (Plan).
3. **Large file protection:** Never dump full contents of `prisma/schema.prisma`, large Route Handlers, or long chapter reader components into context when only a specific symbol or relation is needed.
4. **Skip noise:** Exclude `node_modules`, `.next`, `prisma/migrations`, and lockfiles from context scans.

### General Context Rules

- Read only files relevant to the task.
- Search before opening large files.
- Do not repeatedly read the same file.
- Do not load all skills.
- Read only relevant SKILL.md files.
- Avoid unnecessary explanations during implementation.
- Avoid duplicating project documentation in responses.
- Prefer focused diffs.
- Avoid unrelated refactoring.
- Do not generate large documents unless requested.
- Keep plans concise but actionable.
- Summarize findings instead of repeatedly pasting source code.

Before reading a large file:

- Search for relevant symbols.
- Identify the necessary sections.
- Read only the required context.

## 15. GIT AND CHANGE MANAGEMENT

- Do not reset, revert or overwrite user changes.
- Inspect Git status before risky operations.
- Do not commit unless explicitly requested.
- Do not push unless explicitly requested.
- Do not change branches without permission.
- Preserve unrelated uncommitted work.
- Keep changes small and reviewable.
- Never use destructive Git commands without explicit approval.

## 16. FINAL RESPONSE FORMAT

After completing a task, respond using:

### Summary

What was implemented or fixed.

### Technical decisions

Important architectural or implementation decisions.

### Changed files

List modified and created files.

### Verification

- Lint:
- TypeScript:
- Tests:
- Build:

Mark checks as:

- Passed
- Failed
- Not run

### Remaining issues

Mention unresolved risks, limitations or follow-up work.

Never claim successful verification without actually running the relevant checks.
