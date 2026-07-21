import React from "react";
import { createBrowserRouter } from "react-router";
import { RootLayout } from "./components/root-layout";
import { LoginPage } from "./components/login-page";

const interfaceChildren = [
  { index: true, lazy: () => import("./components/intelli-interface").then(m => ({ Component: m.IntelliInterface })) },
  { path: "inet-search", lazy: () => import("./components/inet-search").then(m => ({ Component: m.InetSearch })) },
  { path: "search-results", lazy: () => import("./components/inet-search").then(m => ({ Component: m.InetSearch })) },
  { path: "inet-news", lazy: () => import("./components/inet-news").then(m => ({ Component: m.InetNews })) },
  { path: "inet-page/:id", lazy: () => import("./components/inet-page").then(m => ({ Component: m.InetPage })) },
  { path: "personal-files", lazy: () => import("./components/personal-files").then(m => ({ Component: m.PersonalFiles })) },
  { path: "combat", lazy: () => import("./components/combat-page").then(m => ({ Component: m.CombatPage })) },
  { path: "nexus-nomad", lazy: () => import("./components/nexus-nomad").then(m => ({ Component: m.NexusNomad })) },
  { path: "intelli-maps", lazy: () => import("./components/intelli-maps").then(m => ({ Component: m.IntelliMaps })) },
  { path: "dm-area", lazy: () => import("./components/dm-area").then(m => ({ Component: m.DMArea })) },
  { path: "game", lazy: () => import("./components/game").then(m => ({ Component: m.Game })) },
  { path: "customization", lazy: () => import("./components/customization-page").then(m => ({ Component: m.CustomizationPage })) },
  { path: "community", lazy: () => import("./components/community-page").then(m => ({ Component: m.CommunityPage })) },
  { path: "commerce", lazy: () => import("./components/commerce-page").then(m => ({ Component: m.CommercePage })) },
  { path: "calendar", lazy: () => import("./components/calendar-page").then(m => ({ Component: m.CalendarPage })) },
  { path: "wiki-studio", lazy: () => import("./components/wiki-studio").then(m => ({ Component: m.WikiStudio })) },
  { path: "wiki-editor/new", lazy: () => import("./components/wiki-editor").then(m => ({ Component: m.WikiEditor })) },
  { path: "wiki-editor/:id", lazy: () => import("./components/wiki-editor").then(m => ({ Component: m.WikiEditor })) },
  { path: "wiki-graph", lazy: () => import("./components/wiki-graph").then(m => ({ Component: m.WikiGraph })) },
  { path: "session-log", lazy: () => import("./components/session-log").then(m => ({ Component: m.SessionLog })) },
  { path: "campaign-timeline", lazy: () => import("./components/campaign-timeline").then(m => ({ Component: m.CampaignTimeline })) },
];

export const router = createBrowserRouter([
  {
    path: "/",
    Component: LoginPage,
    HydrateFallback: LoginPage,
  },
  {
    path: "/wiki",
    lazy: () => import("./components/inet-search").then(m => ({ Component: m.PublicInetSearch })),
  },
  {
    path: "/wiki/search",
    lazy: () => import("./components/inet-search").then(m => ({ Component: m.PublicInetSearch })),
  },
  {
    path: "/wiki/page/:id",
    lazy: () => import("./components/inet-page").then(m => ({ Component: m.PublicInetPage })),
  },
  {
    path: "/interface",
    Component: RootLayout,
    HydrateFallback: RootLayout,
    children: [...interfaceChildren],
  },
]);
