import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

interface FeedbackBody {
  type?: 'bug' | 'feature' | 'improvement' | 'other';
  message?: string;
  pageUrl?: string;
}

const TYPE_EMOJI: Record<string, string> = {
  bug: ':bug:',
  feature: ':sparkles:',
  improvement: ':bulb:',
  other: ':speech_balloon:',
};

const TYPE_LABEL: Record<string, string> = {
  bug: 'Bug Report',
  feature: 'Feature Request',
  improvement: 'Improvement',
  other: 'Other Feedback',
};

async function sendSlackNotification(payload: {
  type: string;
  message: string;
  userEmail: string;
  pageUrl?: string;
  userAgent?: string;
}): Promise<void> {
  const webhook = process.env.SLACK_FEEDBACK_WEBHOOK_URL;
  if (!webhook) return;

  const blocks: Record<string, unknown>[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${TYPE_EMOJI[payload.type] || ':memo:'} New ${process.env.FEEDBACK_PROJECT_NAME || 'Ontologizer'} feedback: ${TYPE_LABEL[payload.type] || payload.type}`,
        emoji: true,
      },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*From:*\n${payload.userEmail}` },
        {
          type: 'mrkdwn',
          text: `*Type:*\n${TYPE_LABEL[payload.type] || payload.type}`,
        },
      ],
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*Message:*\n${payload.message}` },
    },
  ];

  if (payload.pageUrl) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Page:*\n<${payload.pageUrl}|${payload.pageUrl}>`,
      },
    });
  }

  blocks.push(
    { type: 'divider' },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Submitted ${new Date().toISOString()}${payload.userAgent ? ` · ${payload.userAgent}` : ''}`,
        },
      ],
    },
  );

  try {
    await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blocks }),
    });
  } catch (err) {
    console.error('Slack webhook failed:', err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as FeedbackBody;
    const { type = 'other', message, pageUrl } = body;

    if (!message || !message.trim()) {
      return NextResponse.json(
        { error: 'Message is required.' },
        { status: 400 },
      );
    }
    if (!['bug', 'feature', 'improvement', 'other'].includes(type)) {
      return NextResponse.json(
        { error: 'Invalid feedback type.' },
        { status: 400 },
      );
    }
    if (message.length > 4000) {
      return NextResponse.json(
        { error: 'Feedback message is too long (4000 char max).' },
        { status: 400 },
      );
    }

    // Signed-in users: attach their email. Anonymous feedback is allowed.
    let userEmail = 'Anonymous';
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email) userEmail = user.email;
    } catch {
      // Supabase not configured or anon — fine, treat as anonymous
    }

    const userAgent = request.headers.get('user-agent') || undefined;

    await sendSlackNotification({
      type,
      message: message.trim(),
      userEmail,
      pageUrl: pageUrl || undefined,
      userAgent,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
