import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { BuiltinAppKey } from "@/lib/builtin-apps/registry";

/**
 * One Anthropic client per built-in app, each on its own key.
 *
 * The apps bill to separate Anthropic accounts, so a call from the Product
 * Builder must never go out on the Hook Generator's key or the other way
 * round. There is deliberately no shared fallback variable: a missing key
 * fails the request with a message naming the variable, rather than quietly
 * charging whichever key happens to be set.
 *
 * Every model call in both apps runs on Claude Sonnet 5. The model names can
 * be pointed elsewhere from the environment without a deploy.
 */
export const COACH_MODEL = process.env.COACH_MODEL || "claude-sonnet-5";
export const BUILD_MODEL = process.env.BUILD_MODEL || "claude-sonnet-5";
export const HOOK_MODEL = process.env.HOOK_MODEL || "claude-sonnet-5";

/** The environment variables each app reads. Exported so the docs and tests name the same ones. */
export const ANTHROPIC_ENV: Record<BuiltinAppKey, { apiKey: string; workspaceId: string }> = {
  "micro-product-builder": {
    apiKey: "ANTHROPIC_API_KEY_PRODUCT_BUILDER",
    workspaceId: "ANTHROPIC_WORKSPACE_ID_PRODUCT_BUILDER",
  },
  "hook-generator": {
    apiKey: "ANTHROPIC_API_KEY_HOOK_GENERATOR",
    workspaceId: "ANTHROPIC_WORKSPACE_ID_HOOK_GENERATOR",
  },
};

const clients = new Map<BuiltinAppKey, Anthropic>();

/** Whether this app can call the model at all. Checked before any stream starts. */
export function anthropicConfigured(app: BuiltinAppKey): boolean {
  return Boolean(process.env[ANTHROPIC_ENV[app].apiKey]);
}

export function anthropicFor(app: BuiltinAppKey): Anthropic {
  const cached = clients.get(app);
  if (cached) return cached;
  const names = ANTHROPIC_ENV[app];
  const apiKey = process.env[names.apiKey];
  if (!apiKey) throw new Error(`${names.apiKey} is not set`);
  const workspaceId = process.env[names.workspaceId];
  const client = new Anthropic({
    apiKey,
    // A guide build streams for several minutes; the SDK default is ten.
    timeout: 15 * 60 * 1000,
    // Identity-linked API keys require the workspace id on every request.
    ...(workspaceId ? { defaultHeaders: { "anthropic-workspace-id": workspaceId } } : {}),
  });
  clients.set(app, client);
  return client;
}

/** Forget the cached clients, so a test can change the environment between calls. */
export function resetAnthropicClients(): void {
  clients.clear();
}

/** Map an SDK error to one of the stable codes the browser shows a sentence for. */
export function anthropicErrorCode(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return "ai_auth_failed";
  if (err instanceof Anthropic.PermissionDeniedError) return "ai_auth_failed";
  if (err instanceof Anthropic.RateLimitError) return "busy_try_again";
  if (err instanceof Anthropic.BadRequestError) return "ai_request_rejected";
  if (err instanceof Anthropic.APIConnectionError) return "ai_unreachable";
  if (err instanceof Anthropic.APIError) return "generation_failed";
  return "generation_failed";
}
