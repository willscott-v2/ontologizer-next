'use client'

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

interface JsonLdTabProps {
  jsonLd: Record<string, unknown>
}

export function JsonLdTab({ jsonLd }: JsonLdTabProps) {
  const [copied, setCopied] = useState(false)
  const formatted = JSON.stringify(jsonLd, null, 2)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(formatted)
      setCopied(true)
      toast.success('Copied!')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Failed to copy to clipboard')
    }
  }

  if (Object.keys(jsonLd).length === 0) {
    return (
      <p className="py-8 text-center text-muted-foreground">
        No JSON-LD generated.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={handleCopy}>
          {copied ? (
            <>
              <Check className="size-3.5" />
              Copied!
            </>
          ) : (
            <>
              <Copy className="size-3.5" />
              Copy JSON-LD
            </>
          )}
        </Button>
      </div>
      <pre className="overflow-auto rounded-lg bg-muted p-4 text-xs leading-relaxed font-mono">
        {formatted}
      </pre>
    </div>
  )
}
