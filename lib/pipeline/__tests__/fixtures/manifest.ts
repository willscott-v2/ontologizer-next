export interface AnalysisFixture {
  id: string;
  file: string;
  declaredPageType:
    | 'WebPage'
    | 'Article'
    | 'Service'
    | 'LocalBusiness'
    | 'EducationalOccupationalProgram';
  expectedMainTopic: string;
  protects: string;
  baselineDecision: 'keep' | 'change' | 'unavailable';
}

export const analysisFixtures: AnalysisFixture[] = [
  {
    id: 'generic-webpage',
    file: 'generic-webpage.html',
    declaredPageType: 'WebPage',
    expectedMainTopic: 'Coastal Gardening Guide',
    protects: 'A general informational page should not be forced into a specialized schema type.',
    baselineDecision: 'keep',
  },
  {
    id: 'article',
    file: 'article.html',
    declaredPageType: 'Article',
    expectedMainTopic: 'Native Plant Gardening',
    protects: 'Article classification should use visible author and date evidence.',
    baselineDecision: 'change',
  },
  {
    id: 'service',
    file: 'service.html',
    declaredPageType: 'Service',
    expectedMainTopic: 'Technical SEO Audits',
    protects: 'A named service with provider evidence should produce Service schema.',
    baselineDecision: 'change',
  },
  {
    id: 'local-business',
    file: 'local-business.html',
    declaredPageType: 'LocalBusiness',
    expectedMainTopic: 'Garden Center',
    protects: 'LocalBusiness requires real address, phone, and operating-hour evidence.',
    baselineDecision: 'change',
  },
  {
    id: 'educational-program',
    file: 'educational-program.html',
    declaredPageType: 'EducationalOccupationalProgram',
    expectedMainTopic: 'Certificate in Medical Coding',
    protects: 'A real program should be distinguished from education-industry marketing copy.',
    baselineDecision: 'change',
  },
  {
    id: 'ambiguous-entities',
    file: 'ambiguous-entities.html',
    declaredPageType: 'WebPage',
    expectedMainTopic: 'Jordan Consulting',
    protects: 'People, brands, and places with ambiguous names must use page context.',
    baselineDecision: 'change',
  },
  {
    id: 'faq-contamination',
    file: 'faq-contamination.html',
    declaredPageType: 'Service',
    expectedMainTopic: 'Home Energy Audits',
    protects: 'FAQ answers must exclude buttons, images, navigation, forms, and nested accordion labels.',
    baselineDecision: 'change',
  },
];
