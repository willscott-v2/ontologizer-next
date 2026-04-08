export type EntityType =
  | 'Person'
  | 'Organization'
  | 'Place'
  | 'Product'
  | 'Event'
  | 'CreativeWork'
  | 'Service'
  | 'Brand'
  | 'Concept'
  | 'Technology'
  | 'LocalBusiness'
  | 'Thing';

export interface RawEntity {
  name: string;
  type?: EntityType;
}

export interface EnrichedEntity {
  name: string;
  type: EntityType;
  confidenceScore: number;
  wikipediaUrl: string | null;
  wikidataUrl: string | null;
  googleKgUrl: string | null;
  productOntologyUrl: string | null;
}
