/**
 * EducationalOccupationalProgram schema generator.
 * Ported from PHP generate_educational_program_schema() (lines 1745-1854).
 */

import type { EnrichedEntity } from '../../types/entities';
import type { TextParts } from '../../types/analysis';
import { buildAboutEntities, extractNameFromTitle } from './helpers';
import { extractAdditionalSchemas, extractContactInfo } from './additional';

/**
 * Extract program details (duration, credits, mode) from text content.
 */
function extractProgramDetails(
  bodyText: string,
): Record<string, unknown> {
  const details: Record<string, unknown> = {};

  // Duration
  const durationPatterns = [
    { re: /(\d+)\s*months?/i, fmt: (n: string) => `P${n}M` },
    { re: /(\d+)\s*years?/i, fmt: (n: string) => `P${n}Y` },
    { re: /(\d+)\s*weeks?/i, fmt: (n: string) => `P${n}W` },
  ];

  for (const { re, fmt } of durationPatterns) {
    const m = bodyText.match(re);
    if (m) {
      details.timeToComplete = fmt(m[1]);
      break;
    }
  }

  // Credits
  const creditsMatch = bodyText.match(/(\d+)\s*credits?/i);
  if (creditsMatch) {
    details.numberOfCredits = parseInt(creditsMatch[1], 10);
  }

  // Credential type
  const credentialMatch = bodyText.match(
    /\b(diploma|degree|certificate|certification)\b/i,
  );
  if (credentialMatch) {
    details.educationalCredentialAwarded = {
      '@type': 'EducationalOccupationalCredential',
      credentialCategory:
        credentialMatch[1].charAt(0).toUpperCase() +
        credentialMatch[1].slice(1).toLowerCase(),
    };
  }

  // Delivery mode
  const modeMatch = bodyText.match(
    /\b(online|on-campus|hybrid|blended)\b/i,
  );
  if (modeMatch) {
    details.educationalProgramMode = modeMatch[1].toLowerCase();
  }

  return details;
}

/**
 * Extract educational institution provider from entities.
 */
function extractProvider(
  textParts: TextParts,
  entities: EnrichedEntity[],
): Record<string, unknown> {
  const provider: Record<string, unknown> = {
    '@type': 'CollegeOrUniversity',
  };

  // Look for educational institution in entities
  for (const entity of entities) {
    if (/\b(university|college|academy|institute|school)\b/i.test(entity.name)) {
      provider.name = entity.name;
      break;
    }
  }

  if (!provider.name) {
    provider.name =
      extractNameFromTitle(textParts.title) ||
      (entities.length > 0 ? entities[0].name : 'Educational Institution');
  }

  if (textParts.description) {
    provider.description = textParts.description;
  }

  // Add contact info
  const contactInfo = extractContactInfo(textParts.htmlContent);
  if (contactInfo.telephone) provider.telephone = contactInfo.telephone;
  if (contactInfo.address) provider.address = contactInfo.address;

  return provider;
}

export function generateEducationalSchema(
  entities: EnrichedEntity[],
  textParts: TextParts,
  url: string,
): Record<string, unknown> {
  const additional = extractAdditionalSchemas(textParts.htmlContent);
  const programName =
    textParts.title || (entities.length > 0 ? entities[0].name : 'Educational Program');

  // Create WebPage as root schema
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: textParts.title || programName,
    url,
  };

  if (textParts.description) {
    schema.description = textParts.description;
  }

  // Build the educational program as mainEntity
  const program: Record<string, unknown> = {
    '@type': 'EducationalOccupationalProgram',
    name: programName,
    url,
  };

  if (textParts.description) {
    program.description = textParts.description;
  }

  // Extract program details from body text
  const details = extractProgramDetails(textParts.body);
  Object.assign(program, details);

  // Add provider
  const provider = extractProvider(textParts, entities);
  program.provider = provider;
  schema.provider = provider;

  schema.mainEntity = program;

  // Add FAQ as hasPart
  if (additional.faq) {
    schema.hasPart = additional.faq;
  }

  // Add entity references
  const aboutEntities = buildAboutEntities(entities);
  if (aboutEntities.length > 0) {
    schema.about = aboutEntities.slice(0, 4);
    if (aboutEntities.length > 4) {
      schema.mentions = aboutEntities.slice(4, 8);
    }
  }

  // Add publisher
  if (additional.organization) {
    schema.publisher = additional.organization;
  }

  // Add speakable for voice search
  schema.speakable = {
    '@type': 'SpeakableSpecification',
    xpath: [
      '/html/head/title',
      '/html/head/meta[@name="description"]',
      '/html/body//h1',
      '/html/body//h2',
      '/html/body//h3',
    ],
  };

  return schema;
}
