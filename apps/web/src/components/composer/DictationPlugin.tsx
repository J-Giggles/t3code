import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createParagraphNode,
  $createTextNode,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_NORMAL,
  createCommand,
  HISTORY_MERGE_TAG,
  type LexicalCommand,
} from "lexical";
import { useEffect, useRef } from "react";

export const START_DICTATION_ANCHOR_COMMAND: LexicalCommand<undefined> =
  createCommand("START_DICTATION_ANCHOR");
export const INSERT_DICTATION_PARTIAL_COMMAND: LexicalCommand<string> = createCommand(
  "INSERT_DICTATION_PARTIAL",
);
export const COMMIT_DICTATION_COMMAND: LexicalCommand<string> = createCommand("COMMIT_DICTATION");
export const DISCARD_DICTATION_ANCHOR_COMMAND: LexicalCommand<undefined> = createCommand(
  "DISCARD_DICTATION_ANCHOR",
);

export function DictationPlugin() {
  const [editor] = useLexicalComposerContext();
  const anchorKeyRef = useRef<string | null>(null);
  const committedTranscriptRef = useRef("");

  useEffect(() => {
    const offStart = editor.registerCommand(
      START_DICTATION_ANCHOR_COMMAND,
      () => {
        editor.update(
          () => {
            committedTranscriptRef.current = "";
            const selection = $getSelection();
            // Mark the anchor as unmergeable so Lexical's normalizer doesn't
            // garbage-collect it while it's empty (the partial-text bridge).
            const anchor = $createTextNode("");
            anchor.toggleUnmergeable();
            if (isEditorFocused(editor) && $isRangeSelection(selection)) {
              selection.insertNodes([anchor]);
            } else {
              appendTextNodeToEnd(anchor);
            }
            anchorKeyRef.current = anchor.getKey();
          },
          { tag: HISTORY_MERGE_TAG },
        );
        return true;
      },
      COMMAND_PRIORITY_NORMAL,
    );

    const offPartial = editor.registerCommand(
      INSERT_DICTATION_PARTIAL_COMMAND,
      (text: string) => {
        const key = anchorKeyRef.current;
        if (!key) return false;
        const displayText = stripCommittedTranscriptPrefix(text, committedTranscriptRef.current);
        editor.update(
          () => {
            const node = $getNodeByKey(key);
            if (node && $isTextNode(node)) {
              node.setTextContent(displayText);
            }
          },
          { tag: HISTORY_MERGE_TAG },
        );
        return true;
      },
      COMMAND_PRIORITY_NORMAL,
    );

    const offCommit = editor.registerCommand(
      COMMIT_DICTATION_COMMAND,
      (text: string) => {
        const previousTranscript = committedTranscriptRef.current;
        const displayText = stripCommittedTranscriptPrefix(text, previousTranscript);
        editor.update(
          () => {
            const key = anchorKeyRef.current;
            const node = key ? $getNodeByKey(key) : null;
            if (node && $isTextNode(node)) {
              node.setTextContent(displayText);
              // Promote: the previous anchor is now a normal text node, so
              // clear the unmergeable flag (it can merge with neighbours).
              if (node.isUnmergeable()) {
                node.toggleUnmergeable();
              }
            }
            const fresh = $createTextNode("");
            fresh.toggleUnmergeable();
            if (node && $isTextNode(node)) {
              node.insertAfter(fresh);
            } else {
              const paragraph = $createParagraphNode();
              paragraph.append(fresh);
              $getRoot().append(paragraph);
            }
            anchorKeyRef.current = fresh.getKey();
            committedTranscriptRef.current =
              previousTranscript.length > 0 && text.startsWith(previousTranscript)
                ? text
                : previousTranscript + displayText;
          },
          { tag: HISTORY_MERGE_TAG },
        );
        return true;
      },
      COMMAND_PRIORITY_NORMAL,
    );

    const offDiscard = editor.registerCommand(
      DISCARD_DICTATION_ANCHOR_COMMAND,
      () => {
        editor.update(
          () => {
            const key = anchorKeyRef.current;
            if (!key) return;
            const node = $getNodeByKey(key);
            if (node && $isTextNode(node)) {
              node.remove();
            }
            anchorKeyRef.current = null;
            committedTranscriptRef.current = "";
          },
          { tag: HISTORY_MERGE_TAG },
        );
        return true;
      },
      COMMAND_PRIORITY_NORMAL,
    );

    return () => {
      offStart();
      offPartial();
      offCommit();
      offDiscard();
    };
  }, [editor]);

  return null;
}

function isEditorFocused(editor: ReturnType<typeof useLexicalComposerContext>[0]): boolean {
  const rootElement = editor.getRootElement();
  return rootElement !== null && rootElement.contains(document.activeElement);
}

function appendTextNodeToEnd(anchor: ReturnType<typeof $createTextNode>): void {
  const root = $getRoot();
  const lastChild = root.getLastChild();
  if (lastChild && $isElementNode(lastChild)) {
    lastChild.append(anchor);
    return;
  }
  const paragraph = $createParagraphNode();
  paragraph.append(anchor);
  root.append(paragraph);
}

function stripCommittedTranscriptPrefix(text: string, committed: string): string {
  if (committed.length === 0) return text;
  return text.startsWith(committed) ? text.slice(committed.length) : text;
}
