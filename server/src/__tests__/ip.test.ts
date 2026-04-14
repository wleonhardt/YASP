import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { extractClientIp } from "../transport/ip.js";

describe("extractClientIp — trust-hop resolver", () => {
  it("with trustedHops=0, returns the direct TCP peer and ignores XFF (dev / no proxy)", () => {
    const ip = extractClientIp({ "x-forwarded-for": "evil.attacker, 203.0.113.8" }, "198.51.100.42", 0);
    expect(ip).toBe("198.51.100.42");
  });

  it("with trustedHops=2 and the documented production chain, returns the real viewer IP", () => {
    // Production: attacker-supplied hops + viewer (CloudFront-added) + CF-edge (nginx-added).
    // Chain right-to-left = [peer(127.0.0.1 nginx), cf-edge, viewer, attacker2, attacker1].
    // Trust 2 hops → skip peer + cf-edge → viewer IP is returned.
    const ip = extractClientIp(
      { "x-forwarded-for": "attacker1, attacker2, 203.0.113.55, 52.46.1.2" },
      "127.0.0.1",
      2
    );
    expect(ip).toBe("203.0.113.55");
  });

  it("with trustedHops=2 but only one XFF hop, returns the rightmost untrusted value (leftmost available)", () => {
    // Chain right-to-left = [peer, xff0]. trustedHops=2 > length-1=1 → clamp to last = xff0.
    const ip = extractClientIp({ "x-forwarded-for": "203.0.113.55" }, "127.0.0.1", 2);
    expect(ip).toBe("203.0.113.55");
  });

  it("with trustedHops=2 and no XFF at all, returns the peer (no proxy context)", () => {
    const ip = extractClientIp({}, "127.0.0.1", 2);
    expect(ip).toBe("127.0.0.1");
  });

  it("is spoof-resistant: an attacker rotating XFF cannot change the returned IP under trust=2", () => {
    // Attacker controls the LEFTMOST entries. As long as CloudFront appends
    // the real viewer and nginx appends cf-edge, trust=2 lands on viewer.
    const baseline = extractClientIp({ "x-forwarded-for": "203.0.113.55, 52.46.1.2" }, "127.0.0.1", 2);
    for (const spoof of ["1.2.3.4", "9.9.9.9, 1.2.3.4", "a, b, c", ""]) {
      const chain = spoof ? `${spoof}, 203.0.113.55, 52.46.1.2` : "203.0.113.55, 52.46.1.2";
      const ip = extractClientIp({ "x-forwarded-for": chain }, "127.0.0.1", 2);
      expect(ip).toBe(baseline);
    }
  });

  it("strips IPv4 port and IPv6 brackets", () => {
    expect(extractClientIp({}, "10.0.0.1:5678", 0)).toBe("10.0.0.1");
    expect(extractClientIp({}, "[::1]:443", 0)).toBe("::1");
  });

  it("returns 'unknown' when both headers and peer are empty", () => {
    expect(extractClientIp(undefined, undefined, 0)).toBe("unknown");
  });

  it("handles array-form XFF (some frameworks join multiples)", () => {
    const ip = extractClientIp(
      { "x-forwarded-for": ["attacker, 203.0.113.55", "52.46.1.2"] },
      "127.0.0.1",
      2
    );
    expect(ip).toBe("203.0.113.55");
  });
});

describe("Fastify trustProxy consistency", () => {
  let app: Awaited<ReturnType<typeof Fastify>> | null = null;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = null;
    }
  });

  it("matches the Socket.IO helper for the documented CloudFront -> nginx -> Node chain", async () => {
    app = Fastify({ trustProxy: 2, logger: false });
    app.get("/ip", (request: FastifyRequest, reply: FastifyReply) => {
      return reply.send({ ip: request.ip, ips: request.ips });
    });
    await app.ready();

    const headers = {
      "x-forwarded-for": "attacker1, attacker2, 203.0.113.55, 52.46.1.2",
    };
    const tcpPeer = "127.0.0.1";
    const expected = extractClientIp(headers, tcpPeer, 2);

    const res = await app.inject({
      method: "GET",
      url: "/ip",
      headers,
      remoteAddress: tcpPeer,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      ip: expected,
      ips: ["127.0.0.1", "52.46.1.2", "203.0.113.55"],
    });
  });
});
