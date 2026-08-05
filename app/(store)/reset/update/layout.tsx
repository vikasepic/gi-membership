import { NOINDEX } from "@/lib/seo";

// The page itself is a client component and a client component may not export
// metadata, so it lives one level up. Same effect, and the only place it can be.
export const metadata = NOINDEX;

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
