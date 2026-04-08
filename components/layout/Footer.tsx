import { Code } from 'lucide-react';

export function Footer() {
  return (
    <footer className="border-t bg-gray-50 py-6 text-center text-sm text-gray-500">
      <div className="mx-auto max-w-4xl px-4">
        <p>
          Ontologizer &mdash; Entity extraction and structured data generation.
        </p>
        <p className="mt-1">
          <a
            href="https://github.com/willscott-v2/ontologizer"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-gray-600 hover:text-gray-900"
          >
            <Code className="h-3.5 w-3.5" />
            Open source &mdash; clone and self-host with your own API keys
          </a>
        </p>
      </div>
    </footer>
  );
}
