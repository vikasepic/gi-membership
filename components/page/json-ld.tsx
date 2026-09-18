import { jsonLdText } from "@/lib/structured-data";

/** A JSON-LD graph in the page. The text is escaped so it cannot close the tag. */
export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdText(data) }} />;
}
