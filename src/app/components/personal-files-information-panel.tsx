import React, { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
} from "lucide-react";
import { retro } from "./retro-styles";
import { RenderFormattedText } from "./render-text";
import { firstColor, type PlayerTheme } from "./player-theme";
import { renderInfoDisplayMode } from "./personal-files-information-renderers";
import {
  INFO_UNASSIGNED_FILTER,
  type InfoSubTab,
} from "./personal-files-information-utils";

export type InfoFollowUp = {
  id?: string;
  title?: string;
  content?: string;
  description?: string;
};

export type ManagedInfoLike = {
  id: string;
  title: string;
  description?: string;
  category?: string;
  content?: string;
  realWorldTime?: string;
  inWorldTime?: string;
  infoSubTab?: string;
  followUps?: InfoFollowUp[];
  displayMode?: "digital" | "paper" | "item:stone_tablet";
  displayData?: {
    variant?: string;
    alignment?: "left" | "center";
    futurePaperOverlayMode?: "none" | "pixel_handwriting";
    digitalTextColor?: string;
    digitalGlowIntensity?: "low" | "medium" | "high";
    digitalTypewriter?: boolean;
    digitalBackgroundColor?: string;
    digitalTypewriterSpeed?: number;
    paperJaggedness?: number;
    paperExtraPages?: number;
    paperEdgeTexture?: number;
    stoneTextureIntensity?: number;
  };
};

type RetroLike = {
  sunken: string;
  raised: string;
};

type Props = {
  theme: PlayerTheme;
  playerInfos: ManagedInfoLike[];
  infoSubTabs: InfoSubTab[];
  retroOverrides?: RetroLike;
};

type TreeNode =
  | {
      id: string;
      type: "folder";
      name: string;
      children: TreeNode[];
      depth: number;
      color?: string;
      description?: string;
      parentId?: string;
    }
  | {
      id: string;
      type: "paper";
      name: string;
      paper: ManagedInfoLike;
      depth: number;
      parentId?: string;
    };

const SEARCH_INPUT_STYLE: React.CSSProperties = {
  border: "1px solid rgba(124, 124, 185, 0.35)",
  background: "rgba(12, 12, 30, 0.92)",
};

function normalizeLabel(value: string | undefined | null) {
  return String(value || "").trim();
}

function splitCategoryPath(category?: string) {
  const raw = normalizeLabel(category);
  if (!raw) return [];
  return raw
    .split(/(?:\/|\\|>|::|\|)/g)
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeSearch(value: string) {
  return value.trim().toLowerCase();
}

function paperTimestamp(info: ManagedInfoLike) {
  return normalizeLabel(info.realWorldTime) || normalizeLabel(info.inWorldTime);
}

function comparePapers(a: ManagedInfoLike, b: ManagedInfoLike) {
  const aTime = paperTimestamp(a);
  const bTime = paperTimestamp(b);

  if (aTime && bTime && aTime !== bTime) {
    return bTime.localeCompare(aTime);
  }

  return a.title.localeCompare(b.title);
}

function buildTree(playerInfos: ManagedInfoLike[], infoSubTabs: InfoSubTab[]): TreeNode[] {
  const sortedTabs = [...infoSubTabs]
    .filter((tab) => tab && typeof tab.id === "string" && typeof tab.name === "string")
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const validTabIds = new Set(sortedTabs.map((tab) => tab.id));
  const infosByTab = new Map<string, ManagedInfoLike[]>();

  for (const info of playerInfos) {
    const tabKey =
      info.infoSubTab && validTabIds.has(info.infoSubTab)
        ? info.infoSubTab
        : INFO_UNASSIGNED_FILTER;

    if (!infosByTab.has(tabKey)) infosByTab.set(tabKey, []);
    infosByTab.get(tabKey)!.push(info);
  }

  const roots: TreeNode[] = [];

  const addFolderBranch = (
    folderRoot: Extract<TreeNode, { type: "folder" }>,
    info: ManagedInfoLike,
  ) => {
    const categoryParts = splitCategoryPath(info.category);
    let currentFolder = folderRoot;

    for (const part of categoryParts) {
      let existing = currentFolder.children.find(
        (child): child is Extract<TreeNode, { type: "folder" }> =>
          child.type === "folder" && child.name === part,
      );

      if (!existing) {
        existing = {
          id: `${currentFolder.id}/folder/${part.toLowerCase().replace(/\s+/g, "-")}`,
          type: "folder",
          name: part,
          children: [],
          depth: currentFolder.depth + 1,
          parentId: currentFolder.id,
        };
        currentFolder.children.push(existing);
      }

      currentFolder = existing;
    }

    currentFolder.children.push({
      id: `paper:${info.id}`,
      type: "paper",
      name: info.title,
      paper: info,
      depth: currentFolder.depth + 1,
      parentId: currentFolder.id,
    });
  };

  for (const tab of sortedTabs) {
    const rootFolder: Extract<TreeNode, { type: "folder" }> = {
      id: `tab:${tab.id}`,
      type: "folder",
      name: tab.name,
      children: [],
      depth: 0,
      color: tab.color || undefined,
      description: tab.description || undefined,
    };

    const infos = [...(infosByTab.get(tab.id) || [])].sort(comparePapers);
    for (const info of infos) {
      addFolderBranch(rootFolder, info);
    }

    roots.push(rootFolder);
  }

  const unassignedInfos = [...(infosByTab.get(INFO_UNASSIGNED_FILTER) || [])].sort(comparePapers);
  if (unassignedInfos.length > 0) {
    const unassignedRoot: Extract<TreeNode, { type: "folder" }> = {
      id: `tab:${INFO_UNASSIGNED_FILTER}`,
      type: "folder",
      name: "Unassigned",
      children: [],
      depth: 0,
      color: "#FFCC66",
      description: "Information that has not been assigned to a main category yet.",
    };

    for (const info of unassignedInfos) {
      addFolderBranch(unassignedRoot, info);
    }

    roots.push(unassignedRoot);
  }

  const sortFolders = (node: Extract<TreeNode, { type: "folder" }>) => {
    node.children.sort((a, b) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
      if (a.type === "folder" && b.type === "folder") return a.name.localeCompare(b.name);
      if (a.type === "paper" && b.type === "paper") return comparePapers(a.paper, b.paper);
      return 0;
    });

    for (const child of node.children) {
      if (child.type === "folder") sortFolders(child);
    }
  };

  for (const root of roots) {
    if (root.type === "folder") sortFolders(root);
  }

  return roots;
}

function collectAllFolderIds(nodes: TreeNode[], bucket = new Set<string>()) {
  for (const node of nodes) {
    if (node.type === "folder") {
      bucket.add(node.id);
      collectAllFolderIds(node.children, bucket);
    }
  }
  return bucket;
}

function collectAllPapers(nodes: TreeNode[], bucket: ManagedInfoLike[] = []) {
  for (const node of nodes) {
    if (node.type === "paper") {
      bucket.push(node.paper);
    } else {
      collectAllPapers(node.children, bucket);
    }
  }
  return bucket;
}

function filterTree(nodes: TreeNode[], searchTerm: string): TreeNode[] {
  if (!searchTerm) return nodes;

  const filtered: TreeNode[] = [];

  for (const node of nodes) {
    const selfMatch = normalizeSearch(node.name).includes(searchTerm);

    if (node.type === "paper") {
      if (selfMatch) filtered.push(node);
      continue;
    }

    const filteredChildren = filterTree(node.children, searchTerm);
    if (selfMatch || filteredChildren.length > 0) {
      filtered.push({
        ...node,
        children: selfMatch ? node.children : filteredChildren,
      });
    }
  }

  return filtered;
}

function collectBreadcrumbs(
  roots: TreeNode[],
  paperId: string,
): Array<{ id: string; name: string; type: "folder" | "paper" }> {
  const walk = (
    nodes: TreeNode[],
    trail: Array<{ id: string; name: string; type: "folder" | "paper" }>,
  ): Array<{ id: string; name: string; type: "folder" | "paper" }> | null => {
    for (const node of nodes) {
      const nextTrail = [...trail, { id: node.id, name: node.name, type: node.type }];
      if (node.type === "paper" && node.paper.id === paperId) return nextTrail;
      if (node.type === "folder") {
        const result = walk(node.children, nextTrail);
        if (result) return result;
      }
    }
    return null;
  };

  return walk(roots, []) || [];
}

function findPaperById(nodes: TreeNode[], paperId: string | null): ManagedInfoLike | null {
  if (!paperId) return null;
  for (const node of nodes) {
    if (node.type === "paper" && node.paper.id === paperId) return node.paper;
    if (node.type === "folder") {
      const found = findPaperById(node.children, paperId);
      if (found) return found;
    }
  }
  return null;
}

function firstVisiblePaper(nodes: TreeNode[]) {
  for (const node of nodes) {
    if (node.type === "paper") return node.paper;
    if (node.type === "folder") {
      const found = firstVisiblePaper(node.children);
      if (found) return found;
    }
  }
  return null;
}

export function PersonalFilesInformationPanel({
  theme,
  playerInfos,
  infoSubTabs,
  retroOverrides,
}: Props) {
  const ui = retroOverrides || retro;
  const [searchValue, setSearchValue] = useState("");
  const [selectedPaperId, setSelectedPaperId] = useState<string | null>(null);
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set());
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const treeRoots = useMemo(
    () => buildTree(playerInfos, infoSubTabs),
    [playerInfos, infoSubTabs],
  );

  const searchTerm = normalizeSearch(searchValue);

  const visibleTree = useMemo(
    () => filterTree(treeRoots, searchTerm),
    [treeRoots, searchTerm],
  );

  const autoExpandedIds = useMemo(
    () => (searchTerm ? collectAllFolderIds(visibleTree) : new Set<string>()),
    [visibleTree, searchTerm],
  );

  useEffect(() => {
    if (searchTerm) return;
    setExpandedFolderIds((prev) => {
      if (prev.size > 0) return prev;
      const defaults = new Set<string>();
      for (const node of treeRoots) {
        if (node.type === "folder") defaults.add(node.id);
      }
      return defaults;
    });
  }, [treeRoots, searchTerm]);

  useEffect(() => {
    const visiblePaper = findPaperById(visibleTree, selectedPaperId);
    if (visiblePaper) return;

    const fallbackPaper = firstVisiblePaper(visibleTree);
    setSelectedPaperId(fallbackPaper?.id ?? null);
  }, [visibleTree, selectedPaperId]);

  const selectedPaper = useMemo(
    () => findPaperById(treeRoots, selectedPaperId),
    [treeRoots, selectedPaperId],
  );

  const breadcrumbs = useMemo(
    () => collectBreadcrumbs(treeRoots, selectedPaperId || ""),
    [treeRoots, selectedPaperId],
  );

  const visiblePaperCount = useMemo(
    () => collectAllPapers(visibleTree).length,
    [visibleTree],
  );

  const toggleFolder = (folderId: string) => {
    if (searchTerm) return;
    setExpandedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  const renderTree = (nodes: TreeNode[]) => {
    return nodes.map((node) => {
      if (node.type === "folder") {
        const isExpanded = searchTerm
          ? autoExpandedIds.has(node.id)
          : expandedFolderIds.has(node.id);
        const folderColor = node.color || theme.labelColor;

        return (
          <div key={node.id}>
            <button
              type="button"
              onClick={() => toggleFolder(node.id)}
              className="w-full flex items-center gap-1.5 px-2 py-1.5 text-left text-[11px] rounded transition-colors"
              style={{
                color: folderColor,
                background: "transparent",
                paddingLeft: `${8 + node.depth * 14}px`,
              }}
            >
              {isExpanded ? (
                <ChevronDown size={12} />
              ) : (
                <ChevronRight size={12} />
              )}
              {isExpanded ? <FolderOpen size={12} /> : <Folder size={12} />}
              <span className="truncate">{node.name}</span>
            </button>

            {isExpanded && node.children.length > 0 && (
              <div>{renderTree(node.children)}</div>
            )}
          </div>
        );
      }

      const isSelected = selectedPaperId === node.paper.id;
      return (
        <button
          key={node.id}
          type="button"
          onClick={() => setSelectedPaperId(node.paper.id)}
          className={`w-full text-left px-2 py-1.5 text-[11px] rounded transition-colors ${
            isSelected ? ui.sunken : ""
          }`}
          style={{
            color: isSelected ? firstColor(theme.accentColor) : theme.textColor,
            background: isSelected ? theme.panelBg : "transparent",
            paddingLeft: `${8 + node.depth * 14}px`,
          }}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <FileText size={12} />
            <span className="truncate">{node.name}</span>
          </div>
        </button>
      );
    });
  };

  return (
    <div
      className="rounded border overflow-hidden min-h-[68vh] h-[72vh] flex flex-col"
      style={{
        borderColor: theme.panelBorder,
        background: theme.cardBg,
      }}
    >
      <div className="flex-1 grid min-h-0" style={{ gridTemplateColumns: isSidebarCollapsed ? "42px minmax(0,1fr)" : "220px minmax(0,1fr)" }}>
        <aside
          className="border-r min-h-0 flex flex-col"
          style={{
            borderColor: theme.panelBorder,
            background: theme.panelBg,
          }}
        >
          <div
            className="flex items-center gap-2 px-2 py-1.5 border-b"
            style={{ borderColor: theme.panelBorder }}
          >
            <button
              type="button"
              onClick={() => setIsSidebarCollapsed((prev) => !prev)}
              className={`${ui.raised} h-6 w-6 shrink-0 flex items-center justify-center`}
              style={{ color: theme.labelColor }}
              title={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {isSidebarCollapsed ? <PanelLeftOpen size={12} /> : <PanelLeftClose size={12} />}
            </button>

            {!isSidebarCollapsed && (
              <>
                <div className="relative flex-1">
                  <Search
                    size={11}
                    className="absolute left-2 top-1/2 -translate-y-1/2"
                    style={{ color: theme.labelColor }}
                  />
                  <input
                    value={searchValue}
                    onChange={(e) => setSearchValue(e.target.value)}
                    placeholder="Search..."
                    className="w-full pl-6 pr-2 py-1 text-[10px] outline-none"
                    style={{
                      ...SEARCH_INPUT_STYLE,
                      color: theme.textColor,
                    }}
                  />
                </div>
                <div className="text-[10px] shrink-0" style={{ color: theme.labelColor }}>
                  {visiblePaperCount}
                </div>
              </>
            )}
          </div>

          <div className="flex-1 overflow-auto">
            {!isSidebarCollapsed ? (
              <div className="p-2 space-y-1">
                {visibleTree.length > 0 ? (
                  renderTree(visibleTree)
                ) : (
                  <div
                    className="px-2 py-3 text-[11px]"
                    style={{ color: theme.labelColor }}
                  >
                    No categories or papers match your search.
                  </div>
                )}
              </div>
            ) : (
              <div className="py-2 flex flex-col items-center gap-2">
                {visibleTree
                  .filter((node) => node.type === "folder")
                  .map((node) => (
                    <button
                      key={node.id}
                      type="button"
                      onClick={() => setIsSidebarCollapsed(false)}
                      className={`${ui.raised} h-7 w-7 flex items-center justify-center`}
                      style={{ color: node.type === "folder" ? node.color || theme.labelColor : theme.labelColor }}
                      title={node.name}
                    >
                      <Folder size={13} />
                    </button>
                  ))}
              </div>
            )}
          </div>
        </aside>

        <section className="min-w-0 min-h-0 p-3">
          {selectedPaper ? (
            <div
              className={`${ui.sunken} h-full flex flex-col overflow-hidden`}
              style={{
                background: "#07070d",
                borderColor: theme.panelBorder,
              }}
            >
              <div
                className="px-4 py-3 border-b"
                style={{ borderColor: theme.panelBorder }}
              >
                <div
                  className="flex flex-wrap gap-1 text-[10px] mb-2"
                  style={{ color: theme.labelColor }}
                >
                  {breadcrumbs.map((crumb, index) => (
                    <React.Fragment key={crumb.id}>
                      <span>{crumb.name}</span>
                      {index < breadcrumbs.length - 1 ? <span>/</span> : null}
                    </React.Fragment>
                  ))}
                </div>

                <h2
                  className="text-[16px] font-semibold"
                  style={{ color: theme.textColor }}
                >
                  {selectedPaper.title}
                </h2>

                <div
                  className="mt-2 flex flex-wrap gap-3 text-[10px]"
                  style={{ color: theme.labelColor }}
                >
                  {selectedPaper.category ? (
                    <span>Category: {selectedPaper.category}</span>
                  ) : null}
                  {selectedPaper.inWorldTime ? (
                    <span>In-World: {selectedPaper.inWorldTime}</span>
                  ) : null}
                  {selectedPaper.realWorldTime ? (
                    <span>Real: {selectedPaper.realWorldTime}</span>
                  ) : null}
                </div>
              </div>

              {renderInfoDisplayMode(selectedPaper, {
                theme,
                info: selectedPaper,
                accentColor: firstColor(theme.accentColor),
              })}
            </div>
          ) : (
            <div
              className={`${ui.sunken} h-full flex items-center justify-center px-6 text-center`}
              style={{
                color: theme.labelColor,
                background: "#000000",
                borderColor: theme.panelBorder,
              }}
            >
              Select a paper from the left sidebar to read it.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default PersonalFilesInformationPanel;
