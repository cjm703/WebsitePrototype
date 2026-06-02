export type WikiPanelPlacement = "body" | "sidebar";
export type WikiPanelWidth = "full" | "half";
export type WikiPanelMediaPosition = "top" | "left" | "right";

export interface WikiPanelLayoutFields {
  placement?: WikiPanelPlacement;
  width?: WikiPanelWidth;
  mediaUrl?: string;
  mediaCaption?: string;
  mediaAlt?: string;
  mediaPosition?: WikiPanelMediaPosition;
}

type PanelLike = {
  id: string;
  assignedTo?: string[];
  subtitle?: string;
  style?: string;
} & WikiPanelLayoutFields;

export function getWikiPanelPlacement(panel: WikiPanelLayoutFields | null | undefined): WikiPanelPlacement {
  return panel?.placement === "sidebar" ? "sidebar" : "body";
}

export function getWikiPanelWidth(panel: WikiPanelLayoutFields | null | undefined): WikiPanelWidth {
  if (getWikiPanelPlacement(panel) === "sidebar") {
    return "full";
  }
  return panel?.width === "half" ? "half" : "full";
}

export function getWikiPanelMediaPosition(panel: WikiPanelLayoutFields | null | undefined): WikiPanelMediaPosition {
  if (panel?.mediaPosition === "left" || panel?.mediaPosition === "right") {
    return panel.mediaPosition;
  }
  return "top";
}

export function normalizeWikiPanel<T extends PanelLike>(panel: T): T & Required<WikiPanelLayoutFields> & {
  assignedTo: string[];
  subtitle: string;
  style: string;
} {
  return {
    ...panel,
    assignedTo: Array.isArray(panel.assignedTo) ? panel.assignedTo : [],
    subtitle: panel.subtitle || "",
    style: panel.style || "blank",
    placement: getWikiPanelPlacement(panel),
    width: getWikiPanelWidth(panel),
    mediaUrl: panel.mediaUrl || "",
    mediaCaption: panel.mediaCaption || "",
    mediaAlt: panel.mediaAlt || "",
    mediaPosition: getWikiPanelMediaPosition(panel),
  };
}

export function normalizeWikiPanels<T extends PanelLike>(panels: T[] | null | undefined): Array<T & Required<WikiPanelLayoutFields> & {
  assignedTo: string[];
  subtitle: string;
  style: string;
}> {
  return (panels || []).map((panel) => normalizeWikiPanel(panel));
}

export function groupBodyPanelsIntoRows<T extends WikiPanelLayoutFields>(panels: T[]): T[][] {
  const rows: T[][] = [];
  let pendingHalf: T | null = null;

  panels.forEach((panel) => {
    if (getWikiPanelPlacement(panel) !== "body") {
      return;
    }

    if (getWikiPanelWidth(panel) === "half") {
      if (pendingHalf) {
        rows.push([pendingHalf, panel]);
        pendingHalf = null;
      } else {
        pendingHalf = panel;
      }
      return;
    }

    if (pendingHalf) {
      rows.push([pendingHalf]);
      pendingHalf = null;
    }
    rows.push([panel]);
  });

  if (pendingHalf) {
    rows.push([pendingHalf]);
  }

  return rows;
}
