import React, { useMemo } from "react";
import { retro } from "./retro-styles";
import { RenderFormattedText } from "./render-text";
import { firstColor, type PlayerTheme } from "./player-theme";

export const INFO_UNASSIGNED_FILTER = "__unassigned__" as const;

export type InfoSortMode = "custom" | "title" | "category" | "newest" | "oldest";

export type InfoSubTab = {
  id: string;
  name: string;
  order: number;
  description?: string;
  icon?: string;
  color?: string;
  isDefault?: boolean;
  sortMode?: InfoSortMode;
  showEmpty?: boolean;
};

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
};

type RetroLike = {
  sunken: string;
  raised: string;
};

type Props = {
  theme: PlayerTheme;
  playerInfos: ManagedInfoLike[];
  infoSubTabs: InfoSubTab[];
  infoSubTabFilter: string | null;
  setInfoSubTabFilter: (value: string | null) => void;
  expandedInfoId: string | null;
  setExpandedInfoId: (value: string | null) => void;
  infoSortBy?: "title" | "category" | "newest" | "oldest";
  infoCategoryFilter?: string | null;
  retroOverrides?: RetroLike;
};

function getNormalizedTimestamp(info: ManagedInfoLike) {
  return (info.realWorldTime || info.inWorldTime || "").trim();
}

function getSortMode(
  activeSubTab: InfoSubTab | null,
  fallback: Props["infoSortBy"],
): "title" | "category" | "newest" | "oldest" {
  if (activeSubTab?.sortMode === "title") return "title";
  if (activeSubTab?.sortMode === "category") return "category";
  if (activeSubTab?.sortMode === "oldest") return "oldest";
  if (activeSubTab?.sortMode === "newest") return "newest";
  return fallback || "newest";
}

export function PersonalFilesInformationPanel({
  theme,
  playerInfos,
  infoSubTabs,
  infoSubTabFilter,
  setInfoSubTabFilter,
  expandedInfoId,
  setExpandedInfoId,
  infoSortBy = "newest",
  infoCategoryFilter = null,
  retroOverrides,
}: Props) {
  const ui = retroOverrides || retro;

  const sortedSubTabs = useMemo(
    () =>
      [...infoSubTabs]
        .filter((tab) => tab && typeof tab.id === "string" && typeof tab.name === "string")
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [infoSubTabs],
  );

  const validSubTabIds = useMemo(
    () => new Set(sortedSubTabs.map((tab) => tab.id)),
    [sortedSubTabs],
  );

  const infoCountsBySubTab = useMemo(() => {
    return playerInfos.reduce<Record<string, number>>((acc, info) => {
      const normalizedSubTab =
        info.infoSubTab && validSubTabIds.has(info.infoSubTab)
          ? info.infoSubTab
          : INFO_UNASSIGNED_FILTER;

      const categoryOk =
        !infoCategoryFilter || (info.category || "").trim() === infoCategoryFilter;

      if (!categoryOk) return acc;

      acc[normalizedSubTab] = (acc[normalizedSubTab] || 0) + 1;
      return acc;
    }, {});
  }, [playerInfos, validSubTabIds, infoCategoryFilter]);

  const visibleSubTabs = useMemo(() => {
    return sortedSubTabs.filter(
      (tab) => !!tab.showEmpty || (infoCountsBySubTab[tab.id] || 0) > 0,
    );
  }, [sortedSubTabs, infoCountsBySubTab]);

  const activeSubTab = useMemo(() => {
    if (!infoSubTabFilter || infoSubTabFilter === INFO_UNASSIGNED_FILTER) return null;
    return sortedSubTabs.find((tab) => tab.id === infoSubTabFilter) ?? null;
  }, [infoSubTabFilter, sortedSubTabs]);

  const activeSortMode = getSortMode(activeSubTab, infoSortBy);

  const filteredInfos = useMemo(() => {
    return [...playerInfos]
      .filter((info) => {
        const normalizedSubTab =
          info.infoSubTab && validSubTabIds.has(info.infoSubTab)
            ? info.infoSubTab
            : "";

        const matchesCategory =
          !infoCategoryFilter || (info.category || "").trim() === infoCategoryFilter;
        if (!matchesCategory) return false;

        if (!infoSubTabFilter) return true;
        if (infoSubTabFilter === INFO_UNASSIGNED_FILTER) return !normalizedSubTab;
        return normalizedSubTab === infoSubTabFilter;
      })
      .sort((a, b) => {
        if (activeSortMode === "title") return a.title.localeCompare(b.title);
        if (activeSortMode === "category") {
          return (a.category || "").localeCompare(b.category || "");
        }

        const aTime = getNormalizedTimestamp(a);
        const bTime = getNormalizedTimestamp(b);

        if (activeSortMode === "oldest") return aTime.localeCompare(bTime);
        return bTime.localeCompare(aTime);
      });
  }, [
    activeSortMode,
    infoCategoryFilter,
    infoSubTabFilter,
    playerInfos,
    validSubTabIds,
  ]);

  const hasUnassignedInfos = (infoCountsBySubTab[INFO_UNASSIGNED_FILTER] || 0) > 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[12px] font-semibold" style={{ color: theme.textColor }}>
          Information
        </h3>
        <div className="text-[10px]" style={{ color: theme.labelColor }}>
          {filteredInfos.length} entr{filteredInfos.length !== 1 ? "ies" : "y"}
        </div>
      </div>

      {(sortedSubTabs.length > 0 || hasUnassignedInfos) && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setInfoSubTabFilter(null)}
            className={`${!infoSubTabFilter ? ui.sunken : ui.raised + " hover:bg-[#1E1E58]"} px-2.5 py-1 text-[10px] transition-colors`}
            style={{
              color: !infoSubTabFilter ? firstColor(theme.accentColor) : theme.labelColor,
              fontWeight: !infoSubTabFilter ? 600 : 400,
              background: !infoSubTabFilter ? theme.panelBg : theme.cardBg,
            }}
          >
            All
          </button>

          {visibleSubTabs.map((st) => (
            <button
              key={st.id}
              onClick={() => setInfoSubTabFilter(st.id)}
              className={`${infoSubTabFilter === st.id ? ui.sunken : ui.raised + " hover:bg-[#1E1E58]"} px-2.5 py-1 text-[10px] transition-colors`}
              style={{
                color:
                  infoSubTabFilter === st.id
                    ? st.color || firstColor(theme.accentColor)
                    : st.color || theme.labelColor,
                fontWeight: infoSubTabFilter === st.id ? 600 : 400,
                background: infoSubTabFilter === st.id ? theme.panelBg : theme.cardBg,
                borderColor: st.color || theme.panelBorder,
              }}
            >
              {st.icon ? <span className="mr-1">{st.icon}</span> : null}
              {st.name} ({infoCountsBySubTab[st.id] || 0})
            </button>
          ))}

          {hasUnassignedInfos && (
            <button
              onClick={() => setInfoSubTabFilter(INFO_UNASSIGNED_FILTER)}
              className={`${infoSubTabFilter === INFO_UNASSIGNED_FILTER ? ui.sunken : ui.raised + " hover:bg-[#1E1E58]"} px-2.5 py-1 text-[10px] transition-colors`}
              style={{
                color:
                  infoSubTabFilter === INFO_UNASSIGNED_FILTER
                    ? "#FFCC66"
                    : theme.labelColor,
                fontWeight: infoSubTabFilter === INFO_UNASSIGNED_FILTER ? 600 : 400,
                background:
                  infoSubTabFilter === INFO_UNASSIGNED_FILTER
                    ? theme.panelBg
                    : theme.cardBg,
              }}
            >
              Unassigned ({infoCountsBySubTab[INFO_UNASSIGNED_FILTER] || 0})
            </button>
          )}
        </div>
      )}

      {(activeSubTab?.description ||
        (activeSubTab?.sortMode && activeSubTab.sortMode !== "custom") ||
        infoSubTabFilter === INFO_UNASSIGNED_FILTER) && (
        <div
          className="text-[10px] px-2 py-1 rounded border"
          style={{
            color:
              activeSubTab?.color || (infoSubTabFilter === INFO_UNASSIGNED_FILTER
                ? "#FFCC66"
                : theme.labelColor),
            borderColor: theme.panelBorder,
            background: theme.cardBg,
          }}
        >
          {infoSubTabFilter === INFO_UNASSIGNED_FILTER ? (
            <span>Entries that have not been assigned to an Information sub-tab yet.</span>
          ) : (
            <>
              {activeSubTab?.description ? <span>{activeSubTab.description}</span> : null}
              {activeSubTab?.description &&
              activeSubTab?.sortMode &&
              activeSubTab.sortMode !== "custom" ? (
                <span className="mx-2">•</span>
              ) : null}
              {activeSubTab?.sortMode && activeSubTab.sortMode !== "custom" ? (
                <span>
                  Sorted by{" "}
                  {activeSubTab.sortMode === "title"
                    ? "title"
                    : activeSubTab.sortMode === "category"
                      ? "category"
                      : activeSubTab.sortMode === "newest"
                        ? "newest first"
                        : "oldest first"}
                </span>
              ) : null}
            </>
          )}
        </div>
      )}

      {filteredInfos.length === 0 ? (
        <div
          className="rounded border px-3 py-3 text-[11px]"
          style={{
            borderColor: theme.panelBorder,
            background: theme.cardBg,
            color: theme.labelColor,
          }}
        >
          {playerInfos.length === 0
            ? "No information has been assigned to your profile yet."
            : infoSubTabFilter === INFO_UNASSIGNED_FILTER
              ? "You do not have any unassigned information."
              : activeSubTab
                ? `No information is available in ${activeSubTab.name} right now.`
                : "No information matches the selected tab."}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredInfos.map((info) => {
            const isExpanded = expandedInfoId === info.id;

            return (
              <div
                key={info.id}
                className="rounded border overflow-hidden"
                style={{
                  borderColor: theme.panelBorder,
                  background: theme.cardBg,
                }}
              >
                <button
                  type="button"
                  onClick={() => setExpandedInfoId(isExpanded ? null : info.id)}
                  className="w-full text-left px-3 py-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div
                        className="text-[11px] font-semibold truncate"
                        style={{ color: theme.textColor }}
                      >
                        {info.title}
                      </div>

                      <div className="mt-1 flex flex-wrap gap-2 text-[10px]">
                        {(info.followUps?.length ?? 0) > 0 && (
                          <span style={{ color: theme.labelColor }}>
                            {info.followUps!.length} follow-up
                            {info.followUps!.length !== 1 ? "s" : ""}
                          </span>
                        )}

                        {infoSubTabFilter === INFO_UNASSIGNED_FILTER && (
                          <span style={{ color: "#FFCC66" }}>Unassigned</span>
                        )}

                        {info.inWorldTime ? (
                          <span style={{ color: theme.labelColor }}>
                            In-World: {info.inWorldTime}
                          </span>
                        ) : null}

                        {info.realWorldTime ? (
                          <span style={{ color: theme.labelColor }}>
                            Real: {info.realWorldTime}
                          </span>
                        ) : null}

                        {!info.realWorldTime && !info.inWorldTime && info.category ? (
                          <span style={{ color: theme.labelColor }}>
                            Category: {info.category}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="shrink-0 text-[10px]" style={{ color: theme.labelColor }}>
                      {isExpanded ? "Hide" : "Open"}
                    </div>
                  </div>
                </button>

                {isExpanded && (
                  <div
                    className="border-t px-3 py-3 space-y-3"
                    style={{ borderColor: theme.panelBorder }}
                  >
                    {info.category ? (
                      <div className="text-[10px]" style={{ color: theme.labelColor }}>
                        Category: {info.category}
                      </div>
                    ) : null}

                    {(info.description || info.content) && (
                      <div className="text-[11px]" style={{ color: theme.textColor }}>
                        <RenderFormattedText
                          text={info.content || info.description || ""}
                        />
                      </div>
                    )}

                    {(info.followUps?.length ?? 0) > 0 && (
                      <div className="space-y-2">
                        <div
                          className="text-[10px] font-semibold uppercase tracking-wide"
                          style={{ color: theme.labelColor }}
                        >
                          Follow-Ups
                        </div>

                        {info.followUps!.map((followUp, index) => (
                          <div
                            key={followUp.id || `${info.id}-followup-${index}`}
                            className="rounded border px-2.5 py-2"
                            style={{
                              borderColor: theme.panelBorder,
                              background: theme.panelBg,
                            }}
                          >
                            {followUp.title ? (
                              <div
                                className="text-[10px] font-semibold mb-1"
                                style={{ color: theme.textColor }}
                              >
                                {followUp.title}
                              </div>
                            ) : null}

                            <div
                              className="text-[11px]"
                              style={{ color: theme.textColor }}
                            >
                              <RenderFormattedText
                                text={
                                  followUp.content || followUp.description || ""
                                }
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default PersonalFilesInformationPanel;
