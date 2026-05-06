import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ROOT_WORKTREE_ID } from "../../sidebarWorktreeGrouping";
import { SidebarWorktreeGroup } from "./SidebarWorktreeGroup";

const baseNode = {
  id: ROOT_WORKTREE_ID,
  displayLabel: "main",
  worktreePath: "/repo",
  branch: "main",
  isMain: true,
  isSynthetic: false,
  threads: [],
} as const;

describe("SidebarWorktreeGroup", () => {
  it("renders displayLabel in the header button", () => {
    const html = renderToStaticMarkup(
      <SidebarWorktreeGroup node={baseNode} renderThreadRow={() => null} />,
    );
    expect(html).toContain("main");
    expect(html).toContain('aria-expanded="true"');
  });

  it("starts collapsed when initiallyOpen=false", () => {
    const html = renderToStaticMarkup(
      <SidebarWorktreeGroup node={baseNode} initiallyOpen={false} renderThreadRow={() => null} />,
    );
    expect(html).toContain('aria-expanded="false"');
    // thread list should not be rendered
    expect(html).not.toContain("<ul");
  });

  it("renders the branch badge when branch differs from displayLabel", () => {
    const node = { ...baseNode, displayLabel: "repo root", branch: "main" };
    const html = renderToStaticMarkup(
      <SidebarWorktreeGroup node={node} renderThreadRow={() => null} />,
    );
    // branch text should appear as secondary label
    const branchCount = (html.match(/main/g) ?? []).length;
    expect(branchCount).toBeGreaterThanOrEqual(1);
    expect(html).toContain("repo root");
  });

  it("renders thread count badge when threads are present", () => {
    const node = {
      ...baseNode,
      threads: [
        { id: "t1", title: "Thread 1" },
        { id: "t2", title: "Thread 2" },
      ] as any,
    };
    const html = renderToStaticMarkup(
      <SidebarWorktreeGroup node={node} renderThreadRow={() => null} />,
    );
    expect(html).toContain("2");
  });

  it("calls renderThreadRow for each thread when open", () => {
    const node = {
      ...baseNode,
      threads: [
        { id: "t1", title: "Alpha" },
        { id: "t2", title: "Beta" },
      ] as any,
    };
    const html = renderToStaticMarkup(
      <SidebarWorktreeGroup
        node={node}
        renderThreadRow={(t) => <span data-testid={`row-${t.id}`}>{t.title}</span>}
      />,
    );
    expect(html).toContain('data-testid="row-t1"');
    expect(html).toContain('data-testid="row-t2"');
    expect(html).toContain("Alpha");
    expect(html).toContain("Beta");
  });

  it("does not render thread rows when closed", () => {
    const node = {
      ...baseNode,
      threads: [{ id: "t1", title: "Alpha" }] as any,
    };
    const html = renderToStaticMarkup(
      <SidebarWorktreeGroup
        node={node}
        initiallyOpen={false}
        renderThreadRow={(t) => <span data-testid={`row-${t.id}`}>{t.title}</span>}
      />,
    );
    expect(html).not.toContain("Alpha");
  });
});
