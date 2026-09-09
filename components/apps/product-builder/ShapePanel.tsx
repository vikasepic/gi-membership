import type { ReactNode } from "react";
import type { Stage } from "@/lib/builtin-apps/product-builder/stages";
import type { Shape } from "@/lib/builtin-apps/product-builder/types";

type SectionKey = keyof Shape;

const SECTIONS: {
  key: SectionKey;
  title: string;
  collecting: string; // what the coach is after while this step is current
  stages: Stage[];
}[] = [
  {
    key: "narrow",
    title: "The problem",
    collecting: "Who you help, the moment they feel it, what they already tried, and the result they would pay for.",
    stages: ["NARROW"],
  },
  {
    key: "replay",
    title: "A real case, replayed",
    collecting: "One real client, from the first conversation to the result. What you did first, then what, then what.",
    stages: ["REPLAY"],
  },
  {
    key: "framework",
    title: "The framework",
    collecting: "Three to six steps in your words, in order, with a name for the whole thing.",
    stages: ["NAME"],
  },
  {
    key: "story",
    title: "The proof story",
    collecting: "Four beats: where they were stuck, the turn, what happened, and one detail only you would know.",
    stages: ["PROVE"],
  },
  {
    key: "equip",
    title: "The tools",
    collecting: "The biggest mistake, the question clients always ask, what you would hand someone to fill in, and what they finish with.",
    stages: ["EQUIP"],
  },
  {
    key: "gate",
    title: "The whole shape",
    collecting: "Everything on one screen, with three title options. You pick one or write your own.",
    stages: ["GATE", "READY"],
  },
];

const STAGE_INDEX: Record<Stage, number> = {
  NARROW: 0,
  REPLAY: 1,
  NAME: 2,
  PROVE: 3,
  EQUIP: 4,
  GATE: 5,
  READY: 5,
  STOP: -1,
};

function hasGuess(value: unknown): boolean {
  return JSON.stringify(value ?? "").includes("(guess)");
}

export default function ShapePanel({
  shape,
  stage,
  canSkip,
  onSkip,
}: {
  shape: Shape | null;
  stage: Stage;
  canSkip: boolean;
  onSkip: () => void;
}) {
  const currentIdx = STAGE_INDEX[stage];
  const filledCount = SECTIONS.filter((s) => shape?.[s.key]).length;

  return (
    <div className="rounded-3xl border border-border bg-surface p-5 shadow-sm sm:p-7">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-xl font-semibold text-navy">
          Your product, taking shape
        </h2>
        <span className="text-xs text-muted">
          {filledCount} of {SECTIONS.length} locked
        </span>
      </div>

      <ol className="mt-5 space-y-3">
        {SECTIONS.map((section, i) => {
          const data = shape?.[section.key] ?? null;
          const isCurrent = i === currentIdx;
          const state = data ? "filled" : isCurrent ? "current" : i < currentIdx ? "skipped" : "upcoming";
          return (
            <li
              key={section.key}
              className={`rounded-2xl border p-4 transition-colors ${
                isCurrent
                  ? "border-primary/50 bg-primary/5"
                  : state === "filled"
                    ? "border-border bg-surface"
                    : "border-dashed border-border bg-surface-2/60"
              }`}
            >
              <div className="flex items-start gap-3">
                <span
                  className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    state === "filled"
                      ? "bg-navy text-white"
                      : isCurrent
                        ? "bg-primary text-white"
                        : "bg-navy/10 text-navy/50"
                  }`}
                >
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3
                      className={`font-semibold ${
                        state === "upcoming" ? "text-muted" : "text-navy"
                      }`}
                    >
                      {section.title}
                    </h3>
                    {isCurrent && (
                      <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-medium text-white">
                        You are here
                      </span>
                    )}
                    {data && hasGuess(data) && (
                      <span className="rounded-full bg-plum/10 px-2 py-0.5 text-[11px] font-medium text-plum">
                        Contains guesses to replace
                      </span>
                    )}
                  </div>

                  {data ? (
                    <div className="mt-2 text-sm leading-relaxed text-fg">
                      <SectionBody sectionKey={section.key} shape={shape!} />
                    </div>
                  ) : isCurrent ? (
                    <div className="mt-2">
                      <p className="text-sm leading-relaxed text-fg/75">
                        {section.collecting}
                      </p>
                      {canSkip && (
                        <button
                          type="button"
                          onClick={onSkip}
                          className="mt-2 text-xs font-medium text-primary underline underline-offset-4 hover:text-primary-hover"
                        >
                          Skip this step and let the coach fill it in
                        </button>
                      )}
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-muted">{section.collecting}</p>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5 py-1 sm:grid-cols-[92px_1fr] sm:gap-3">
      <dt className="text-xs font-semibold text-plum">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Numbered({ items }: { items: string[] }) {
  return (
    <ol className="list-decimal space-y-0.5 pl-5">
      {items.map((s, i) => (
        <li key={i}>{s}</li>
      ))}
    </ol>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-0.5 pl-5">
      {items.map((s, i) => (
        <li key={i}>{s}</li>
      ))}
    </ul>
  );
}

function SectionBody({ sectionKey, shape }: { sectionKey: SectionKey; shape: Shape }) {
  switch (sectionKey) {
    case "narrow": {
      const n = shape.narrow!;
      return (
        <dl>
          <Row label="Who">{n.who}</Row>
          <Row label="When">{n.when}</Row>
          <Row label="Stuck">{n.stuck}</Row>
          <Row label="Want">{n.want}</Row>
          {n.sentence && (
            <p className="mt-2 font-display italic text-navy">{n.sentence}</p>
          )}
        </dl>
      );
    }
    case "replay": {
      const r = shape.replay!;
      return (
        <dl>
          <Row label="Client">{r.client}</Row>
          {r.sequence.length > 0 && (
            <Row label="In order">
              <Numbered items={r.sequence} />
            </Row>
          )}
          {r.earned.length > 0 && (
            <Row label="Earned">
              <Bullets items={r.earned} />
            </Row>
          )}
        </dl>
      );
    }
    case "framework": {
      const f = shape.framework!;
      return (
        <div>
          <p className="font-display text-lg text-navy">{f.name}</p>
          <div className="mt-1">
            <Numbered items={f.steps} />
          </div>
        </div>
      );
    }
    case "story": {
      const s = shape.story!;
      return (
        <dl>
          <Row label="Stuck">{s.stuck}</Row>
          <Row label="Turn">{s.turn}</Row>
          <Row label="Result">{s.result}</Row>
          <Row label="Tell">{s.tell}</Row>
        </dl>
      );
    }
    case "equip": {
      const e = shape.equip!;
      return (
        <dl>
          {e.mistakes.length > 0 && (
            <Row label="Mistakes">
              <Bullets items={e.mistakes} />
            </Row>
          )}
          {e.questions.length > 0 && (
            <Row label="They ask">
              <Bullets items={e.questions} />
            </Row>
          )}
          {e.fill_ins.length > 0 && (
            <Row label="Fill-ins">
              <Bullets items={e.fill_ins} />
            </Row>
          )}
          {e.finished && <Row label="Finished">{e.finished}</Row>}
        </dl>
      );
    }
    case "gate": {
      const g = shape.gate!;
      const title = g.chosen_title ?? g.titles[0] ?? null;
      return (
        <dl>
          {title && (
            <p className="mb-2 font-display text-xl font-semibold leading-tight text-navy">
              {title}
            </p>
          )}
          <Row label="Buyer">{g.buyer}</Row>
          <Row label="Problem">{g.problem}</Row>
          <Row label="Promise">
            <span className="font-display italic text-navy">{g.promise}</span>
          </Row>
          {g.tools.length > 0 && (
            <Row label="Tools">
              <Bullets items={g.tools} />
            </Row>
          )}
          {g.titles.length > 0 && (
            <Row label="Titles">
              <ul className="space-y-0.5">
                {g.titles.map((t, i) => (
                  <li key={i} className={t === g.chosen_title ? "font-semibold text-navy" : ""}>
                    {t}
                  </li>
                ))}
              </ul>
            </Row>
          )}
        </dl>
      );
    }
  }
}
