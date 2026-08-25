import { describe, it, expect } from "vitest";
import { isAllowedLinkScheme } from "@/lib/markdown-links";

describe("isAllowedLinkScheme", () => {
  it("allows http, https and mailto", () => {
    expect(isAllowedLinkScheme("http://example.com")).toBe(true);
    expect(isAllowedLinkScheme("https://example.com")).toBe(true);
    expect(isAllowedLinkScheme("mailto:eleve@example.com")).toBe(true);
  });

  it("is case-insensitive on the scheme", () => {
    expect(isAllowedLinkScheme("HTTPS://example.com")).toBe(true);
    expect(isAllowedLinkScheme("MailTo:eleve@example.com")).toBe(true);
  });

  it("rejects schemes that are not allow-listed", () => {
    expect(isAllowedLinkScheme("javascript:alert(1)")).toBe(false);
    expect(isAllowedLinkScheme("data:text/html,hi")).toBe(false);
    expect(isAllowedLinkScheme("file:///etc/passwd")).toBe(false);
    expect(isAllowedLinkScheme("ftp://example.com")).toBe(false);
    expect(isAllowedLinkScheme("tel:0102030405")).toBe(false);
  });

  it("rejects a string with no scheme at all", () => {
    expect(isAllowedLinkScheme("not a url")).toBe(false);
    expect(isAllowedLinkScheme("example.com")).toBe(false);
  });

  it("rejects undefined and the empty string", () => {
    expect(isAllowedLinkScheme(undefined)).toBe(false);
    expect(isAllowedLinkScheme("")).toBe(false);
  });
});
