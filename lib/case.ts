// snake_case DB rows -> camelCase at the API boundary. Shallow-maps object
// keys and recurses into nested objects/arrays (covers joined Supabase rows).
// jsonb columns arrive as already-parsed objects; we leave their inner keys
// alone by only converting keys, and values recurse — which is fine because
// our jsonb payloads (bullets, utm) are arrays/flat maps we also want camel.

type Json = unknown;

function toCamel(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

export function camelize<T = Json>(input: Json): T {
  if (Array.isArray(input)) return input.map((v) => camelize(v)) as T;
  if (input && typeof input === "object") {
    const out: Record<string, Json> = {};
    for (const [k, v] of Object.entries(input as Record<string, Json>)) {
      out[toCamel(k)] = camelize(v);
    }
    return out as T;
  }
  return input as T;
}

// ponytail: self-check runs only under `node --test` / direct exec, not in the app.
if (process.env.NODE_ENV === "test" || process.argv[1]?.endsWith("case.ts")) {
  const got = camelize({ store_id: "s1", bump_offer_id: null, media_embed_url: "u" });
  const ok =
    JSON.stringify(got) ===
    JSON.stringify({ storeId: "s1", bumpOfferId: null, mediaEmbedUrl: "u" });
  if (!ok) throw new Error("camelize failed: " + JSON.stringify(got));
  const arr = camelize([{ price_cents: 2700 }]);
  if (JSON.stringify(arr) !== JSON.stringify([{ priceCents: 2700 }]))
    throw new Error("camelize array failed");
  console.log("case.ts self-check OK");
}
