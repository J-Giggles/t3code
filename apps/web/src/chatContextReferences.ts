import {
  parseComposerThreadReference,
  serializeComposerThreadReference,
} from "@t3tools/shared/composerTrigger";

import type { ChatMessage, SidebarThreadSummary, Thread } from "./types";

export interface ChatContextReferenceResolverInput {
  prompt: string;
  projectThreads: ReadonlyArray<SidebarThreadSummary>;
  currentThreadId: string;
  getThread: (ref: { environmentId: string; threadId: string }) => Thread | undefined;
  maxContextChars?: number;
}

const DEFAULT_MAX_CHAT_CONTEXT_CHARS = 60_000;
const THREAD_REFERENCE_PATTERN = /@thread:[^\s]+/g;
const LEGACY_CHAT_REFERENCE_PATTERN = /(^|[\s([{])chat:([^\s)\]}]+)/g;

function slugChatTitle(title: string): string {
  return title.trim().replace(/\s+/g, "-").toLowerCase();
}

function messageRoleLabel(message: ChatMessage): "USER" | "ASSISTANT" | "SYSTEM" {
  if (message.role === "assistant") return "ASSISTANT";
  if (message.role === "system") return "SYSTEM";
  return "USER";
}

function messageTextForTranscript(message: ChatMessage): string {
  const text = message.text.trim();
  const imageCount =
    message.attachments?.filter((attachment) => attachment.type === "image").length ?? 0;
  const imageSummary =
    imageCount > 0 ? `[${imageCount} attached image${imageCount === 1 ? "" : "s"}]` : "";
  if (text && imageSummary) return `${text}\n${imageSummary}`;
  if (text) return text;
  if (imageSummary) return imageSummary;
  return "(empty message)";
}

function buildChatContextBlock(thread: Thread, maxChars: number): string {
  const title = thread.title.trim() || "Untitled chat";
  const blocks = thread.messages.map(
    (message) => `${messageRoleLabel(message)}:\n${messageTextForTranscript(message)}`,
  );
  const footer = "</chat_context>";
  const header = `<chat_context title="${title.replaceAll('"', "'")}" reference="${serializeComposerThreadReference(
    {
      environmentId: thread.environmentId,
      threadId: thread.id,
    },
  )}">`;

  let body = blocks.join("\n\n");
  let omittedCount = 0;
  while (
    body.length > 0 &&
    `${header}\n${body}\n${footer}`.length > maxChars &&
    blocks.length > omittedCount
  ) {
    omittedCount += 1;
    body = blocks.slice(omittedCount).join("\n\n");
  }

  if (omittedCount > 0) {
    body = `[${omittedCount} earlier message(s) omitted to stay within input limits.]${
      body ? `\n\n${body}` : ""
    }`;
  }

  return `${header}\n${body || "(no messages)"}\n${footer}`;
}

function resolveLegacyChatSlug(
  slug: string,
  input: ChatContextReferenceResolverInput,
): { environmentId: string; threadId: string } | null {
  const normalizedSlug = slug.toLowerCase();
  const matches = input.projectThreads.filter(
    (thread) =>
      thread.id !== input.currentThreadId &&
      (slugChatTitle(thread.title || "Untitled chat") === normalizedSlug || thread.id === slug),
  );
  if (matches.length !== 1) return null;
  const match = matches[0]!;
  return { environmentId: match.environmentId, threadId: match.id };
}

export function expandChatContextReferences(input: ChatContextReferenceResolverInput): {
  prompt: string;
  expandedCount: number;
} {
  const maxContextChars = Math.max(
    1,
    Math.floor(input.maxContextChars ?? DEFAULT_MAX_CHAT_CONTEXT_CHARS),
  );
  const expandedRefs = new Set<string>();
  let expandedCount = 0;

  const expandRef = (
    ref: { environmentId: string; threadId: string },
    fallback: string,
  ): string => {
    const key = `${ref.environmentId}\0${ref.threadId}`;
    const thread = input.getThread(ref);
    if (!thread || thread.id === input.currentThreadId || expandedRefs.has(key)) {
      return fallback;
    }
    expandedRefs.add(key);
    expandedCount += 1;
    return buildChatContextBlock(thread, maxContextChars);
  };

  const withThreadRefs = input.prompt.replace(THREAD_REFERENCE_PATTERN, (match) => {
    const parsed = parseComposerThreadReference(match.slice(1));
    return parsed ? expandRef(parsed, match) : match;
  });

  const prompt = withThreadRefs.replace(LEGACY_CHAT_REFERENCE_PATTERN, (match, prefix, slug) => {
    const ref = resolveLegacyChatSlug(String(slug), input);
    const expanded = ref ? expandRef(ref, `chat:${slug}`) : `chat:${slug}`;
    return `${prefix}${expanded}`;
  });

  return { prompt, expandedCount };
}
