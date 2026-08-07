"use client";

import { createContext, useContext, useEffect, useState } from "react";

/**
 * Tabs inside a form.
 *
 * The panels are HIDDEN, never unmounted. A form posts the inputs that are
 * mounted, so a tab that unmounted its fields would silently drop them on save
 * — change the price, save from the Basics tab, and the price goes back to what
 * it was with no error anywhere. Hidden inputs still post, so this is the one
 * detail that has to be right before anything else about tabs matters.
 */

type Ctx = { active: string; setActive: (k: string) => void };
const TabCtx = createContext<Ctx>({ active: "", setActive: () => {} });

export type EditorTab = {
  key: string;
  label: string;
  /** Something in here needs attention — shown as a dot. */
  attention?: boolean;
};

export function EditorTabs({
  tabs,
  children,
  /**
   * Move to this tab when it changes.
   *
   * A validation message rendered inside a hidden panel is a message nobody
   * reads: press Save on Basics with no price and the explanation appears on
   * Pricing. The form says where to go and the tabs go there.
   */
  showTab,
}: {
  tabs: EditorTab[];
  children: React.ReactNode;
  showTab?: string | null;
}) {
  const [active, setActive] = useState(tabs[0]?.key ?? "");
  useEffect(() => {
    if (showTab) setActive(showTab);
  }, [showTab]);
  return (
    <TabCtx.Provider value={{ active, setActive }}>
      <div className="flex gap-1 overflow-x-auto border-b border-border" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={active === t.key}
            onClick={() => setActive(t.key)}
            className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors ${
              active === t.key
                ? "border-primary font-medium text-fg"
                : "border-transparent text-muted hover:text-fg"
            }`}
          >
            {t.label}
            {t.attention && (
              <span
                aria-label="needs attention"
                className="size-1.5 rounded-full bg-primary"
              />
            )}
          </button>
        ))}
      </div>
      {children}
    </TabCtx.Provider>
  );
}

export function TabPanel({ tab, children }: { tab: string; children: React.ReactNode }) {
  const { active } = useContext(TabCtx);
  return (
    <div hidden={active !== tab} role="tabpanel" className="flex flex-col gap-6">
      {children}
    </div>
  );
}
