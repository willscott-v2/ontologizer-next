import * as cheerio from 'cheerio';
import { ANALYSIS_VERSION } from '@/lib/analysis/version';
import type { EnrichedEntity } from '../types/entities';
import type {
  ClarityAssessment,
  ClarityCheck,
  ClarityDimension,
  ClarityEvidence,
  ClarityStatus,
  TextParts,
} from '../types/analysis';

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function excerpt(value: string, max = 180): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trim()}…`;
}

function topicAppears(value: string, mainTopic: string): boolean {
  const haystack = normalize(value);
  const topic = normalize(mainTopic);
  if (!topic) return false;
  if (haystack.includes(topic)) return true;
  const words = topic.split(' ').filter((word) => word.length > 2);
  return words.length > 0 && words.filter((word) => haystack.includes(word)).length / words.length >= 0.75;
}

function dimensionStatus(checks: ClarityCheck[]): ClarityStatus {
  const applicable = checks.filter((check) => check.status !== 'unavailable');
  if (applicable.length === 0) return 'unavailable';
  const failures = applicable.filter((check) => check.status === 'fail').length;
  const passes = applicable.filter((check) => check.status === 'pass').length;
  if (failures >= 2 || passes === 0) return 'weak';
  if (failures === 0 && passes / applicable.length >= 0.75) return 'strong';
  return 'mixed';
}

function makeDimension(
  checks: ClarityCheck[],
  evidence: ClarityEvidence[],
  summaries: Record<ClarityStatus, string>,
): ClarityDimension {
  const status = dimensionStatus(checks);
  return { status, summary: summaries[status], evidence, checks };
}

function topicFocus(textParts: TextParts, mainTopic: string): ClarityDimension {
  const h1s = textParts.headings.filter((heading) => heading.level === 1);
  const supportingHeadings = textParts.headings.filter((heading) => heading.level > 1);
  const opening = textParts.body.slice(0, 600);
  const evidence: ClarityEvidence[] = [
    { id: 'topic-title', source: 'title', text: excerpt(textParts.title || 'No page title found') },
    ...h1s.slice(0, 2).map((heading, index) => ({
      id: `topic-h1-${index + 1}`,
      source: 'h1' as const,
      text: excerpt(heading.text),
    })),
    { id: 'topic-opening', source: 'opening', text: excerpt(opening || 'No readable opening content found') },
  ];
  const headingMatch = supportingHeadings.find((heading) => topicAppears(heading.text, mainTopic));
  if (headingMatch) {
    evidence.push({ id: 'topic-supporting-heading', source: 'heading', text: excerpt(headingMatch.text) });
  } else if (supportingHeadings.length) {
    evidence.push({
      id: 'topic-supporting-headings-reviewed',
      source: 'heading',
      text: excerpt(supportingHeadings.slice(0, 5).map((heading) => heading.text).join(' | ')),
    });
  }

  const normalizedBody = normalize(textParts.body);
  const normalizedTopic = normalize(mainTopic);
  const occurrenceCount = normalizedTopic
    ? normalizedBody.split(normalizedTopic).length - 1
    : 0;
  const wordCount = normalizedBody.split(' ').filter(Boolean).length;
  const excessive = occurrenceCount > Math.max(12, Math.ceil(wordCount / 50));
  if (excessive) {
    evidence.push({
      id: 'topic-repetition-count',
      source: 'body',
      text: `The exact topic phrase appears ${occurrenceCount} times in ${wordCount} readable words.`,
    });
  }
  const checks: ClarityCheck[] = [
    {
      id: 'topic-in-title',
      label: 'Topic in page title',
      status: topicAppears(textParts.title, mainTopic) ? 'pass' : 'fail',
      detail: topicAppears(textParts.title, mainTopic)
        ? 'The page title names the main topic.'
        : 'The page title does not clearly name the main topic.',
      evidenceIds: ['topic-title'],
    },
    {
      id: 'topic-in-h1',
      label: 'Topic in H1',
      status: h1s.some((heading) => topicAppears(heading.text, mainTopic)) ? 'pass' : 'fail',
      detail: h1s.length === 0
        ? 'No H1 was found.'
        : h1s.some((heading) => topicAppears(heading.text, mainTopic))
          ? 'An H1 clearly names the topic.'
          : 'The H1 does not clearly name the topic.',
      evidenceIds: h1s.map((_, index) => `topic-h1-${index + 1}`),
    },
    {
      id: 'topic-in-opening',
      label: 'Topic in opening content',
      status: topicAppears(opening, mainTopic) ? 'pass' : 'review',
      detail: topicAppears(opening, mainTopic)
        ? 'The opening establishes the topic early.'
        : 'The opening does not establish the topic in the first readable section.',
      evidenceIds: ['topic-opening'],
    },
    {
      id: 'topic-in-supporting-headings',
      label: 'Topic supported by section headings',
      status: headingMatch ? 'pass' : supportingHeadings.length ? 'review' : 'unavailable',
      detail: headingMatch
        ? 'A supporting heading reinforces the topic.'
        : supportingHeadings.length
          ? 'Supporting headings use related language but do not clearly reinforce the detected topic.'
          : 'No supporting headings were available to assess.',
      evidenceIds: headingMatch
        ? ['topic-supporting-heading']
        : supportingHeadings.length
          ? ['topic-supporting-headings-reviewed']
          : [],
    },
    {
      id: 'topic-repetition',
      label: 'Natural topic repetition',
      status: excessive ? 'review' : 'pass',
      detail: excessive
        ? `The exact topic phrase appears ${occurrenceCount} times; review the copy for forced repetition.`
        : 'No excessive exact-phrase repetition was detected.',
      evidenceIds: excessive ? ['topic-repetition-count'] : [],
    },
  ];

  return makeDimension(checks, evidence, {
    strong: 'The title, heading structure, and opening consistently establish the page topic.',
    mixed: 'The topic is visible, but one or more prominent page locations need clearer alignment.',
    weak: 'The detected topic is missing from multiple prominent page locations.',
    unavailable: 'There was not enough readable content to assess topic focus.',
  });
}

function entityClarity(entities: EnrichedEntity[], mainTopic: string): ClarityDimension {
  const primary = entities.find((entity) => topicAppears(entity.name, mainTopic))
    ?? [...entities].sort((a, b) => b.confidenceScore - a.confidenceScore)[0];
  if (!primary) {
    return makeDimension([
      {
        id: 'primary-entity',
        label: 'Primary entity identified',
        status: 'unavailable',
        detail: 'No enriched entities were available.',
        evidenceIds: [],
      },
    ], [], {
      strong: '', mixed: '', weak: '',
      unavailable: 'Entity enrichment was unavailable, so identity clarity was not scored.',
    });
  }

  const verified = [primary.wikipediaUrl, primary.wikidataUrl, primary.googleKgUrl]
    .filter(Boolean);
  const evidence: ClarityEvidence[] = [{
    id: 'primary-entity',
    source: 'entity',
    text: `${primary.name} (${primary.type}, ${primary.confidenceScore}% match confidence)`,
  }];
  if (verified.length) {
    evidence.push({ id: 'primary-identifiers', source: 'entity', text: excerpt(verified.join(', ')) });
  }
  const normalizedNames = entities.map((entity) => normalize(entity.name));
  const duplicateNames = new Set(normalizedNames).size !== normalizedNames.length;
  const checks: ClarityCheck[] = [
    {
      id: 'primary-entity',
      label: 'Primary entity identified',
      status: primary.confidenceScore >= 60 ? 'pass' : 'review',
      detail: primary.confidenceScore >= 60
        ? 'The strongest entity match has useful contextual confidence.'
        : 'The strongest entity match needs human review.',
      evidenceIds: ['primary-entity'],
    },
    {
      id: 'entity-type',
      label: 'Useful entity type',
      status: primary.type === 'Thing' ? 'review' : 'pass',
      detail: primary.type === 'Thing'
        ? 'The primary entity has only a generic Thing classification.'
        : `The primary entity is classified as ${primary.type}.`,
      evidenceIds: ['primary-entity'],
    },
    {
      id: 'entity-name-consistency',
      label: 'Consistent entity names',
      status: duplicateNames ? 'review' : 'pass',
      detail: duplicateNames
        ? 'Duplicate normalized entity names suggest an extraction conflict.'
        : 'No conflicting duplicate entity names were detected.',
      evidenceIds: ['primary-entity'],
    },
    {
      id: 'verified-identifier',
      label: 'External identity confirmation',
      status: verified.length ? 'pass' : 'unavailable',
      detail: verified.length
        ? 'At least one external identifier supports the entity match.'
        : 'No external identifier was found. This is missing confirmation, not proof of unclear content.',
      evidenceIds: verified.length ? ['primary-identifiers'] : [],
    },
  ];
  return makeDimension(checks, evidence, {
    strong: 'The primary entity has a specific type, consistent name, and useful contextual match.',
    mixed: 'The primary entity is identifiable, but one or more identity details need review.',
    weak: 'The extracted identity contains conflicts or lacks enough contextual support.',
    unavailable: 'Entity enrichment was unavailable, so identity clarity was not scored.',
  });
}

function semanticCoherence(entities: EnrichedEntity[], textParts: TextParts): ClarityDimension {
  if (entities.length === 0) {
    return makeDimension([], [], {
      strong: '', mixed: '', weak: '',
      unavailable: 'No entities were available to assess semantic coherence.',
    });
  }
  const pageText = normalize([
    textParts.title,
    textParts.description,
    ...textParts.headings.map((heading) => heading.text),
    textParts.body,
  ].join(' '));
  const supported = entities.filter((entity) => pageText.includes(normalize(entity.name)));
  const absent = entities.filter((entity) => !pageText.includes(normalize(entity.name)));
  const evidence: ClarityEvidence[] = supported.slice(0, 4).map((entity, index) => ({
    id: `supporting-entity-${index + 1}`,
    source: 'entity',
    text: `${entity.name} appears in the page content.`,
  }));
  if (absent.length) {
    evidence.push({
      id: 'unsupported-entities',
      source: 'entity',
      text: excerpt(`Not found verbatim in readable page text: ${absent.map((entity) => entity.name).join(', ')}`),
    });
  }
  const ratio = supported.length / entities.length;
  const checks: ClarityCheck[] = [
    {
      id: 'entity-page-support',
      label: 'Entities supported by page text',
      status: ratio >= 0.75 ? 'pass' : ratio >= 0.5 ? 'review' : 'fail',
      detail: `${supported.length} of ${entities.length} enriched entities appear verbatim in readable page content.`,
      evidenceIds: evidence.map((item) => item.id),
    },
    {
      id: 'unsupported-entity-review',
      label: 'Potential extraction noise',
      status: absent.length === 0 ? 'pass' : 'review',
      detail: absent.length === 0
        ? 'Every enriched entity has visible page support.'
        : 'Review absent entities as possible aliases, examples, structured-data-only mentions, or extraction noise. Do not remove content based on this check alone.',
      evidenceIds: absent.length ? ['unsupported-entities'] : [],
    },
  ];
  return makeDimension(checks, evidence, {
    strong: 'Supporting entities consistently appear in the readable page content.',
    mixed: 'Most supporting entities fit the page, with a small set requiring context review.',
    weak: 'Many extracted entities lack visible support in the readable page content.',
    unavailable: 'No entities were available to assess semantic coherence.',
  });
}

function answerStructure(textParts: TextParts, mainTopic: string): ClarityDimension {
  const $ = cheerio.load(textParts.htmlContent || '');
  const wordCount = normalize(textParts.body).split(' ').filter(Boolean).length;
  const h1s = textParts.headings.filter((heading) => heading.level === 1);
  const opening = textParts.body.slice(0, 600);
  const lists = $('ul, ol, dl').length;
  const questions = $('h2, h3, dt').toArray().filter((node) => $(node).text().trim().endsWith('?')).length;
  const headingJumps = textParts.headings.filter((heading, index) => {
    if (index === 0) return false;
    return heading.level - textParts.headings[index - 1].level > 1;
  });
  const thinShell = wordCount < 80 && $('script').length >= 3;
  const evidence: ClarityEvidence[] = [
    { id: 'structure-h1', source: 'h1', text: excerpt(h1s.map((heading) => heading.text).join(' | ') || 'No H1 found') },
    { id: 'structure-opening', source: 'opening', text: excerpt(opening || 'No readable opening content found') },
    { id: 'structure-elements', source: 'html', text: `${lists} list(s), ${questions} visible question heading(s), ${headingJumps.length} heading-level jump(s)` },
  ];
  const checks: ClarityCheck[] = [
    {
      id: 'single-h1',
      label: 'One clear H1',
      status: h1s.length === 1 ? 'pass' : 'fail',
      detail: h1s.length === 1 ? 'The page has one H1.' : `The page has ${h1s.length} H1 headings.`,
      evidenceIds: ['structure-h1'],
    },
    {
      id: 'heading-order',
      label: 'Sensible heading order',
      status: headingJumps.length === 0 ? 'pass' : 'review',
      detail: headingJumps.length === 0
        ? 'No skipped heading levels were detected.'
        : `${headingJumps.length} heading-level jump(s) may make the outline harder to extract.`,
      evidenceIds: ['structure-elements'],
    },
    {
      id: 'direct-introduction',
      label: 'Direct introduction',
      status: topicAppears(opening, mainTopic) ? 'pass' : 'review',
      detail: topicAppears(opening, mainTopic)
        ? 'The opening directly introduces the main topic.'
        : 'The opening does not directly explain the main topic.',
      evidenceIds: ['structure-opening'],
    },
    {
      id: 'scannable-facts',
      label: 'Scannable facts or lists',
      status: lists > 0 ? 'pass' : 'review',
      detail: lists > 0 ? 'The page includes scannable list structure.' : 'No list or definition-list structure was found.',
      evidenceIds: ['structure-elements'],
    },
    {
      id: 'visible-qa',
      label: 'Visible question-and-answer structure',
      status: questions > 0 ? 'pass' : 'unavailable',
      detail: questions > 0
        ? `${questions} visible question heading(s) were found.`
        : 'No visible question headings were found; this check is optional for pages that do not need FAQs.',
      evidenceIds: ['structure-elements'],
    },
    {
      id: 'readable-html',
      label: 'Readable server-rendered content',
      status: thinShell ? 'fail' : 'pass',
      detail: thinShell
        ? 'The fetched HTML looks like a thin JavaScript shell, so content checks may be incomplete.'
        : 'The fetched HTML contains enough readable text for structural checks.',
      evidenceIds: ['structure-elements'],
    },
  ];
  return makeDimension(checks, evidence, {
    strong: 'The page uses a clear heading hierarchy and extractable content structure.',
    mixed: 'The page is readable, but parts of its outline or answer format could be easier to extract.',
    weak: 'Multiple structural issues make the page harder for people and machines to scan.',
    unavailable: 'The fetched HTML did not contain enough readable structure to assess.',
  });
}

export function assessClarity(params: {
  entities: EnrichedEntity[];
  textParts: TextParts;
  mainTopic: string;
  topicConfidence: number;
  degradedSteps?: string[];
}): ClarityAssessment {
  const dimensions = {
    topicFocus: topicFocus(params.textParts, params.mainTopic),
    entityClarity: entityClarity(params.entities, params.mainTopic),
    semanticCoherence: semanticCoherence(params.entities, params.textParts),
    answerStructure: answerStructure(params.textParts, params.mainTopic),
  };
  const statuses = Object.values(dimensions).map((dimension) => dimension.status);
  const applicable = statuses.filter((status) => status !== 'unavailable');
  const overallStatus: ClarityStatus = applicable.length === 0
    ? 'unavailable'
    : applicable.filter((status) => status === 'weak').length >= 2
      ? 'weak'
      : applicable.every((status) => status === 'strong')
        ? 'strong'
        : 'mixed';

  return {
    mainTopic: params.mainTopic,
    topicConfidence: params.topicConfidence,
    overallStatus,
    dimensions,
    degradedSteps: params.degradedSteps ?? [],
    analysisVersion: ANALYSIS_VERSION,
  };
}
