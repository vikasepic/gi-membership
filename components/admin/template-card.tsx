"use client";

import { TemplatePreview } from "@/components/admin/template-preview";
import { bandTheme } from "@/lib/page-sections";
import type { Template } from "@/lib/templates/template";

/**
 * One design on the templates screen.
 *
 * The picture is the design itself, rendered — the same component the library
 * popup uses, for the same reason: a screenshot goes stale the day a block's
 * default changes, and a rendered preview is a test of the design as well as a
 * picture of it.
 */
export function TemplateCard({
  template,
  subtitle,
  onEdit,
  onDelete,
}: {
  template: Template;
  subtitle?: string;
  onEdit: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface">
      <button type="button" onClick={onEdit} className="block w-full cursor-pointer text-left">
        <TemplatePreview
          template={template}
          theme={bandTheme(template.band?.style ?? "paper")}
          height={200}
        />
      </button>
      <div className="flex items-center gap-2 border-t border-border px-3 py-2">
        <div className="min-w-0">
          <div className="truncate text-sm text-fg">{template.name}</div>
          {subtitle && <div className="truncate text-[0.68rem] text-muted">{subtitle}</div>}
        </div>
        <div className="ml-auto flex shrink-0 gap-1">
          <button
            type="button"
            onClick={onEdit}
            className="rounded-full border border-border px-2.5 py-1 text-[0.68rem] text-muted hover:border-fg hover:text-fg"
          >
            Edit
          </button>
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="rounded-full border border-border px-2.5 py-1 text-[0.68rem] text-muted hover:border-[#b3261e] hover:text-[#b3261e]"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
