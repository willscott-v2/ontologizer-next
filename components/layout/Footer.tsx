import { Code } from 'lucide-react';

export function Footer() {
  return (
    <footer className="si-footer">
      <div className="si-container">
        <p>
          Ontologizer: AI content clarity and connected schema by{' '}
          <a
            href="https://www.searchinfluence.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            Search Influence
          </a>
          .
        </p>
        <p className="mt-3">
          Need a broader technical and on-page audit?{' '}
          <a
            href="https://ai-grader.searchinfluence.com/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Try the AI Website Grader
          </a>
          .
        </p>
        <p className="mt-3">
          Preparing page content for RAG or LLM context?{' '}
          <a
            href="https://getchunks.searchinfluence.com/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Try the Web Content Chunker
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
            Open source. Clone and self-host with your own API keys
          </a>
        </p>
      </div>
    </footer>
  );
}
