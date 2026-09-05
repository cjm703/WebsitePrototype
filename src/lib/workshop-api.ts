import { sessionApiFetch } from "./api-client";
import type {
  WorkshopAccess,
  WorkshopBlueprint,
  WorkshopBootstrap,
  WorkshopBuild,
  WorkshopComponent,
  WorkshopSalvageRecipe,
  WorkshopStorage,
} from "./workshop-model";

export interface WorkshopAdminBootstrap extends WorkshopBootstrap {
  players: Array<{ id: string; name: string }>;
  accessRows: WorkshopAccess[];
  storageRows: WorkshopStorage[];
  ledger: Array<Record<string, unknown>>;
  sampleBuild: WorkshopBuild;
}

const normalizeWorkshopCredits = <T extends Record<string, unknown>>(body: T) => ({
  ...body,
  credits: Math.max(0, Math.round(Number(body.credits ?? body.personalFunds) || 0)),
});

export const loadWorkshopBootstrap = async () => normalizeWorkshopCredits(
  await sessionApiFetch("/workshop/bootstrap", { method: "GET" }),
) as WorkshopBootstrap;
export const loadWorkshopAdminBootstrap = async () => normalizeWorkshopCredits(
  await sessionApiFetch("/workshop/admin/bootstrap", { method: "GET" }),
) as WorkshopAdminBootstrap;

export const saveWorkshopBlueprint = (blueprint: WorkshopBlueprint) => sessionApiFetch("/workshop/admin/blueprint/save", { method: "POST", body: JSON.stringify({ blueprint }) });
export const saveWorkshopComponent = (component: WorkshopComponent) => sessionApiFetch("/workshop/admin/component/save", { method: "POST", body: JSON.stringify({ component }) });
export const saveWorkshopSalvageRecipe = (recipe: WorkshopSalvageRecipe) => sessionApiFetch("/workshop/admin/salvage/save", { method: "POST", body: JSON.stringify({ recipe }) });
export const updateWorkshopAccess = (playerId: string, enabled: boolean, blueprintIds: string[]) => sessionApiFetch("/workshop/admin/access", { method: "POST", body: JSON.stringify({ playerId, enabled, blueprintIds }) });
export const updateWorkshopStorage = (playerId: string, componentId: string, delta: number) => sessionApiFetch("/workshop/admin/storage", { method: "POST", body: JSON.stringify({ playerId, componentId, delta }) });

export const saveWorkshopBuild = (build: WorkshopBuild, expectedRevision: number) => sessionApiFetch("/workshop/build/save", { method: "POST", body: JSON.stringify({ build, expectedRevision }) }) as Promise<{ build: WorkshopBuild }>;
export const deleteWorkshopDraft = (buildId: string, expectedRevision: number) => sessionApiFetch("/workshop/build/delete-draft", { method: "POST", body: JSON.stringify({ buildId, expectedRevision }) }) as Promise<{ ok: true; buildId: string }>;
export const submitWorkshopBuild = (buildId: string, expectedRevision: number) => sessionApiFetch("/workshop/build/submit", { method: "POST", body: JSON.stringify({ buildId, expectedRevision }) }) as Promise<{ build: WorkshopBuild }>;
export const completeWorkshopBuild = (buildId: string, expectedRevision: number) => sessionApiFetch("/workshop/admin/build/complete", { method: "POST", body: JSON.stringify({ buildId, expectedRevision }) });
export const rebuildWorkshopBuild = (buildId: string, expectedRevision: number) => sessionApiFetch("/workshop/build/rebuild", { method: "POST", body: JSON.stringify({ buildId, expectedRevision }) });
export const scrapWorkshopBuild = (buildId: string, expectedRevision: number) => sessionApiFetch("/workshop/build/scrap", { method: "POST", body: JSON.stringify({ buildId, expectedRevision }) });
export const scrapWorkshopItem = (itemId: string) => sessionApiFetch("/workshop/item/scrap", { method: "POST", body: JSON.stringify({ itemId }) });
