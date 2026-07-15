import { z } from 'zod';

const MAX_URL_LENGTH = 2_048;
const MAX_PASTE_LENGTH = 5_000_000;
const MAX_HTML_LENGTH = 5_000_000;
const MAX_BODY_LENGTH = 500_000;
const MAX_ENTITY_NAME_LENGTH = 120;

const optionalUrl = z.string().trim().max(MAX_URL_LENGTH).optional();
const contentHash = z.string().regex(/^[a-f0-9]{32}$/i);
const runId = z.string().uuid();

export const extractRequestSchema = z
  .object({
    url: optionalUrl,
    pasteContent: z.string().max(MAX_PASTE_LENGTH).optional(),
    pasteFormat: z.enum(['text', 'html']).default('text'),
    mainTopicOverride: z.string().trim().max(MAX_ENTITY_NAME_LENGTH).optional(),
    clearCache: z.boolean().optional().default(false),
    runQueryCoverage: z.boolean().optional().default(false),
  })
  .refine(
    (value) => Boolean(value.url) !== Boolean(value.pasteContent?.trim()),
    { message: 'Provide exactly one of url or pasteContent.' },
  );

export const rawEntitySchema = z.object({
  name: z.string().trim().min(1).max(MAX_ENTITY_NAME_LENGTH),
  type: z
    .enum([
      'Person',
      'Organization',
      'Place',
      'Product',
      'Event',
      'CreativeWork',
      'Service',
      'Brand',
      'Concept',
      'Technology',
      'LocalBusiness',
      'Thing',
    ])
    .optional(),
});

export const enrichedEntitySchema = rawEntitySchema.extend({
  type: z.enum([
    'Person',
    'Organization',
    'Place',
    'Product',
    'Event',
    'CreativeWork',
    'Service',
    'Brand',
    'Concept',
    'Technology',
    'LocalBusiness',
    'Thing',
  ]),
  confidenceScore: z.number().min(0).max(100),
  wikipediaUrl: z.string().url().nullable(),
  wikidataUrl: z.string().url().nullable(),
  googleKgUrl: z.string().url().nullable(),
  productOntologyUrl: z.string().url().nullable(),
  linkedinUrl: z.string().url().nullable().optional(),
});

export const textPartsSchema = z.object({
  title: z.string().max(1_000),
  description: z.string().max(5_000),
  headings: z
    .array(
      z.object({
        level: z.number().int().min(1).max(6),
        text: z.string().max(1_000),
      }),
    )
    .max(200),
  body: z.string().max(MAX_BODY_LENGTH),
  htmlContent: z.string().max(MAX_HTML_LENGTH),
});

export const enrichRequestSchema = z.object({
  entities: z.array(rawEntitySchema).min(1).max(20),
  mainTopic: z.string().trim().min(1).max(MAX_ENTITY_NAME_LENGTH),
  htmlContent: z.string().max(MAX_HTML_LENGTH).optional(),
  contentHash,
  analysisRunId: runId,
});

export const generateRequestSchema = z.object({
  enrichedEntities: z.array(enrichedEntitySchema).max(20),
  textParts: textPartsSchema,
  mainTopic: z.string().trim().min(1).max(MAX_ENTITY_NAME_LENGTH),
  topicConfidence: z.number().min(0).max(1),
  url: optionalUrl.default(''),
  contentHash,
  analysisRunId: runId,
});

export const fanoutRequestSchema = z.object({
  htmlContent: z.string().min(1).max(MAX_HTML_LENGTH),
  url: optionalUrl,
  contentHash,
  clearCache: z.boolean().optional().default(false),
  analysisRunId: runId,
});

export const finalizeRequestSchema = z.object({
  analysisRunId: runId,
  status: z.enum(['complete', 'failed']),
  entitiesFound: z.number().int().min(0).max(20).optional(),
  processingTimeMs: z.number().int().min(0).max(900_000).optional(),
  errorStep: z.enum(['extract', 'enrich', 'generate', 'fanout']).optional(),
  errorMessage: z.string().max(500).optional(),
});

export function formatZodError(error: z.ZodError): string {
  return error.issues.map((issue) => issue.message).join(' ');
}
