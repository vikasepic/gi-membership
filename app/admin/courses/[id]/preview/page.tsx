import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin-guard";
import { getCourse } from "@/lib/courses";

export const dynamic = "force-dynamic";

// The whole course, as a buyer sees it.
//
// An iframe rather than an inline render for the same reason the upsell preview
// uses one: a phone view is only truthful when the frame has its own viewport,
// because media queries resolve against that and not against a CSS-scaled box.
// A scaled desktop render would show md: styles at phone width and quietly lie.

const DEVICES = {
  desktop: { label: "Desktop", width: "100%", height: "100%" },
  tablet: { label: "Tablet", width: "834px", height: "1112px" },
  mobile: { label: "Mobile", width: "390px", height: "844px" },
} as const;

const PROGRESS = {
  fresh: "Not started",
  part: "Part-way",
  done: "Finished",
} as const;

type DeviceKey = keyof typeof DEVICES;
type ProgressKey = keyof typeof PROGRESS;

export default async function CoursePreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ device?: string; progress?: string; drafts?: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  if (!(await getCourse(id))) notFound();

  const device = (sp.device && sp.device in DEVICES ? sp.device : "desktop") as DeviceKey;
  const progress = (sp.progress && sp.progress in PROGRESS ? sp.progress : "fresh") as ProgressKey;
  const drafts = sp.drafts === "1";
  const d = DEVICES[device];

  const here = (next: Record<string, string | undefined>) => {
    const q = new URLSearchParams({ device, progress, ...(drafts ? { drafts: "1" } : {}) });
    for (const [k, v] of Object.entries(next)) {
      if (v === undefined) q.delete(k);
      else q.set(k, v);
    }
    return `/admin/courses/${id}/preview?${q}`;
  };

  const frameSrc = `/course-preview/${id}?progress=${progress}${drafts ? "&drafts=1" : ""}`;

  return (
    <div className="mx-[calc(50%-50vw)] flex h-[calc(100vh-4rem)] w-screen flex-col px-5 md:px-6">
      <div className="flex flex-wrap items-center gap-3 py-3">
        <Link href={`/admin/courses/${id}`} className="kicker text-muted hover:text-fg">
          &larr; Back to the course
        </Link>

        <Pills label="Progress" current={progress} options={PROGRESS} href={(k) => here({ progress: k })} />
        <Pills label="Screen" current={device} options={DEVICES} href={(k) => here({ device: k })} />

        <Link
          href={here({ drafts: drafts ? undefined : "1" })}
          className={`rounded-full border px-3 py-1 text-xs transition-colors ${
            drafts ? "border-primary bg-primary/10 text-primary" : "border-border text-muted hover:border-fg"
          }`}
        >
          {drafts ? "Drafts shown" : "Show drafts"}
        </Link>

        <span className="text-xs text-muted">
          Progress is simulated — nothing is recorded against your account.
        </span>
      </div>

      <div className="flex flex-1 items-start justify-center overflow-auto rounded-2xl border border-border bg-surface-2 p-4">
        <iframe
          key={`${device}-${progress}-${drafts}`}
          src={frameSrc}
          title="Course preview"
          className="rounded-xl border border-border bg-bg"
          style={{ width: d.width, height: device === "desktop" ? "100%" : d.height, minHeight: "600px" }}
        />
      </div>
    </div>
  );
}

function Pills<T extends string>({
  label,
  current,
  options,
  href,
}: {
  label: string;
  current: T;
  options: Record<string, { label: string } | string>;
  href: (key: T) => string;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-xs text-muted">{label}</span>
      <span className="flex items-center gap-1 rounded-full border border-border p-1">
        {Object.entries(options).map(([k, v]) => (
          <Link
            key={k}
            href={href(k as T)}
            className={`rounded-full px-2.5 py-0.5 text-xs transition-colors ${
              current === k ? "bg-navy text-white" : "text-muted hover:text-fg"
            }`}
          >
            {typeof v === "string" ? v : v.label}
          </Link>
        ))}
      </span>
    </span>
  );
}
