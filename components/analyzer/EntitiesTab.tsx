'use client'

import { ExternalLink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import type { EnrichedEntity } from '@/lib/types/entities'

interface EntitiesTabProps {
  entities: EnrichedEntity[]
}

function confidenceBadgeClass(score: number): string {
  if (score >= 70) return 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
  if (score >= 40) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300'
  return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
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
    <div className="grid gap-3 sm:grid-cols-2">
      {entities.map((entity) => (
        <Card key={entity.name} size="sm">
          <CardContent>
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="font-semibold">{entity.name}</span>
                <Badge variant="secondary" className="ml-2 text-xs">
                  {entity.type}
                </Badge>
              </div>
              <span
                className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${confidenceBadgeClass(entity.confidenceScore)}`}
              >
                {entity.confidenceScore}%
              </span>
            </div>

            <div className="mt-2 flex flex-wrap gap-3">
              {entity.wikipediaUrl && (
                <EntityLink href={entity.wikipediaUrl} label="Wikipedia" />
              )}
              {entity.wikidataUrl && (
                <EntityLink href={entity.wikidataUrl} label="Wikidata" />
              )}
              {entity.googleKgUrl && (
                <EntityLink href={entity.googleKgUrl} label="Google KG" />
              )}
              {entity.productOntologyUrl && (
                <EntityLink
                  href={entity.productOntologyUrl}
                  label="ProductOntology"
                />
              )}
              {entity.linkedinUrl && (
                <EntityLink href={entity.linkedinUrl} label="LinkedIn" />
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
