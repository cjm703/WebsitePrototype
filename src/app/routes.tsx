import React from "react";
import { createBrowserRouter } from "react-router";
import { RootLayout } from "./components/root-layout";
import { LoginPage } from "./components/login-page";
import { RequireDMRoute } from "./components/require-dm-route";
import { RouteErrorPage } from "./components/route-error-page";
import { importWithStaleChunkRecovery } from "@/lib/lazy-module";

function lazyRoute<TModule>(
  importer: () => Promise<TModule>,
  component: (loadedModule: TModule) => React.ComponentType,
) {
  return async () => {
    const loadedModule = await importWithStaleChunkRecovery(importer);
    return { Component: component(loadedModule) };
  };
}

const interfaceChildren = [
  { index: true, lazy: lazyRoute(() => import("./components/intelli-interface"), (module) => module.IntelliInterface) },
  { path: "inet-search", lazy: lazyRoute(() => import("./components/inet-search"), (module) => module.InetSearch) },
  { path: "search-results", lazy: lazyRoute(() => import("./components/inet-search"), (module) => module.InetSearch) },
  { path: "inet-news", lazy: lazyRoute(() => import("./components/inet-news"), (module) => module.InetNews) },
  { path: "inet-page/:id", lazy: lazyRoute(() => import("./components/inet-page"), (module) => module.InetPage) },
  { path: "personal-files", lazy: lazyRoute(() => import("./components/personal-files"), (module) => module.PersonalFiles) },
  { path: "combat", lazy: lazyRoute(() => import("./components/combat-page"), (module) => module.CombatPage) },
  { path: "nexus-nomad", lazy: lazyRoute(() => import("./components/nexus-nomad"), (module) => module.NexusNomad) },
  { path: "nexus-nomad/facility/:facilityId/map", lazy: lazyRoute(() => import("./components/facility-map-page"), (module) => module.FacilityMapPage) },
  { path: "intelli-maps", lazy: lazyRoute(() => import("./components/intelli-maps"), (module) => module.IntelliMaps) },
  { path: "game", lazy: lazyRoute(() => import("./components/game"), (module) => module.Game) },
  { path: "customization", lazy: lazyRoute(() => import("./components/customization-page"), (module) => module.CustomizationPage) },
  { path: "community", lazy: lazyRoute(() => import("./components/community-page"), (module) => module.CommunityPage) },
  { path: "commerce", lazy: lazyRoute(() => import("./components/commerce-page"), (module) => module.CommercePage) },
  { path: "calendar", lazy: lazyRoute(() => import("./components/calendar-page"), (module) => module.CalendarPage) },
  { path: "session-log", lazy: lazyRoute(() => import("./components/session-log"), (module) => module.SessionLog) },
  { path: "campaign-timeline", lazy: lazyRoute(() => import("./components/campaign-timeline"), (module) => module.CampaignTimeline) },
  {
    Component: RequireDMRoute,
    children: [
      { path: "dm-area", lazy: lazyRoute(() => import("./components/dm-area"), (module) => module.DMArea) },
      { path: "wiki-studio", lazy: lazyRoute(() => import("./components/wiki-studio"), (module) => module.WikiStudio) },
      { path: "wiki-editor/new", lazy: lazyRoute(() => import("./components/wiki-editor"), (module) => module.WikiEditor) },
      { path: "wiki-editor/:id", lazy: lazyRoute(() => import("./components/wiki-editor"), (module) => module.WikiEditor) },
      { path: "wiki-graph", lazy: lazyRoute(() => import("./components/wiki-graph"), (module) => module.WikiGraph) },
    ],
  },
];

export const router = createBrowserRouter([
  {
    path: "/",
    Component: LoginPage,
    HydrateFallback: LoginPage,
    errorElement: <RouteErrorPage />,
  },
  {
    path: "/wiki",
    lazy: lazyRoute(() => import("./components/inet-search"), (module) => module.PublicInetSearch),
    errorElement: <RouteErrorPage />,
  },
  {
    path: "/wiki/search",
    lazy: lazyRoute(() => import("./components/inet-search"), (module) => module.PublicInetSearch),
    errorElement: <RouteErrorPage />,
  },
  {
    path: "/wiki/page/:id",
    lazy: lazyRoute(() => import("./components/inet-page"), (module) => module.PublicInetPage),
    errorElement: <RouteErrorPage />,
  },
  {
    path: "/interface",
    Component: RootLayout,
    HydrateFallback: RootLayout,
    errorElement: <RouteErrorPage />,
    children: [...interfaceChildren],
  },
]);
