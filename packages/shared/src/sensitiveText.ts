const PRIVATE_KEY =
  /-----BEGIN (?:[A-Z0-9]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z0-9]+ )?PRIVATE KEY-----/giu;
const AUTHORIZATION = /\b(bearer|basic)\s+[a-z0-9._~+/=-]{4,}/giu;
const PROVIDER_TOKEN =
  /\b(?:sk-[a-z0-9_-]{8,}|gh[pousr]_[a-z0-9_]{8,}|github_pat_[a-z0-9_]{8,}|xox[baprs]-[a-z0-9-]{8,}|AKIA[A-Z0-9]{16})\b/giu;
const JWT = /\beyJ[a-z0-9_-]{8,}\.eyJ[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\b/giu;
const SECRET_ENV =
  /\b([A-Z][A-Z0-9_]*(?:API_KEY|TOKEN|SECRET|PASSWORD|PASSWD|PRIVATE_KEY))\s*=\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gu;
const SECRET_LABEL =
  /\b(api[_ -]?key|access[_ -]?token|refresh[_ -]?token|auth(?:orization)?|password|passwd|secret|credential|private[_ -]?key)\s*(?::|=|\bis\b|\bwas\b)\s*(?:"[^"]*"|'[^']*'|[^\s,;.]+)/giu;
const URL_USER_INFO = /(https?:\/\/)[^\s/@:]+:[^\s/@]+@/giu;
const URL_SECRET_QUERY =
  /([?&](?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|password|secret)=)[^&#\s]+/giu;
const LONG_HEX = /\b[a-f0-9]{64,}\b/giu;
const LONG_BASE64 = /\b[A-Za-z0-9+/=_-]{64,}\b/gu;
const redactIfVaried = (candidate: string) =>
  new Set(candidate.toLocaleLowerCase()).size >= 8 ? "[high-entropy value redacted]" : candidate;

/** Conservatively removes credential-shaped values before text crosses an egress boundary. */
export const redactSensitiveText = (value: string) =>
  value
    .replace(PRIVATE_KEY, "[private key redacted]")
    .replace(AUTHORIZATION, "$1 [redacted]")
    .replace(PROVIDER_TOKEN, "[provider token redacted]")
    .replace(JWT, "[JWT redacted]")
    .replace(SECRET_ENV, "$1=[redacted]")
    .replace(SECRET_LABEL, "$1: [redacted]")
    .replace(URL_USER_INFO, "$1[credentials-redacted]@")
    .replace(URL_SECRET_QUERY, "$1[redacted]")
    .replace(LONG_HEX, redactIfVaried)
    .replace(LONG_BASE64, redactIfVaried);

export const containsSensitiveText = (value: string) => redactSensitiveText(value) !== value;
