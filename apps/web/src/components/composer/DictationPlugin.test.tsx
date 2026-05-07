// @vitest-environment happy-dom
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { act, render } from "@testing-library/react";
import { $createParagraphNode, $createTextNode, $getRoot, type LexicalEditor } from "lexical";
import { describe, expect, it } from "vitest";
import {
  COMMIT_DICTATION_COMMAND,
  DictationPlugin,
  INSERT_DICTATION_PARTIAL_COMMAND,
  START_DICTATION_ANCHOR_COMMAND,
} from "./DictationPlugin.tsx";

function getEditorText(editor: LexicalEditor): string {
  let text = "";
  editor.getEditorState().read(() => {
    text = $getRoot().getTextContent();
  });
  return text;
}

let capturedEditor: LexicalEditor | null = null;

function CaptureEditor() {
  const [editor] = useLexicalComposerContext();
  capturedEditor = editor;
  return null;
}

function renderPlugin(): LexicalEditor {
  capturedEditor = null;
  render(
    <LexicalComposer
      initialConfig={{
        namespace: "test",
        onError: (error) => {
          throw error;
        },
      }}
    >
      <DictationPlugin />
      <CaptureEditor />
    </LexicalComposer>,
  );
  const editor: LexicalEditor | null = capturedEditor;
  if (!editor) throw new Error("editor not captured");
  return editor;
}

describe("DictationPlugin", () => {
  it("inserts and replaces partial text at the anchor", async () => {
    const editor = renderPlugin();
    await act(async () => {
      editor.dispatchCommand(START_DICTATION_ANCHOR_COMMAND, undefined);
      editor.dispatchCommand(INSERT_DICTATION_PARTIAL_COMMAND, "hel");
      editor.dispatchCommand(INSERT_DICTATION_PARTIAL_COMMAND, "hello");
    });
    expect(getEditorText(editor)).toBe("hello");
  });

  it("commit promotes anchor and creates a fresh anchor for next partials", async () => {
    const editor = renderPlugin();
    await act(async () => {
      editor.dispatchCommand(START_DICTATION_ANCHOR_COMMAND, undefined);
      editor.dispatchCommand(INSERT_DICTATION_PARTIAL_COMMAND, "hello");
      editor.dispatchCommand(COMMIT_DICTATION_COMMAND, "hello world.");
      editor.dispatchCommand(INSERT_DICTATION_PARTIAL_COMMAND, " how");
    });
    expect(getEditorText(editor)).toBe("hello world. how");
  });

  it("appends at the end when the editor is not focused", async () => {
    const editor = renderPlugin();
    await act(async () => {
      editor.update(() => {
        const text = $createTextNode("existing text");
        const paragraph = $createParagraphNode();
        paragraph.append(text);
        $getRoot().clear();
        $getRoot().append(paragraph);
        text.select(0, text.getTextContentSize());
      });
      editor.dispatchCommand(START_DICTATION_ANCHOR_COMMAND, undefined);
      editor.dispatchCommand(INSERT_DICTATION_PARTIAL_COMMAND, " dictated");
    });
    expect(getEditorText(editor)).toBe("existing text dictated");
  });

  it("does not duplicate committed words when whisper emits a rolling transcript", async () => {
    const editor = renderPlugin();
    await act(async () => {
      editor.dispatchCommand(START_DICTATION_ANCHOR_COMMAND, undefined);
      editor.dispatchCommand(COMMIT_DICTATION_COMMAND, "hello");
      editor.dispatchCommand(INSERT_DICTATION_PARTIAL_COMMAND, "hello world");
      editor.dispatchCommand(COMMIT_DICTATION_COMMAND, "hello world");
    });
    expect(getEditorText(editor)).toBe("hello world");
  });
});
