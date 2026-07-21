export function getWikiRootPath(publicMode: boolean) {
  return publicMode ? "/wiki" : "/interface/inet-search";
}

export function getWikiSearchPath(publicMode: boolean, search = "") {
  const base = publicMode ? "/wiki/search" : "/interface/inet-search";
  return search ? `${base}?${search.replace(/^\?/, "")}` : base;
}

export function getWikiArticlePath(publicMode: boolean, articleId: string) {
  const encodedId = encodeURIComponent(articleId);
  return publicMode ? `/wiki/page/${encodedId}` : `/interface/inet-page/${encodedId}`;
}

export function getAuthenticatedPath(publicMode: boolean, path: string) {
  return publicMode ? "/" : path;
}
