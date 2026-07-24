import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ownsProduct, signedAssetUrl } from "@/lib/library";

// Delivery gate for paid uploads. Every request re-checks the logged-in user
// owns the product, then 302s to a fresh 60s signed URL. Nothing paid is ever
// on a public path.
export async function GET(_req: Request, { params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  if (!(await ownsProduct(user.id, productId))) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const url = await signedAssetUrl(productId, 60);
  if (!url) return new NextResponse("Asset not found", { status: 404 });

  return NextResponse.redirect(url);
}
