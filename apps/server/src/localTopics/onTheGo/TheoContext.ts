import type { OnTheGoSnapshot, OrchestrationThread } from "@t3tools/contracts";

export interface TheoThreadContextSource {
  readonly source: "t3-thread";
  readonly reference: string;
  readonly sourceVersion: string;
  readonly excerpt: string;
}

export interface TheoThreadContextBundle {
  readonly text: string;
  readonly sources: ReadonlyArray<TheoThreadContextSource>;
  readonly expanded: boolean;
}

const EXPANSION_CUE =
  /\b(other|another|all|project|thread|chat|history|elsewhere|context|fetch|find|look up|search)\b/i;
const STOP_WORDS = new Set([
  "all",
  "another",
  "about",
  "agent",
  "chat",
  "context",
  "could",
  "elsewhere",
  "fetch",
  "find",
  "from",
  "have",
  "history",
  "other",
  "please",
  "project",
  "response",
  "search",
  "that",
  "the",
  "theo",
  "there",
  "this",
  "thread",
  "what",
  "with",
]);

export const redactTheoEvidence = (value: string) =>
  value
    .replace(/\b(api[_ -]?key|access[_ -]?token|password|secret)\s*[:=]\s*\S+/gi, "$1: [redacted]")
    .replace(/```[\s\S]*?```/g, "[code omitted]")
    .slice(0, 4_000);

const termsFor = (utterance: string) =>
  Array.from(
    new Set(
      utterance
        .toLocaleLowerCase()
        .match(/[a-z0-9][a-z0-9_-]{2,}/g)
        ?.filter((term) => !STOP_WORDS.has(term)) ?? [],
    ),
  ).slice(0, 12);

const excerptFor = (thread: OrchestrationThread) =>
  redactTheoEvidence(
    [
      `Thread: ${thread.title}`,
      ...thread.messages.slice(-6).map((m) => `${m.role}: ${m.text}`),
    ].join("\n"),
  );

export const shouldExpandTheoContext = (utterance: string) => EXPANSION_CUE.test(utterance);

export const buildTheoThreadContext = (input: {
  readonly snapshot: OnTheGoSnapshot;
  readonly threads: ReadonlyArray<OrchestrationThread>;
  readonly utterance: string;
}): TheoThreadContextBundle => {
  const selectedResponse = input.snapshot.foundation.responses.find(
    (response) => response.responseId === input.snapshot.foundation.selectedResponseId,
  );
  const focusedThreadId = selectedResponse?.chatId ?? null;
  const focusedThread = input.threads.find((thread) => thread.id === focusedThreadId) ?? null;
  const expanded = shouldExpandTheoContext(input.utterance);
  const terms = termsFor(input.utterance);
  const focusedProjectId = focusedThread?.projectId ?? null;
  const candidates = expanded
    ? input.threads
        .filter((thread) => thread.id !== focusedThreadId && thread.deletedAt === null)
        .map((thread) => {
          const searchable = `${thread.title}\n${thread.messages
            .slice(-10)
            .map((message) => message.text)
            .join("\n")}`.toLocaleLowerCase();
          const termScore = terms.reduce(
            (score, term) => score + (searchable.includes(term) ? 3 : 0),
            0,
          );
          const projectScore = focusedProjectId && thread.projectId === focusedProjectId ? 2 : 0;
          return { thread, score: termScore + projectScore };
        })
        .filter((candidate) => candidate.score > 0)
        .toSorted(
          (left, right) =>
            right.score - left.score || right.thread.updatedAt.localeCompare(left.thread.updatedAt),
        )
        .slice(0, 3)
        .map((candidate) => candidate.thread)
    : [];
  const selectedThreads = [...(focusedThread ? [focusedThread] : []), ...candidates];
  const sources = selectedThreads.map((thread) => ({
    source: "t3-thread" as const,
    reference: thread.id,
    sourceVersion: thread.updatedAt,
    excerpt: excerptFor(thread),
  }));
  return {
    expanded,
    sources,
    text: sources
      .map(
        (source) =>
          `<t3-thread id="${source.reference}" version="${source.sourceVersion}">\n${source.excerpt}\n</t3-thread>`,
      )
      .join("\n\n")
      .slice(0, 16_000),
  };
};
