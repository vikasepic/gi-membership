"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { downloadDocx, firstHeading } from "@/lib/builtin-apps/product-builder/export";
import type { DocumentRecord } from "@/lib/builtin-apps/product-builder/types";

export function GuideMarkdown({ markdown }: { markdown: string }) {
  return (
    <div className="prose-guide">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
    </div>
  );
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export default function DocumentReader({
  document: doc,
  fallbackName,
}: {
  document: DocumentRecord;
  fallbackName: string;
}) {
  const [exporting, setExporting] = useState(false);
  const name = firstHeading(doc.content) ?? fallbackName;

  const word = async () => {
    setExporting(true);
    try {
      await downloadDocx(doc.content, name);
    } finally {
      setExporting(false);
    }
  };

  const words = wordCount(doc.content);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="print-hide flex shrink-0 flex-wrap items-center justify-between gap-2 pb-3">
        <p className="text-xs text-muted">
          About {words.toLocaleString()} words
          {doc.truncated ? ". The build was cut short; rebuild to complete it." : ""}
        </p>
        <div className="flex flex-wrap gap-2">
          <ExportButton onClick={() => window.print()}>Print or save as PDF</ExportButton>
          <ExportButton onClick={word} disabled={exporting}>
            {exporting ? "Preparing Word file" : "Download Word"}
          </ExportButton>
        </div>
      </div>
      <article className="scroll-thin min-h-0 flex-1 overflow-y-auto rounded-2xl border border-border bg-surface px-6 py-8 shadow-sm sm:px-10 sm:py-12">
        <GuideMarkdown markdown={doc.content} />
      </article>
    </div>
  );
}

function ExportButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-full border border-border bg-surface px-3.5 py-1.5 text-xs font-semibold text-navy transition-colors hover:bg-navy hover:text-white disabled:opacity-50"
    >
      {children}
    </button>
  );
}
