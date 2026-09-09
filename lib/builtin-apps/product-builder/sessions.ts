import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";
import type { Stage } from "./stages";
import type { DocumentKind, DocumentRecord, MessageRecord, SessionRecord, Shape } from "./types";

// Every read and write for the Product Builder's three tables. All through the
// service role, all scoped to the member who owns the session: the browser
// never touches these tables, so this file is the whole access boundary.

export const SESSION_COLUMNS = "id, title, stage, quick, shape, created_at, updated_at";
export const MESSAGE_COLUMNS = "id, role, kind, content, stage, created_at";
export const DOCUMENT_COLUMNS = "id, kind, title, content, truncated, created_at";

export async function listSessions(userId: string): Promise<SessionRecord[]> {
  const db = createServiceClient();
  const { data } = await db
    .from("pb_sessions")
    .select(SESSION_COLUMNS)
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(100);
  return (data as unknown as SessionRecord[]) ?? [];
}

/** The session, only if this member owns it. Anyone else's id reads as missing. */
export async function loadOwnedSession(
  sessionId: string,
  userId: string,
): Promise<SessionRecord | null> {
  const db = createServiceClient();
  const { data } = await db
    .from("pb_sessions")
    .select(SESSION_COLUMNS)
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();
  return (data as unknown as SessionRecord | null) ?? null;
}

export async function createSession(args: {
  userId: string;
  quick: boolean;
  title: string | null;
  /** The intake form's answers, stored as the first user turn. Empty means none. */
  intake: string;
}): Promise<SessionRecord | null> {
  const db = createServiceClient();
  const storeId = await getStoreId();
  const { data, error } = await db
    .from("pb_sessions")
    .insert({
      store_id: storeId,
      user_id: args.userId,
      quick: args.quick,
      ...(args.title ? { title: args.title } : {}),
    })
    .select(SESSION_COLUMNS)
    .single();
  if (error || !data) {
    console.error("[product-builder] failed to create session", error);
    return null;
  }
  const session = data as unknown as SessionRecord;
  if (args.intake) {
    const { error: msgError } = await db.from("pb_messages").insert({
      store_id: storeId,
      session_id: session.id,
      user_id: args.userId,
      role: "user",
      kind: "chat",
      content: args.intake,
      stage: "NARROW",
    });
    if (msgError) console.error("[product-builder] failed to save intake message", msgError);
  }
  return session;
}

/** Delete a session and, by cascade, its transcript and documents. False if it was not theirs. */
export async function deleteOwnedSession(sessionId: string, userId: string): Promise<boolean> {
  const db = createServiceClient();
  const { data } = await db
    .from("pb_sessions")
    .delete()
    .eq("id", sessionId)
    .eq("user_id", userId)
    .select("id");
  return (data?.length ?? 0) > 0;
}

export async function updateSession(
  sessionId: string,
  patch: { stage?: Stage; title?: string; shape?: Shape },
  /** Only apply when the session is still at this stage: a newer turn may have moved it. */
  onlyIfStage?: Stage,
): Promise<boolean> {
  const db = createServiceClient();
  let q = db
    .from("pb_sessions")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", sessionId);
  if (onlyIfStage) q = q.eq("stage", onlyIfStage);
  const { data } = await q.select("id");
  return (data?.length ?? 0) > 0;
}

export async function loadMessages(sessionId: string): Promise<MessageRecord[]> {
  const db = createServiceClient();
  const { data } = await db
    .from("pb_messages")
    .select(MESSAGE_COLUMNS)
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  return (data as MessageRecord[]) ?? [];
}

export async function saveMessage(args: {
  sessionId: string;
  userId: string;
  role: "user" | "assistant";
  kind: "chat" | "skip";
  content: string;
  stage: Stage;
}): Promise<MessageRecord | null> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("pb_messages")
    .insert({
      store_id: await getStoreId(),
      session_id: args.sessionId,
      user_id: args.userId,
      role: args.role,
      kind: args.kind,
      content: args.content,
      stage: args.stage,
    })
    .select(MESSAGE_COLUMNS)
    .single();
  if (error || !data) {
    console.error("[product-builder] failed to save message", error);
    return null;
  }
  return data as MessageRecord;
}

export async function deleteMessage(messageId: string): Promise<void> {
  const db = createServiceClient();
  await db.from("pb_messages").delete().eq("id", messageId);
}

export async function loadDocuments(sessionId: string): Promise<DocumentRecord[]> {
  const db = createServiceClient();
  const { data } = await db
    .from("pb_documents")
    .select(DOCUMENT_COLUMNS)
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  return (data as DocumentRecord[]) ?? [];
}

export async function loadLatestGuide(sessionId: string): Promise<DocumentRecord | null> {
  const db = createServiceClient();
  const { data } = await db
    .from("pb_documents")
    .select(DOCUMENT_COLUMNS)
    .eq("session_id", sessionId)
    .eq("kind", "guide")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as DocumentRecord | null) ?? null;
}

export async function saveDocument(args: {
  sessionId: string;
  userId: string;
  kind: DocumentKind;
  title: string;
  content: string;
  model: string;
  truncated: boolean;
}): Promise<DocumentRecord | null> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("pb_documents")
    .insert({
      store_id: await getStoreId(),
      session_id: args.sessionId,
      user_id: args.userId,
      kind: args.kind,
      title: args.title,
      content: args.content,
      model: args.model,
      truncated: args.truncated,
    })
    .select(DOCUMENT_COLUMNS)
    .single();
  if (error || !data) {
    console.error("[product-builder] failed to save document", error);
    return null;
  }
  // A build is activity on the session; the list sorts by it.
  await db
    .from("pb_sessions")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", args.sessionId);
  return data as DocumentRecord;
}
