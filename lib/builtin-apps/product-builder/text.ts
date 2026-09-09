/**
 * The product and the coach must never contain an em dash or an en dash.
 * The model gets this right almost always; this is the guarantee for the
 * rest. A dash between numbers becomes "to"; any other dash becomes a comma,
 * which is what the prompt tells the model to use instead.
 *
 * Runs on every streamed chunk, so it has to be cheap when there is nothing
 * to do. Pure, and kept free of server-only imports so it can be tested.
 */
export function stripDashes(text: string): string {
  if (!/[–—]/.test(text)) return text;
  return text
    .replace(/(\d)\s*[–—]\s*(\d)/g, "$1 to $2")
    .replace(/\s*[–—]+\s*/g, ", ")
    .replace(/([.!?:;])\s*,\s+/g, "$1 ") // "end.— Next" would otherwise become "end., Next"
    .replace(/,\s*,/g, ",");
}
