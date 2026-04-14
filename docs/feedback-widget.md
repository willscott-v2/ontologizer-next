# Feedback Widget

A drop-in "Send feedback" floating button that posts bug reports, feature requests, and general comments to a Slack channel via an incoming webhook. Supports anonymous and signed-in users (auto-attaches the Supabase user email when available).

Originally built for [Ontologizer](https://github.com/searchinfluence/ontologizer-next). Designed to be copy-pasted into any Next.js App Router project.

## What you get

- Fixed-position "Feedback" button (bottom-right)
- Modal with 4 feedback types: Bug, Feature, Improvement, Other
- Posts to Slack as a formatted message (header, fields, message body, page URL, timestamp, user agent)
- Auto-attaches signed-in user's email (optional — works fine without Supabase)
- Configurable project name so one Slack webhook can serve many projects

## Files to copy

| From ontologizer-next | Into your project |
|---|---|
| [components/feedback/FeedbackWidget.tsx](../components/feedback/FeedbackWidget.tsx) | `components/feedback/FeedbackWidget.tsx` |
| [app/api/feedback/route.ts](../app/api/feedback/route.ts) | `app/api/feedback/route.ts` |

That's it — two files.

## Environment variables

Add to your `.env.local`:

```bash
# Slack Incoming Webhook URL (reuse the same one across projects)
SLACK_FEEDBACK_WEBHOOK_URL=https://hooks.slack.com/services/...

# Project name shown in the Slack message header
FEEDBACK_PROJECT_NAME=YourProjectName
```

If `FEEDBACK_PROJECT_NAME` is unset, the header falls back to "Ontologizer". Always set it in new projects so you can tell feedback apart in the shared Slack channel.

## Wire it into the layout

In `app/layout.tsx`, import the widget and drop it near the bottom of the body so it's globally available:

```tsx
import { FeedbackWidget } from "@/components/feedback/FeedbackWidget";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <FeedbackWidget />
      </body>
    </html>
  );
}
```

## Slack setup

**You only need to do this once, ever.** After that, reuse the webhook across all projects.

1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Create a new app (or open an existing "Feedback Bot" app) → **Incoming Webhooks** → toggle **On**
3. Click **"Add New Webhook to Workspace"** → pick the channel that should receive feedback
4. Copy the webhook URL → paste into each project's `SLACK_FEEDBACK_WEBHOOK_URL`

All projects post to the same channel. The `FEEDBACK_PROJECT_NAME` env var appears in every message header ("New ProjectX feedback: Bug Report") so it's obvious which app each message came from.

## Dependencies

The widget uses [`lucide-react`](https://lucide.dev) for icons (`MessageSquare`, `X`, `Check`, `Loader2`). If your project doesn't already use it:

```bash
npm install lucide-react
```

The API route uses Supabase's `createClient` from `@/lib/supabase/server` to fetch the signed-in user's email. If you don't have Supabase in the project, either:

- **Remove the Supabase block** (lines 121–127 in [route.ts](../app/api/feedback/route.ts#L121-L127)) — all feedback will post as Anonymous, OR
- **Replace with your auth system** — just set `userEmail` to whatever identifier you have

## Styling

The widget uses these CSS custom properties for brand colors:

- `--orange-accent` — primary button color
- `--orange-dark` — hover state
- `--si-slate` — modal background
- `--si-green` — success state

If your project doesn't define these, either add them to `globals.css` or edit [FeedbackWidget.tsx](../components/feedback/FeedbackWidget.tsx) to use your own colors (search for `var(--`).

## Testing

With the dev server running and env vars set:

1. Open any page in the app
2. Click the "Feedback" button in the bottom-right
3. Pick a type, write a message, submit
4. Check your Slack channel — a formatted message should appear within a second or two

If nothing shows up in Slack, check the server logs for `Slack webhook failed:` — usually a bad webhook URL or a network issue.

## API contract

For reference, the API route accepts:

```ts
POST /api/feedback
Content-Type: application/json

{
  type: 'bug' | 'feature' | 'improvement' | 'other',
  message: string,        // required, max 4000 chars
  pageUrl?: string        // optional, included in Slack message
}
```

Returns `{ success: true }` on success or `{ error: string }` with a 4xx/5xx status on failure.
