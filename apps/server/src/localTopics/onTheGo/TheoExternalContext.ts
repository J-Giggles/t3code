// @effect-diagnostics nodeBuiltinImport:off globalTimers:off - This bounded server adapter pins verified DNS answers into its HTTPS request and owns its abort timer.
import * as NodeDnsPromises from "node:dns/promises";
import * as NodeHttps from "node:https";
import * as NodeNet from "node:net";

import { redactTheoEvidence } from "./TheoContext.ts";

export interface TheoExternalContextSource {
  readonly source: "web" | `connected-app:${string}`;
  readonly reference: string;
  readonly sourceVersion: string;
  readonly excerpt: string;
  readonly allowedProviderIds: ReadonlyArray<string>;
}

export interface TheoConnectedContextProvider {
  readonly id: string;
  readonly allowedProviderIds: ReadonlyArray<string>;
  readonly matches: (utterance: string) => boolean;
  readonly read: (utterance: string) => Promise<ReadonlyArray<TheoExternalContextSource>>;
}

const connectedContextProviders = new Map<string, TheoConnectedContextProvider>();

export const registerTheoConnectedContextProvider = (provider: TheoConnectedContextProvider) => {
  if (connectedContextProviders.has(provider.id)) {
    throw new Error(`Theo connected context provider ${provider.id} is already registered`);
  }
  connectedContextProviders.set(provider.id, provider);
  return () => {
    if (connectedContextProviders.get(provider.id) === provider) {
      connectedContextProviders.delete(provider.id);
    }
  };
};

interface TheoWebContextPorts {
  readonly resolve: (hostname: string) => Promise<ReadonlyArray<string>>;
  readonly fetch: (
    url: string,
    signal: AbortSignal,
    address: string,
  ) => Promise<{
    readonly ok: boolean;
    readonly contentType: string | null;
    readonly version: string | null;
    readonly text: () => Promise<string>;
  }>;
}

const URL_PATTERN = /https:\/\/[^\s<>"')\]]+/giu;
const ALLOWED_CONTENT = /^(?:text\/(?:plain|html|markdown)|application\/(?:json|ld\+json))/iu;

const isPrivateIpv4 = (address: string) => {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet))) return true;
  const a = octets[0]!;
  const b = octets[1]!;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
};

const isPrivateAddress = (address: string) => {
  const kind = NodeNet.isIP(address);
  if (kind === 4) return isPrivateIpv4(address);
  if (kind !== 6) return true;
  const normalized = address.toLocaleLowerCase();
  const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/u)?.[1];
  if (mappedIpv4) return isPrivateIpv4(mappedIpv4);
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("ff") ||
    /^fe[89ab]/u.test(normalized) ||
    normalized.startsWith("fec") ||
    normalized.startsWith("fed") ||
    normalized.startsWith("fee") ||
    normalized.startsWith("fef")
  );
};

const defaultPorts: TheoWebContextPorts = {
  resolve: async (hostname) =>
    (await NodeDnsPromises.lookup(hostname, { all: true, verbatim: true })).map(
      (entry) => entry.address,
    ),
  fetch: (url, signal, address) =>
    new Promise((resolve, reject) => {
      const chunks = new Array<Buffer>();
      let size = 0;
      const request = NodeHttps.request(url, {
        method: "GET",
        signal,
        agent: false,
        headers: { accept: "text/plain,text/markdown,text/html,application/json" },
        lookup: (_hostname, _options, callback) => {
          const family = NodeNet.isIP(address);
          if (family !== 4 && family !== 6) {
            callback(new TypeError("The verified Theo context address is invalid"), address, 0);
            return;
          }
          callback(null, address, family);
        },
      });
      request.once("error", reject);
      request.once("response", (response) => {
        response.on("data", (chunk: Buffer) => {
          size += chunk.byteLength;
          if (size > 256_000) {
            request.destroy(new RangeError("Theo web context exceeded the response limit"));
            return;
          }
          chunks.push(chunk);
        });
        response.once("error", reject);
        response.once("end", () => {
          const status = response.statusCode ?? 0;
          resolve({
            ok: status >= 200 && status < 300,
            contentType:
              typeof response.headers["content-type"] === "string"
                ? response.headers["content-type"]
                : null,
            version:
              typeof response.headers.etag === "string"
                ? response.headers.etag
                : typeof response.headers["last-modified"] === "string"
                  ? response.headers["last-modified"]
                  : null,
            text: async () => Buffer.concat(chunks).toString("utf8"),
          });
        });
      });
      request.end();
    }),
};

const safeUrl = async (raw: string, ports: TheoWebContextPorts) => {
  const url = new URL(raw);
  if (
    url.protocol !== "https:" ||
    (url.port && url.port !== "443") ||
    url.username ||
    url.password ||
    /(?:^|\.)(?:localhost|local|internal|home|lan)$/iu.test(url.hostname)
  )
    return null;
  const addresses = await ports.resolve(url.hostname).catch(() => []);
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) return null;
  url.hash = "";
  return { url: url.toString(), address: addresses[0]! };
};

const htmlToText = (text: string) =>
  text
    .replace(/<(?:script|style|template)[^>]*>[\s\S]*?<\/(?:script|style|template)>/giu, " ")
    .replace(/<[^>]+>/gu, " ")
    .replace(/&(?:nbsp|amp|lt|gt|quot);/giu, " ")
    .replace(/\s+/gu, " ")
    .trim();

export const readTheoWebContext = async (
  utterance: string,
  ports: TheoWebContextPorts = defaultPorts,
): Promise<ReadonlyArray<TheoExternalContextSource>> => {
  const candidates = [...new Set(utterance.match(URL_PATTERN) ?? [])].slice(0, 3);
  const sources = new Array<TheoExternalContextSource>();
  for (const candidate of candidates) {
    const target = await safeUrl(candidate, ports).catch(() => null);
    if (!target) continue;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);
    try {
      const response = await ports.fetch(target.url, controller.signal, target.address);
      if (!response.ok || !ALLOWED_CONTENT.test(response.contentType ?? "")) continue;
      const body = (await response.text()).slice(0, 256_000);
      const excerpt = redactTheoEvidence(
        (response.contentType ?? "").startsWith("text/html") ? htmlToText(body) : body,
      );
      if (!excerpt.trim()) continue;
      sources.push({
        source: "web",
        reference: target.url,
        sourceVersion: response.version ?? "unversioned",
        excerpt,
        allowedProviderIds: ["*"],
      });
    } catch {
      // Unreachable, redirected, slow, or incompatible web evidence is unavailable.
    } finally {
      clearTimeout(timeout);
    }
  }
  return sources;
};

export const readTheoConnectedContext = async (
  utterance: string,
  providers: ReadonlyArray<TheoConnectedContextProvider>,
) => {
  const selected = providers.filter((provider) => provider.matches(utterance)).slice(0, 3);
  const results = await Promise.all(
    selected.map((provider) =>
      provider
        .read(utterance)
        .then((sources) =>
          sources.slice(0, 3).map((source) => ({
            ...source,
            source: `connected-app:${provider.id}` as const,
            excerpt: redactTheoEvidence(source.excerpt),
            allowedProviderIds: provider.allowedProviderIds,
          })),
        )
        .catch(() => []),
    ),
  );
  return results.flat().slice(0, 3);
};

export const readRegisteredTheoConnectedContext = (utterance: string) =>
  readTheoConnectedContext(utterance, [...connectedContextProviders.values()]);
