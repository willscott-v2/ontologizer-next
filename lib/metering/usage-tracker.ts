import { createClient } from '@supabase/supabase-js';

const FREE_ANALYSES_PER_MONTH = 5;

/** Email domains that bypass the free-tier cap. Set via env for flexibility;
 *  falls back to Search Influence + webboss defaults. */
function getUnlimitedDomains(): string[] {
  const env = process.env.UNLIMITED_USAGE_DOMAINS;
  if (env) {
    return env
      .split(',')
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean);
  }
  return ['searchinfluence.com', 'webboss.com'];
}

function isUnlimitedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const domain = email.toLowerCase().split('@')[1];
  if (!domain) return false;
  return getUnlimitedDomains().includes(domain);
}

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export interface UsageCheck {
  allowed: boolean;
  remaining: number;
  reason?: string;
  unlimited?: boolean;
}

/**
 * Check if a user can use the free tier.
 * Returns { allowed, remaining } or { allowed: false, reason }.
 */
export async function checkFreeUsage(userId: string): Promise<UsageCheck> {
  const supabase = getServiceClient();
  if (!supabase) {
    return { allowed: false, remaining: 0, reason: 'Database not configured' };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('email, free_analyses_used, free_analyses_reset_at')
    .eq('id', userId)
    .single();

  if (!profile) {
    return { allowed: false, remaining: 0, reason: 'Profile not found' };
  }

  // Unlimited-domain bypass (Search Influence staff, partner domains)
  if (isUnlimitedEmail(profile.email)) {
    return { allowed: true, remaining: Number.POSITIVE_INFINITY, unlimited: true };
  }

  // Check if the monthly counter needs resetting
  const resetAt = new Date(profile.free_analyses_reset_at);
  const now = new Date();

  if (now > resetAt) {
    // Reset the counter
    const nextReset = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    await supabase
      .from('profiles')
      .update({ free_analyses_used: 0, free_analyses_reset_at: nextReset.toISOString() })
      .eq('id', userId);

    return { allowed: true, remaining: FREE_ANALYSES_PER_MONTH };
  }

  const used = profile.free_analyses_used ?? 0;
  const remaining = Math.max(0, FREE_ANALYSES_PER_MONTH - used);

  if (remaining <= 0) {
    return {
      allowed: false,
      remaining: 0,
      reason: `Free tier limit reached (${FREE_ANALYSES_PER_MONTH}/month). Add your own API keys or wait until next month.`,
    };
  }

  return { allowed: true, remaining };
}

/**
 * Increment the free usage counter for a user. Skips the increment for
 * unlimited-domain accounts so their counter stays at 0.
 */
export async function incrementFreeUsage(userId: string): Promise<void> {
  const supabase = getServiceClient();
  if (!supabase) return;

  const { data: profile } = await supabase
    .from('profiles')
    .select('email, free_analyses_used')
    .eq('id', userId)
    .single();

  if (!profile || isUnlimitedEmail(profile.email)) return;

  // Try atomic increment via RPC, fall back to direct update
  const { error } = await supabase.rpc('increment_free_analyses', { user_id: userId });
  if (error) {
    await supabase
      .from('profiles')
      .update({ free_analyses_used: (profile.free_analyses_used ?? 0) + 1 })
      .eq('id', userId);
  }
}

/**
 * Log an analysis for auditing/analytics.
 */
export async function logAnalysis(params: {
  userId?: string;
  url?: string;
  analysisType: 'full' | 'fanout_only' | 'paste';
  keySource: 'byok' | 'free_tier';
  entitiesFound?: number;
  processingTimeMs?: number;
}): Promise<void> {
  const supabase = getServiceClient();
  if (!supabase) return;

  await supabase.from('analysis_log').insert({
    user_id: params.userId ?? null,
    url: params.url ?? null,
    analysis_type: params.analysisType,
    key_source: params.keySource,
    entities_found: params.entitiesFound ?? 0,
    processing_time_ms: params.processingTimeMs ?? 0,
  });
}
