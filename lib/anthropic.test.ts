import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  ANTHROPIC_ENV,
  anthropicConfigured,
  anthropicFor,
  resetAnthropicClients,
} from "@/lib/anthropic";

/**
 * Two apps, two Anthropic accounts. A call from one must never go out on the
 * other's key, and there is no shared key to fall back on: that would put
 * one app's spend on the other's bill without anybody noticing.
 */
describe("per-app Anthropic keys", () => {
  const saved: Record<string, string | undefined> = {};
  const VARS = [
    ...Object.values(ANTHROPIC_ENV).flatMap((v) => [v.apiKey, v.workspaceId]),
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_WORKSPACE_ID",
  ];

  beforeEach(() => {
    for (const v of VARS) {
      saved[v] = process.env[v];
      delete process.env[v];
    }
    resetAnthropicClients();
  });

  afterEach(() => {
    for (const v of VARS) {
      if (saved[v] === undefined) delete process.env[v];
      else process.env[v] = saved[v];
    }
    resetAnthropicClients();
  });

  it("names a different variable for each app", () => {
    expect(ANTHROPIC_ENV["micro-product-builder"].apiKey).not.toBe(
      ANTHROPIC_ENV["hook-generator"].apiKey,
    );
  });

  it("is configured only by the app's own variable", () => {
    process.env.ANTHROPIC_API_KEY_PRODUCT_BUILDER = "sk-pb";
    expect(anthropicConfigured("micro-product-builder")).toBe(true);
    expect(anthropicConfigured("hook-generator")).toBe(false);
  });

  it("does not fall back to a shared ANTHROPIC_API_KEY", () => {
    process.env.ANTHROPIC_API_KEY = "sk-shared";
    expect(anthropicConfigured("micro-product-builder")).toBe(false);
    expect(anthropicConfigured("hook-generator")).toBe(false);
    expect(() => anthropicFor("hook-generator")).toThrow(/ANTHROPIC_API_KEY_HOOK_GENERATOR/);
  });

  it("builds each client on its own key", () => {
    process.env.ANTHROPIC_API_KEY_PRODUCT_BUILDER = "sk-pb";
    process.env.ANTHROPIC_API_KEY_HOOK_GENERATOR = "sk-hg";
    const pb = anthropicFor("micro-product-builder");
    const hg = anthropicFor("hook-generator");
    expect(pb).not.toBe(hg);
    expect(pb.apiKey).toBe("sk-pb");
    expect(hg.apiKey).toBe("sk-hg");
    // Cached: the same app gets the same client back.
    expect(anthropicFor("hook-generator")).toBe(hg);
  });
});
