import { NextResponse } from "next/server";
import { viewer } from "@/lib/view-as";
import { userOwnsCourse } from "@/lib/courses";
import { setItemCompletion, isItemCompleted, setItemPosition, type CompletionSource } from "@/lib/progress";

const SOURCES: CompletionSource[] = ["manual", "video", "download", "dwell"];

// Idempotent: clients may fire freely. setItemCompletion decides whether the
// signal is allowed to move the row (manual_override wins permanently).
export async function POST(req: Request) {
  const user = await viewer();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    itemId?: string;
    productId?: string;
    completed?: boolean;
    source?: CompletionSource;
    positionSeconds?: number;
    durationSeconds?: number;
  };
  const { itemId, productId, completed, source, positionSeconds, durationSeconds } = body;
  // Two kinds of write share this route: a completion, and a playhead saved
  // every few seconds while a video runs. A request may carry either or both,
  // but one of them has to be there.
  const hasCompletion = typeof completed === "boolean" && !!source && SOURCES.includes(source);
  const hasPosition = typeof positionSeconds === "number" && Number.isFinite(positionSeconds) && positionSeconds >= 0;
  if (!itemId || !productId || (!hasCompletion && !hasPosition)) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  if (!(await userOwnsCourse(user.id, productId))) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  if (hasPosition) {
    // A duration that is not a sane positive number is dropped rather than
    // stored: the column has a CHECK that would refuse it, and a failed
    // insert here would lose the position as well.
    const duration =
      typeof durationSeconds === "number" && Number.isFinite(durationSeconds) && durationSeconds > 0
        ? durationSeconds
        : null;
    await setItemPosition(user.id, productId, itemId, {
      positionSeconds: positionSeconds as number,
      durationSeconds: duration,
    });
  }
  if (hasCompletion) {
    await setItemCompletion(user.id, productId, itemId, completed as boolean, source as CompletionSource);
  }
  const actual = await isItemCompleted(user.id, itemId);
  return NextResponse.json({ ok: true, completed: actual });
}
