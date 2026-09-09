import type { Metadata } from "next";
import { BuiltinAppHeader } from "@/components/apps/app-header";
import { BUILTIN_APPS } from "@/lib/builtin-apps/registry";
import { NOINDEX } from "@/lib/seo";

const APP = BUILTIN_APPS["micro-product-builder"];

export const metadata: Metadata = { ...NOINDEX, title: APP.name };

export default function ProductBuilderLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <BuiltinAppHeader app={APP} wide />
      {children}
    </>
  );
}
