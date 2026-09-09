// Client-side exports for a built document: Markdown, Word, and the print
// dialog (for PDF). All work from the Markdown the model produced.
import { marked, type Token, type Tokens } from "marked";
import {
  AlignmentType,
  Document,
  HeadingLevel,
  LevelFormat,
  Packer,
  PageBreak,
  Paragraph,
  TextRun,
} from "docx";

export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "product"
  );
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Pull the first level-one heading out of a Markdown document. */
export function firstHeading(markdown: string): string | null {
  const m = markdown.match(/^#\s+(.+?)\s*$/m);
  return m ? m[1].trim() : null;
}

// ── Markdown → Word ──────────────────────────────────────────────────────

interface InlineStyle {
  bold?: boolean;
  italics?: boolean;
  strike?: boolean;
}

function inlineRuns(tokens: Token[] | undefined, style: InlineStyle = {}): TextRun[] {
  if (!tokens) return [];
  const runs: TextRun[] = [];
  for (const t of tokens) {
    switch (t.type) {
      case "strong":
        runs.push(...inlineRuns((t as Tokens.Strong).tokens, { ...style, bold: true }));
        break;
      case "em":
        runs.push(...inlineRuns((t as Tokens.Em).tokens, { ...style, italics: true }));
        break;
      case "del":
        runs.push(...inlineRuns((t as Tokens.Del).tokens, { ...style, strike: true }));
        break;
      case "link":
        runs.push(...inlineRuns((t as Tokens.Link).tokens, style));
        break;
      case "codespan":
        runs.push(new TextRun({ text: (t as Tokens.Codespan).text, ...style, font: "Consolas" }));
        break;
      case "br":
        runs.push(new TextRun({ text: "", break: 1 }));
        break;
      case "escape":
        runs.push(new TextRun({ text: (t as Tokens.Escape).text, ...style }));
        break;
      case "text": {
        const tt = t as Tokens.Text;
        if (tt.tokens && tt.tokens.length) runs.push(...inlineRuns(tt.tokens, style));
        else runs.push(new TextRun({ text: decode(tt.text), ...style }));
        break;
      }
      default:
        if ("text" in t && typeof (t as { text?: unknown }).text === "string") {
          runs.push(new TextRun({ text: decode((t as { text: string }).text), ...style }));
        }
    }
  }
  return runs;
}

function decode(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

const HEADINGS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
] as const;

function blocksToParagraphs(
  tokens: Token[],
  ctx: { listInstance: number },
  listState?: { ordered: boolean; level: number; instance: number },
): Paragraph[] {
  const out: Paragraph[] = [];
  for (const t of tokens) {
    switch (t.type) {
      case "heading": {
        const h = t as Tokens.Heading;
        out.push(
          new Paragraph({
            heading: HEADINGS[Math.min(h.depth, 6) - 1],
            children: inlineRuns(h.tokens),
          }),
        );
        break;
      }
      case "paragraph": {
        const p = t as Tokens.Paragraph;
        out.push(
          new Paragraph({
            children: inlineRuns(p.tokens),
            spacing: { after: 160 },
            ...(listState
              ? {
                  numbering: {
                    reference: listState.ordered ? "numbers" : "bullets",
                    level: listState.level,
                    instance: listState.instance,
                  },
                }
              : {}),
          }),
        );
        break;
      }
      case "text": {
        // Loose list items carry bare text tokens.
        const tt = t as Tokens.Text;
        out.push(
          new Paragraph({
            children: tt.tokens?.length
              ? inlineRuns(tt.tokens)
              : [new TextRun(decode(tt.text))],
            spacing: { after: 80 },
            ...(listState
              ? {
                  numbering: {
                    reference: listState.ordered ? "numbers" : "bullets",
                    level: listState.level,
                    instance: listState.instance,
                  },
                }
              : {}),
          }),
        );
        break;
      }
      case "list": {
        const l = t as Tokens.List;
        const instance = l.ordered ? ++ctx.listInstance : 0;
        const level = listState ? Math.min(listState.level + 1, 2) : 0;
        for (const item of l.items) {
          out.push(
            ...blocksToParagraphs(item.tokens, ctx, {
              ordered: !!l.ordered,
              level,
              instance,
            }),
          );
        }
        break;
      }
      case "blockquote": {
        const b = t as Tokens.Blockquote;
        for (const p of blocksToParagraphs(b.tokens, ctx)) out.push(p);
        break;
      }
      case "hr":
        out.push(new Paragraph({ children: [new PageBreak()] }));
        break;
      case "code": {
        const c = t as Tokens.Code;
        for (const line of c.text.split("\n")) {
          out.push(
            new Paragraph({
              children: [new TextRun({ text: line, font: "Consolas" })],
            }),
          );
        }
        break;
      }
      case "table": {
        const tb = t as Tokens.Table;
        const rows = [tb.header, ...tb.rows];
        for (const row of rows) {
          out.push(
            new Paragraph({
              children: [
                new TextRun(row.map((cell) => decode(cell.text)).join("    ")),
              ],
            }),
          );
        }
        break;
      }
      case "space":
      case "html":
      default:
        break;
    }
  }
  return out;
}

export async function downloadDocx(markdown: string, name: string) {
  const blob = await buildDocx(markdown, name);
  downloadBlob(blob, `${slugify(name)}.docx`);
}

/** Convert a Markdown document to a Word file. Pure; safe to run in Node. */
export async function buildDocx(markdown: string, name: string): Promise<Blob> {
  const tokens = marked.lexer(markdown);
  const children = blocksToParagraphs(tokens, { listInstance: 0 });

  const doc = new Document({
    creator: "Greater Inside",
    title: name,
    styles: {
      default: {
        document: { run: { font: "Georgia", size: 23 } },
      },
      paragraphStyles: [
        {
          id: "Heading1",
          name: "Heading 1",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { size: 52, bold: true, font: "Georgia", color: "11325B" },
          paragraph: { spacing: { before: 240, after: 240 } },
        },
        {
          id: "Heading2",
          name: "Heading 2",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { size: 36, bold: true, font: "Georgia", color: "11325B" },
          paragraph: { spacing: { before: 400, after: 160 } },
        },
        {
          id: "Heading3",
          name: "Heading 3",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { size: 24, bold: true, font: "Calibri", color: "832A63" },
          paragraph: { spacing: { before: 280, after: 100 } },
        },
      ],
    },
    numbering: {
      config: [
        {
          reference: "bullets",
          levels: [0, 1, 2].map((level) => ({
            level,
            format: LevelFormat.BULLET,
            text: "•",
            alignment: AlignmentType.LEFT,
            style: {
              paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } },
            },
          })),
        },
        {
          reference: "numbers",
          levels: [0, 1, 2].map((level) => ({
            level,
            format: LevelFormat.DECIMAL,
            text: `%${level + 1}.`,
            alignment: AlignmentType.LEFT,
            style: {
              paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } },
            },
          })),
        },
      ],
    },
    sections: [{ children }],
  });

  return Packer.toBlob(doc);
}
