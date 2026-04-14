import { Code } from 'lucide-react';

export function Footer() {
  return (
    <footer className="si-footer">
      <div className="si-container">
        <p>
          Ontologizer &mdash; Entity extraction and structured data generation by{' '}
          <a
            href="https://www.searchinfluence.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            Search Influence
          </a>
          .
        </p>
        <p className="mt-4">
          <a
            href="https://github.com/willscott-v2/ontologizer"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5"
          >
            <Code className="h-3.5 w-3.5" />
            Open source — clone and self-host with your own API keys
          </a>
        </p>
      </div>
    </footer>
  );
}
