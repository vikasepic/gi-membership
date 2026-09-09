/**
 * The internal apps this codebase implements.
 *
 * The `apps` table says an internal app exists and can be sold (a row with
 * kind = 'internal'); this says the store has the code for it. The two are
 * joined on `key`, and the admin page warns when a row has no entry here —
 * which is the one way they can drift.
 *
 * Deliberately free of server-only imports: the library card, the admin page
 * and the app shells all read it, and none of them should have to care which
 * side of the wire they are on.
 */
export type BuiltinAppKey = "micro-product-builder" | "hook-generator";

export type BuiltinApp = {
  key: BuiltinAppKey;
  /** What the app shell calls itself when the row is missing a name. */
  name: string;
  /** One line under the name on the library card. */
  blurb: string;
  /** Where "Open" goes. Always /apps/<key>; kept explicit so a link never has to build it. */
  route: string;
};

export const BUILTIN_APPS: Record<BuiltinAppKey, BuiltinApp> = {
  "micro-product-builder": {
    key: "micro-product-builder",
    name: "Micro-Product Builder",
    blurb: "A coach that interviews you and turns what you already do into a sellable guide.",
    route: "/apps/micro-product-builder",
  },
  "hook-generator": {
    key: "hook-generator",
    name: "Viral Hook Generator",
    blurb: "Paste a post idea, get six scroll-stopping Instagram hooks built on proven patterns.",
    route: "/apps/hook-generator",
  },
};

export function isBuiltinAppKey(key: string): key is BuiltinAppKey {
  return Object.prototype.hasOwnProperty.call(BUILTIN_APPS, key);
}

/** The implementation behind an apps.key, or null when this codebase has none. */
export function builtinApp(key: string): BuiltinApp | null {
  return isBuiltinAppKey(key) ? BUILTIN_APPS[key] : null;
}

/** Where an internal app opens. Null for a key the store has no code for. */
export function builtinAppRoute(key: string): string | null {
  return builtinApp(key)?.route ?? null;
}

/** The offer page an app is sold on — where someone without access is sent. */
export function builtinAppOfferPath(key: string): string {
  return `/o/${key}`;
}
