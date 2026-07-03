import { describe, expect, it } from "vitest";
import {
  checkBasicAuth,
  createSessionToken,
  readCookie,
  validateCredentials,
  verifySessionToken,
} from "../../../../lib/auth";

describe("credentials", () => {
  it("accepts exact credentials", () => {
    expect(validateCredentials("kevin", "s3creto", "kevin", "s3creto")).toBe(
      true,
    );
  });

  it("tolerates spaces and user-case, but not password-case", () => {
    expect(validateCredentials("  Kevin ", "s3creto", "kevin", "s3creto")).toBe(
      true,
    );
    expect(validateCredentials("kevin", "S3CRETO", "kevin", "s3creto")).toBe(
      false,
    );
  });

  it("rejects wrong credentials", () => {
    expect(validateCredentials("kevin", "otra", "kevin", "s3creto")).toBe(
      false,
    );
    expect(validateCredentials("otro", "s3creto", "kevin", "s3creto")).toBe(
      false,
    );
    expect(validateCredentials("", "", "kevin", "s3creto")).toBe(false);
  });
});

describe("basic auth header", () => {
  it("accepts a valid Authorization: Basic header", () => {
    const header = `Basic ${btoa("kevin:s3creto")}`;
    expect(checkBasicAuth(header, "kevin", "s3creto")).toBe(true);
  });

  it("rejects malformed or wrong headers", () => {
    expect(checkBasicAuth(null, "kevin", "s3creto")).toBe(false);
    expect(checkBasicAuth("Bearer xyz", "kevin", "s3creto")).toBe(false);
    expect(checkBasicAuth("Basic !!!", "kevin", "s3creto")).toBe(false);
    expect(
      checkBasicAuth(`Basic ${btoa("kevin:mal")}`, "kevin", "s3creto"),
    ).toBe(false);
  });
});

describe("session tokens", () => {
  it("round-trips a valid token", async () => {
    const token = await createSessionToken("secret");
    expect(await verifySessionToken("secret", token)).toBe(true);
  });

  it("rejects expired tokens", async () => {
    const past = Date.now() - 10_000;
    const token = await createSessionToken("secret", 5_000, past);
    expect(await verifySessionToken("secret", token)).toBe(false);
  });

  it("rejects tampered or foreign tokens", async () => {
    const token = await createSessionToken("secret");
    expect(await verifySessionToken("otro-secreto", token)).toBe(false);
    const [exp, sig] = token.split(".");
    const farFuture = Number(exp) + 1_000_000;
    expect(await verifySessionToken("secret", `${farFuture}.${sig}`)).toBe(
      false,
    );
    expect(await verifySessionToken("secret", "basura")).toBe(false);
    expect(await verifySessionToken("secret", null)).toBe(false);
  });
});

describe("cookies", () => {
  it("reads a cookie among several", () => {
    const header = "a=1; backgammon_session=tok.abc; b=2";
    expect(readCookie(header, "backgammon_session")).toBe("tok.abc");
    expect(readCookie(header, "missing")).toBeNull();
    expect(readCookie(null, "x")).toBeNull();
  });
});
