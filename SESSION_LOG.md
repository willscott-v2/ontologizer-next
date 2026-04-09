# Session Log

## 2026-04-08/09: Initial Build (Phases 1-5)

### What was done
- Created the standalone Next.js app from scratch (Next.js 16, React 19, Tailwind v4, shadcn/ui)
- Ported the entire WordPress plugin processing pipeline to TypeScript:
  - **Phase 1**: Project scaffold, Supabase schema, auth flow, Settings page, AnalyzerForm
  - **Phase 2**: Core pipeline (fetcher, parser, entity extractor, 5 enricher modules with parallel execution)
  - **Phase 3**: 7 schema generators, SEO analyzer, salience scorer, Gemini fan-out analyzer
  - **Phase 4**: useAnalysis state machine hook, 8 result display components, markdown export
  - **Phase 5**: Entity cache + analysis cache (Supabase), free-tier metering (5/month), usage logging

### Decisions made
- **Full replacement** of WordPress plugin (WP version to be deprecated)
- **Anonymous BYOK** - no signup required to use with own keys
- **4-step client-orchestrated pipeline** to work within Vercel timeout limits
- **Parallel enrichment** using Promise.allSettled (vs sequential PHP with 500ms delays)
- **TextParts** fields: `title`, `description`, `headings`, `body`, `htmlContent`
- **EntityType** values are PascalCase: 'Person', 'Organization', etc.
- shadcn/ui uses `@base-ui/react` (not Radix) in this version - no `asChild` prop on Button
- Repo name will be `ontologizer` (currently at `ontologizer-next` to avoid conflict with WP repo)

### Open items / next steps
- **Connect real Supabase** project and test end-to-end with real URLs
- **Test BYOK flow** with actual API keys
- **Test free tier** metering (signup, run 5 analyses, verify 6th is blocked)
- **Responsive design** pass for mobile
- **Deploy to Vercel** with environment variables
- **Rename/move repo** from `ontologizer-next` to `ontologizer` once WP version is archived
- Consider adding analysis history page for logged-in users
- Consider SSE streaming for enrichment progress (nice-to-have)
- The prior `ontologizer-app` directory at ~/Development/ontologizer-app is an older attempt (Nov 2024, Next.js 14) - can be archived/deleted

### Context for next session
- The build passes clean (`npm run build` succeeds)
- All pipeline logic is ported but untested against real APIs
- Entity cache integration is in the enrich route; metering is in the extract route
- The `useAnalysis` hook in hooks/useAnalysis.ts is the main orchestrator
- The plan file with full architecture details is at ~/.claude/plans/linear-popping-tulip.md
