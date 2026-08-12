import {
  parseHeadTags,
  reactAttrs,
  snippetsFor,
  type CodeSnippet,
  type SnippetPlace,
} from "@/lib/code-snippets";

/**
 * The owner's pasted code, in the position they chose.
 *
 * Two mechanisms, because a head and a body are not the same problem.
 *
 * **Head** cannot take `dangerouslySetInnerHTML` — that needs an element to sit
 * on and nothing may wrap the contents of a head. So a head snippet is parsed
 * into real `<script>`, `<meta>` and `<link>` elements, which React 19 lifts
 * into the head from wherever they are rendered. That is a narrow set on
 * purpose, and it is also exactly what people paste into a head.
 *
 * **Body** is served as markup. These pages are server-rendered, so the tags
 * land in the document the browser parses and its scripts run the way a script
 * in a page always has. (React would not execute them if the same string were
 * injected on the client — a good reason for this to stay a server component.)
 *
 * Nothing here is sanitised, and that is the decision rather than an oversight:
 * it is edited only in Site settings behind `requireAdmin`, by somebody who can
 * already run site-wide JavaScript on every page. The HTML block stays
 * sanitised because it is page content and reaches the renderer from imports
 * and direct writes too.
 */
export function CodeSnippets({
  snippets,
  place,
  onCheckout,
}: {
  snippets: CodeSnippet[];
  place: SnippetPlace;
  /** True on the checkout, where a snippet runs only if it opted in. */
  onCheckout: boolean;
}) {
  const list = snippetsFor(snippets, place, onCheckout);
  if (list.length === 0) return null;

  if (place === "head") {
    return (
      <>
        {list.flatMap((s, i) =>
          parseHeadTags(s.code).tags.map((t, j) => {
            const key = `${i}-${j}`;
            const attrs = reactAttrs(t.attrs);
            if (t.tag === "script") {
              return t.body.trim()
                ? <script key={key} {...attrs} dangerouslySetInnerHTML={{ __html: t.body }} />
                : <script key={key} {...attrs} />;
            }
            if (t.tag === "meta") return <meta key={key} {...attrs} />;
            return <link key={key} {...attrs} />;
          }),
        )}
      </>
    );
  }

  return (
    <>
      {list.map((s, i) => (
        // `display: contents` so a wrapper cannot disturb the layout around it.
        <div key={i} style={{ display: "contents" }} dangerouslySetInnerHTML={{ __html: s.code }} />
      ))}
    </>
  );
}
