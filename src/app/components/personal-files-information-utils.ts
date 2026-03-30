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

function isValidInfoSubTabColor(value: string) {
  if (!value.trim()) return true;
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim());
}

export function sanitizeInfoSubTabRecord(
  raw: Partial<InfoSubTab> | null | undefined,
  index: number,
): InfoSubTab {
  const sortMode = raw?.sortMode;
  return {
    id:
      typeof raw?.id === "string" && raw.id.trim()
        ? raw.id.trim()
        : `ist-recovered-${index}`,
    name:
      typeof raw?.name === "string" && raw.name.trim()
        ? raw.name.trim()
        : `Sub-Tab ${index + 1}`,
    order: Number.isFinite(raw?.order as number) ? Number(raw?.order) : index,
    description: typeof raw?.description === "string" ? raw.description.trim() : "",
    icon: typeof raw?.icon === "string" ? raw.icon.trim() : "",
    color:
      typeof raw?.color === "string" && isValidInfoSubTabColor(raw.color)
        ? raw.color.trim()
        : "",
    isDefault: !!raw?.isDefault,
    sortMode:
      sortMode === "title" ||
      sortMode === "category" ||
      sortMode === "newest" ||
      sortMode === "oldest"
        ? sortMode
        : "custom",
    showEmpty: !!raw?.showEmpty,
  };
}

export function sanitizeInfoSubTabsForLoad(
  rawTabs: Partial<InfoSubTab>[] | null | undefined,
) {
  const seenIds = new Set<string>();
  const sanitized = (Array.isArray(rawTabs) ? rawTabs : [])
    .map((tab, index) => sanitizeInfoSubTabRecord(tab, index))
    .filter((tab) => {
      if (seenIds.has(tab.id)) return false;
      seenIds.add(tab.id);
      return true;
    });

  const normalized = sanitized
    .sort((a, b) => a.order - b.order)
    .map((tab, index) => ({ ...tab, order: index }));

  let foundDefault = false;
  const withSingleDefault = normalized.map((tab, index) => {
    if (tab.isDefault && !foundDefault) {
      foundDefault = true;
      return { ...tab, order: index, isDefault: true };
    }
    return { ...tab, order: index, isDefault: false };
  });

  if (withSingleDefault.length > 0 && !withSingleDefault.some((tab) => tab.isDefault)) {
    withSingleDefault[0] = { ...withSingleDefault[0], isDefault: true };
  }

  return withSingleDefault;
}

export function normalizeInfosForInfoSubTabs<T extends { infoSubTab?: string }>(
  infos: T[],
  infoSubTabs: InfoSubTab[],
) {
  const validIds = new Set(infoSubTabs.map((tab) => tab.id));
  return infos.map((info) => {
    if (!info.infoSubTab) return info;
    if (validIds.has(info.infoSubTab)) return info;
    return { ...info, infoSubTab: "" };
  });
}
