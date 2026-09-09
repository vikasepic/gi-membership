import "server-only";
import Anthropic from "@anthropic-ai/sdk";

/**
 * One Anthropic client for the built-in apps.
 *
 * Every model call in the store runs on Claude Sonnet 5. The two names below
 * exist so a role can be pointed at another model from the environment
 * without a deploy; nothing else reads the model id.
 */
export const COACH_MODEL = process.env.COACH_MODEL || "claude-sonnet-5";
export const BUILD_MODEL = process.env.BUILD_MODEL || "claude-sonnet-5";

let client: Anthropic | null = null;

export function anthropic(): Anthropic {
  if (client) return client;
  client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    // A guide build streams for several minutes; the SDK default is ten.
    timeout: 15 * 60 * 1000,
    // Identity-linked API keys require the workspace id on every request.
    ...(process.env.ANTHROPIC_WORKSPACE_ID
      ? { defaultHeaders: { "anthropic-workspace-id": process.env.ANTHROPIC_WORKSPACE_ID } }
      : {}),
  });
  return client;
}

/** Whether the server can call the model at all. Checked before any stream starts. */
export function anthropicConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
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
