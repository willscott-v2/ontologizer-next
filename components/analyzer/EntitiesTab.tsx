'use client'

import { ExternalLink } from 'lucide-react'
import type { EnrichedEntity } from '@/lib/types/entities'

interface EntitiesTabProps {
  entities: EnrichedEntity[]
}

function confidenceClass(score: number): string {
  if (score >= 70) return 'entity-confidence-high'
  if (score >= 40) return 'entity-confidence-medium'
  return 'entity-confidence-low'
}

interface EntityLinkProps {
  href: string
  label: string
}

function EntityLink({ href, label }: EntityLinkProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
    >
      {label}
      <ExternalLink className="size-3" />
    </a>
  )
}

export function EntitiesTab({ entities }: EntitiesTabProps) {
  if (entities.length === 0) {
    return (
      <p className="py-8 text-center text-muted-foreground">
        No entities extracted.
      </p>
    )
  }

  return (
    <ul className="entity-list">
      {entities.map((entity) => (
        <li key={entity.name} className="entity-row">
          <div className="entity-row-heading">
            <div>
              <strong>{entity.name}</strong>
              <span>{entity.type}</span>
            </div>
            <span className={`entity-confidence ${confidenceClass(entity.confidenceScore)}`}>
              {entity.confidenceScore}% confidence
            </span>
          </div>

          <div className="entity-links">
            {entity.wikipediaUrl && <EntityLink href={entity.wikipediaUrl} label="Wikipedia" />}
            {entity.wikidataUrl && <EntityLink href={entity.wikidataUrl} label="Wikidata" />}
            {entity.googleKgUrl && <EntityLink href={entity.googleKgUrl} label="Google KG" />}
            {entity.productOntologyUrl && <EntityLink href={entity.productOntologyUrl} label="ProductOntology" />}
            {entity.linkedinUrl && <EntityLink href={entity.linkedinUrl} label="LinkedIn" />}
          </div>
        </li>
      ))}
    </ul>
  )
}
