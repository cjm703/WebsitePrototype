export type WikiArticleVisibility = "visible" | "spoiler" | "hidden";

export interface WikiVisibilityPage {
  id: string;
  playerVisibility?: Record<string, WikiArticleVisibility>;
}

export function getWikiArticleVisibility(
  page: WikiVisibilityPage | null | undefined,
  playerId: string,
): WikiArticleVisibility {
  if (playerId === "dm") return "visible";
  const mode = playerId ? page?.playerVisibility?.[playerId] : undefined;
  return mode === "hidden" || mode === "spoiler" ? mode : "visible";
}

export function canListWikiArticle(page: WikiVisibilityPage, playerId: string) {
  return getWikiArticleVisibility(page, playerId) !== "hidden";
}

export function canExposeWikiArticle(page: WikiVisibilityPage, playerId: string) {
  return getWikiArticleVisibility(page, playerId) === "visible";
}

export function filterBrowsableWikiArticles<T extends WikiVisibilityPage>(
  pages: T[],
  playerId: string,
) {
  return playerId === "dm" ? pages : pages.filter((page) => canExposeWikiArticle(page, playerId));
}
