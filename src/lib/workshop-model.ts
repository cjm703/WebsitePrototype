export type WorkshopBuildStatus = "draft" | "building" | "completed" | "scrapped";
export type WorkshopEffectKind = "stat" | "dice" | "rule";
export type WorkshopEffectMode = "add" | "set" | "grant";
export type WorkshopFirearmFrameType = "receiver" | "pistol" | "revolver" | "shotgun" | "rifle" | "automatic";

export interface WorkshopEffect {
  id: string;
  label: string;
  kind: WorkshopEffectKind;
  key: string;
  mode: WorkshopEffectMode;
  value: number;
  text: string;
  applyWhenEquipped: boolean;
}

export interface WorkshopSlotDefinition {
  id: string;
  group: string;
  label: string;
  description: string;
  required: boolean;
  acceptedCategories: string[];
  acceptedTags: string[];
}

export interface WorkshopBlueprint {
  id: string;
  name: string;
  category: string;
  description: string;
  basePrice: number;
  rebuildFee: number;
  outputType: string;
  outputRarity: string;
  outputTags: string[];
  equipSlots: string[];
  slots: WorkshopSlotDefinition[];
  active: boolean;
  version: number;
}

export interface WorkshopComponent {
  id: string;
  name: string;
  category: string;
  description: string;
  price: number;
  orderable: boolean;
  tags: string[];
  effects: WorkshopEffect[];
  active: boolean;
}

export interface WorkshopAssignment {
  slotId: string;
  componentId: string;
}

export interface WorkshopManifestEntry extends WorkshopAssignment {
  source: "ordered" | "owned";
  pricePaid: number;
}

export interface WorkshopBuild {
  id: string;
  playerId: string;
  blueprintId: string;
  blueprintVersion: number;
  name: string;
  designation: string;
  notes: string;
  status: WorkshopBuildStatus;
  isRebuild: boolean;
  assignments: WorkshopAssignment[];
  manifest: WorkshopManifestEntry[];
  rebuildManifest: WorkshopManifestEntry[];
  storageReservation: Record<string, number>;
  outputItemId: string;
  quotedCost: number;
  revision: number;
  createdAt: string;
  updatedAt: string;
  submittedAt: string;
  completedAt: string;
  completedBy: string;
  scrappedAt: string;
}

export interface WorkshopAccess {
  playerId: string;
  enabled: boolean;
  blueprintIds: string[];
  updatedAt: string;
  updatedBy: string;
}

export interface WorkshopStorage {
  playerId: string;
  quantities: Record<string, number>;
  updatedAt: string;
}

export interface WorkshopSalvageRecipe {
  id: string;
  name: string;
  itemId: string;
  itemTag: string;
  components: Array<{ componentId: string; quantity: number }>;
  active: boolean;
}

export interface WorkshopLedgerEntry {
  id: string;
  playerId: string;
  buildId: string;
  action: "submitted" | "completed" | "rebuild-started" | "scrapped" | "storage-adjusted";
  amount: number;
  detail: string;
  createdAt: string;
  createdBy: string;
}

export interface WorkshopBootstrap {
  enabled: boolean;
  access: WorkshopAccess;
  blueprints: WorkshopBlueprint[];
  components: WorkshopComponent[];
  builds: WorkshopBuild[];
  storage: WorkshopStorage;
  personalFunds: number;
  salvageRecipes: WorkshopSalvageRecipe[];
}

const text = (value: unknown, fallback = "", max = 500) => typeof value === "string" ? value.slice(0, max) : fallback;
const number = (value: unknown, fallback = 0, min = 0, max = 1_000_000_000) => {
  const parsed = Number(value);
  return Math.min(max, Math.max(min, Number.isFinite(parsed) ? Math.round(parsed) : fallback));
};
const strings = (value: unknown, max = 40) => Array.isArray(value)
  ? Array.from(new Set(value.map((entry) => text(entry, "", 100).trim()).filter(Boolean))).slice(0, max)
  : [];
const id = (value: unknown, fallback: string) => text(value, fallback, 120).trim() || fallback;

export function createWorkshopId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeWorkshopEffect(raw: unknown, index = 0): WorkshopEffect {
  const source = raw && typeof raw === "object" ? raw as Partial<WorkshopEffect> : {};
  const kind: WorkshopEffectKind = ["stat", "dice", "rule"].includes(String(source.kind)) ? source.kind as WorkshopEffectKind : "rule";
  const mode: WorkshopEffectMode = ["add", "set", "grant"].includes(String(source.mode)) ? source.mode as WorkshopEffectMode : "grant";
  return {
    id: id(source.id, `effect-${index + 1}`),
    label: text(source.label, `Effect ${index + 1}`, 100).trim() || `Effect ${index + 1}`,
    kind,
    key: text(source.key, "", 100).trim(),
    mode,
    value: number(source.value, 0, -1_000_000, 1_000_000),
    text: text(source.text, "", 500),
    applyWhenEquipped: source.applyWhenEquipped === true,
  };
}

export function normalizeWorkshopSlot(raw: unknown, index = 0): WorkshopSlotDefinition {
  const source = raw && typeof raw === "object" ? raw as Partial<WorkshopSlotDefinition> : {};
  return {
    id: id(source.id, `slot-${index + 1}`),
    group: text(source.group, "GENERAL", 80).trim() || "GENERAL",
    label: text(source.label, `Slot ${index + 1}`, 100).trim() || `Slot ${index + 1}`,
    description: text(source.description, "", 500),
    required: source.required !== false,
    acceptedCategories: strings(source.acceptedCategories, 20),
    acceptedTags: strings(source.acceptedTags, 30),
  };
}

export function normalizeWorkshopBlueprint(raw: unknown, index = 0): WorkshopBlueprint {
  const source = raw && typeof raw === "object" ? raw as Partial<WorkshopBlueprint> : {};
  return {
    id: id(source.id, `blueprint-${index + 1}`),
    name: text(source.name, `Blueprint ${index + 1}`, 120).trim() || `Blueprint ${index + 1}`,
    category: text(source.category, "General", 80).trim() || "General",
    description: text(source.description, "", 1200),
    basePrice: number(source.basePrice),
    rebuildFee: number(source.rebuildFee),
    outputType: text(source.outputType, "Equipment", 80).trim() || "Equipment",
    outputRarity: text(source.outputRarity, "Custom", 40).trim() || "Custom",
    outputTags: strings(source.outputTags),
    equipSlots: strings(source.equipSlots, 20),
    slots: Array.isArray(source.slots) ? source.slots.slice(0, 80).map(normalizeWorkshopSlot) : [],
    active: source.active !== false,
    version: Math.max(1, number(source.version, 1, 1, 100000)),
  };
}

export function normalizeWorkshopComponent(raw: unknown, index = 0): WorkshopComponent {
  const source = raw && typeof raw === "object" ? raw as Partial<WorkshopComponent> : {};
  return {
    id: id(source.id, `component-${index + 1}`),
    name: text(source.name, `Component ${index + 1}`, 120).trim() || `Component ${index + 1}`,
    category: text(source.category, "General", 80).trim() || "General",
    description: text(source.description, "", 1000),
    price: number(source.price),
    orderable: source.orderable !== false,
    tags: strings(source.tags),
    effects: Array.isArray(source.effects) ? source.effects.slice(0, 40).map(normalizeWorkshopEffect) : [],
    active: source.active !== false,
  };
}

export function normalizeWorkshopBuild(raw: unknown, index = 0): WorkshopBuild {
  const source = raw && typeof raw === "object" ? raw as Partial<WorkshopBuild> : {};
  const status: WorkshopBuildStatus = ["draft", "building", "completed", "scrapped"].includes(String(source.status)) ? source.status as WorkshopBuildStatus : "draft";
  const assignments = Array.isArray(source.assignments) ? source.assignments.slice(0, 100).flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const assignment = entry as Partial<WorkshopAssignment>;
    const slotId = id(assignment.slotId, "");
    const componentId = id(assignment.componentId, "");
    return slotId && componentId ? [{ slotId, componentId }] : [];
  }) : [];
  const manifest = Array.isArray(source.manifest) ? source.manifest.slice(0, 100).flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Partial<WorkshopManifestEntry>;
    const slotId = id(item.slotId, "");
    const componentId = id(item.componentId, "");
    return slotId && componentId ? [{ slotId, componentId, source: item.source === "owned" ? "owned" as const : "ordered" as const, pricePaid: number(item.pricePaid) }] : [];
  }) : [];
  const rebuildManifest = Array.isArray(source.rebuildManifest) ? source.rebuildManifest.slice(0, 100).flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Partial<WorkshopManifestEntry>;
    const slotId = id(item.slotId, "");
    const componentId = id(item.componentId, "");
    return slotId && componentId ? [{ slotId, componentId, source: item.source === "owned" ? "owned" as const : "ordered" as const, pricePaid: number(item.pricePaid) }] : [];
  }) : [];
  const storageReservation: Record<string, number> = {};
  if (source.storageReservation && typeof source.storageReservation === "object") Object.entries(source.storageReservation).slice(0, 500).forEach(([key, value]) => { const clean = id(key, ""); if (clean) storageReservation[clean] = number(value, 0, 0, 100000); });
  return {
    id: id(source.id, `build-${index + 1}`),
    playerId: id(source.playerId, ""),
    blueprintId: id(source.blueprintId, ""),
    blueprintVersion: Math.max(1, number(source.blueprintVersion, 1, 1, 100000)),
    name: text(source.name, "Untitled Build", 120).trim() || "Untitled Build",
    designation: text(source.designation, "", 160),
    notes: text(source.notes, "", 1200),
    status,
    isRebuild: source.isRebuild === true,
    assignments,
    manifest,
    rebuildManifest,
    storageReservation,
    outputItemId: id(source.outputItemId, ""),
    quotedCost: number(source.quotedCost),
    revision: number(source.revision, 0, 0, 1_000_000),
    createdAt: text(source.createdAt, "", 80),
    updatedAt: text(source.updatedAt, "", 80),
    submittedAt: text(source.submittedAt, "", 80),
    completedAt: text(source.completedAt, "", 80),
    completedBy: id(source.completedBy, ""),
    scrappedAt: text(source.scrappedAt, "", 80),
  };
}

export function normalizeWorkshopAccess(raw: unknown, playerId = ""): WorkshopAccess {
  const source = raw && typeof raw === "object" ? raw as Partial<WorkshopAccess> : {};
  return { playerId: id(source.playerId, playerId), enabled: source.enabled === true, blueprintIds: strings(source.blueprintIds, 200), updatedAt: text(source.updatedAt, "", 80), updatedBy: id(source.updatedBy, "") };
}

export function normalizeWorkshopStorage(raw: unknown, playerId = ""): WorkshopStorage {
  const source = raw && typeof raw === "object" ? raw as Partial<WorkshopStorage> : {};
  const quantities: Record<string, number> = {};
  if (source.quantities && typeof source.quantities === "object") Object.entries(source.quantities).slice(0, 500).forEach(([key, value]) => { const clean = id(key, ""); if (clean) quantities[clean] = number(value, 0, 0, 100000); });
  return { playerId: id(source.playerId, playerId), quantities, updatedAt: text(source.updatedAt, "", 80) };
}

export function normalizeWorkshopSalvageRecipe(raw: unknown, index = 0): WorkshopSalvageRecipe {
  const source = raw && typeof raw === "object" ? raw as Partial<WorkshopSalvageRecipe> : {};
  return {
    id: id(source.id, `salvage-${index + 1}`), name: text(source.name, `Salvage Recipe ${index + 1}`, 120), itemId: id(source.itemId, ""), itemTag: text(source.itemTag, "Scrappable", 100), active: source.active !== false,
    components: Array.isArray(source.components) ? source.components.slice(0, 100).flatMap((entry) => entry && typeof entry === "object" && id((entry as any).componentId, "") ? [{ componentId: id((entry as any).componentId, ""), quantity: number((entry as any).quantity, 1, 1, 10000) }] : []) : [],
  };
}

export function isWorkshopComponentCompatible(slot: WorkshopSlotDefinition, component: WorkshopComponent) {
  const categoryFits = slot.acceptedCategories.length === 0 || slot.acceptedCategories.includes(component.category);
  const tagsFit = slot.acceptedTags.length === 0 || component.tags.some((tag) => slot.acceptedTags.includes(tag));
  return component.active && categoryFits && tagsFit;
}

export function workshopFirearmFrameType(component: Pick<WorkshopComponent, "name" | "tags"> | null | undefined): WorkshopFirearmFrameType {
  if (!component) return "receiver";
  const identity = `${component.name} ${component.tags.join(" ")}`.toLowerCase();
  if (/(automatic|auto[- ]?loading|machine|smg|carbine)/.test(identity)) return "automatic";
  if (identity.includes("shotgun")) return "shotgun";
  if (identity.includes("revolver")) return "revolver";
  if (identity.includes("rifle")) return "rifle";
  if (identity.includes("pistol") || identity.includes("handgun")) return "pistol";
  return "receiver";
}

export function workshopAssignments(build: WorkshopBuild) {
  return new Map(build.assignments.map((assignment) => [assignment.slotId, assignment.componentId]));
}

export function workshopBuildReadiness(build: WorkshopBuild, blueprint: WorkshopBlueprint, components: WorkshopComponent[]) {
  const assignments = workshopAssignments(build);
  const componentsById = new Map(components.map((component) => [component.id, component]));
  const missing = blueprint.slots.filter((slot) => slot.required && !assignments.get(slot.id)).map((slot) => slot.label);
  const incompatible = blueprint.slots.flatMap((slot) => {
    const componentId = assignments.get(slot.id);
    const component = componentId ? componentsById.get(componentId) : null;
    return componentId && (!component || !isWorkshopComponentCompatible(slot, component)) ? [slot.label] : [];
  });
  return { ready: missing.length === 0 && incompatible.length === 0, missing, incompatible };
}

export function calculateWorkshopQuote(build: WorkshopBuild, blueprint: WorkshopBlueprint, components: WorkshopComponent[], storage: WorkshopStorage, rebuilding = build.isRebuild) {
  const available = { ...storage.quantities };
  const componentMap = new Map(components.map((component) => [component.id, component]));
  let orderedParts = 0;
  let ownedParts = 0;
  let componentCost = 0;
  const unavailable: string[] = [];
  const storageReservation: Record<string, number> = {};
  const manifest: WorkshopManifestEntry[] = [];
  build.assignments.forEach((assignment) => {
    const component = componentMap.get(assignment.componentId);
    if (!component) return;
    if ((available[component.id] || 0) > 0) {
      available[component.id] -= 1;
      ownedParts += 1;
      storageReservation[component.id] = (storageReservation[component.id] || 0) + 1;
      manifest.push({ ...assignment, source: "owned", pricePaid: 0 });
    } else if (component.orderable) {
      orderedParts += 1;
      componentCost += component.price;
      manifest.push({ ...assignment, source: "ordered", pricePaid: component.price });
    } else {
      unavailable.push(component.name);
    }
  });
  const baseCost = rebuilding ? blueprint.rebuildFee : blueprint.basePrice;
  return { baseCost, componentCost, totalCost: baseCost + componentCost, orderedParts, ownedParts, manifest, unavailable, storageReservation };
}

function effect(idValue: string, label: string, kind: WorkshopEffectKind, key: string, value: number, textValue: string, equipped = false): WorkshopEffect {
  return { id: idValue, label, kind, key, mode: kind === "rule" ? "grant" : "add", value, text: textValue, applyWhenEquipped: equipped };
}

function slot(idValue: string, group: string, label: string, required: boolean, acceptedCategories: string[]): WorkshopSlotDefinition {
  return { id: idValue, group, label, required, acceptedCategories, acceptedTags: [], description: "" };
}

function component(idValue: string, name: string, category: string, price: number, orderable: boolean, tags: string[], effects: WorkshopEffect[], description = "Starter Workshop component."): WorkshopComponent {
  return normalizeWorkshopComponent({ id: idValue, name, category, price, orderable, tags, effects, description });
}

export const STARTER_WORKSHOP_BLUEPRINTS: WorkshopBlueprint[] = [
  normalizeWorkshopBlueprint({
    id: "blueprint-humanoid-robot", name: "Humanoid Robot", category: "Robotics", description: "A configurable humanoid construct with core, limb, auxiliary, and exterior systems.", basePrice: 2500, rebuildFee: 300, outputType: "Construct", outputRarity: "Custom", outputTags: ["Workshop Built", "Scrappable", "Robot"],
    slots: [
      slot("robot-head", "CORE SLOTS", "Head Slot", true, ["Sensor", "Interface"]), slot("robot-ai", "CORE SLOTS", "AI Slot", true, ["Artificial Identity"]), slot("robot-core", "CORE SLOTS", "Core Slot", true, ["Reactor"]), slot("robot-chest", "CORE SLOTS", "Chest System Slot", true, ["Robot Chassis"]),
      slot("robot-left-arm", "LIMB SLOTS", "Left Arm Slot", true, ["Robot Arm"]), slot("robot-right-arm", "LIMB SLOTS", "Right Arm Slot", true, ["Robot Arm"]), slot("robot-left-leg", "LIMB SLOTS", "Left Leg Slot", true, ["Robot Leg"]), slot("robot-right-leg", "LIMB SLOTS", "Right Leg Slot", true, ["Robot Leg"]),
      slot("robot-back", "AUXILIARY SLOTS", "Back Slot", false, ["Robot Auxiliary"]), slot("robot-shoulder-left", "AUXILIARY SLOTS", "Left Shoulder Slot", false, ["Robot Auxiliary"]), slot("robot-shoulder-right", "AUXILIARY SLOTS", "Right Shoulder Slot", false, ["Robot Auxiliary"]), slot("robot-aux-chest", "AUXILIARY SLOTS", "Auxiliary Chest Slot", false, ["Robot Auxiliary"]), slot("robot-hip-left", "AUXILIARY SLOTS", "Left Hip Slot", false, ["Robot Auxiliary"]), slot("robot-hip-right", "AUXILIARY SLOTS", "Right Hip Slot", false, ["Robot Auxiliary"]),
      slot("robot-plating", "EXTERIOR PLATING", "Exterior Plating", true, ["Plating"]),
    ],
  }),
  normalizeWorkshopBlueprint({
    id: "blueprint-modular-firearm", name: "Modular Firearm", category: "Weapons", description: "A configurable firearm assembled around a compatible frame, ammunition, and barrel.", basePrice: 500, rebuildFee: 75, outputType: "Weapon", outputRarity: "Custom", outputTags: ["Workshop Built", "Scrappable", "Equipped"], equipSlots: ["weapon_r", "weapon_l"],
    slots: [
      slot("gun-frame", "REQUIRED ASSEMBLY", "Frame / Receiver", true, ["Firearm Frame"]), slot("gun-ammo", "REQUIRED ASSEMBLY", "Ammunition", true, ["Ammunition"]), slot("gun-barrel", "REQUIRED ASSEMBLY", "Barrel", true, ["Firearm Barrel"]),
      slot("gun-stock", "HANDLING", "Stock / Grip", false, ["Firearm Stock"]), slot("gun-sight", "OPTICS", "Sight", false, ["Firearm Sight"]), slot("gun-muzzle", "ATTACHMENTS", "Muzzle Attachment", false, ["Firearm Attachment"]), slot("gun-underbarrel", "ATTACHMENTS", "Underbarrel Attachment", false, ["Firearm Attachment"]), slot("gun-side", "ATTACHMENTS", "Side Attachment", false, ["Firearm Attachment"]),
    ],
  }),
];

export const STARTER_WORKSHOP_COMPONENTS: WorkshopComponent[] = [
  component("component-basic-head", "Professionally Crafted Basic Head", "Sensor", 350, true, ["sensor", "interface"], [effect("basic-head-rule", "Basic Sensor Suite", "rule", "", 0, "Standard visual and auditory sensors.")]),
  component("component-rapture-ai", "Rapture Combat and Assistance Artificial Identity Chip", "Artificial Identity", 1800, true, ["ai", "combat", "assistance"], [effect("rapture-ai-rule", "Combat and Assistance Identity", "rule", "", 0, "Provides a distinct personality, combat guidance, and assistance routines.")]),
  component("component-rapture-reactor", "Rapture Mana Reactor", "Reactor", 2400, true, ["mana", "rapture", "power"], [effect("reactor-power", "Mana Power", "stat", "Power", 12, "Generates twelve units of magical power.")]),
  component("component-basic-chest", "Professionally Crafted Basic Chassis", "Robot Chassis", 600, true, ["humanoid", "basic"], [effect("chassis-armor", "Chassis Armor", "stat", "Armor", 2, "+2 Armor")]),
  component("component-basic-arm", "Professionally Crafted Basic Arm", "Robot Arm", 300, true, ["humanoid", "weapon-capable"], [effect("arm-rule", "Weapon Manipulator", "rule", "", 0, "Can equip ordinary weapons and firearms.")]),
  component("component-basic-leg", "Professionally Crafted Basic Leg", "Robot Leg", 280, true, ["humanoid", "mobility"], [effect("leg-speed", "Mobility", "stat", "Speed", 2, "+2 Speed")]),
  component("component-heavy-chest-mount", "Augmented Large Firearm Mount", "Robot Auxiliary", 900, true, ["chest", "heavy-firearm"], [effect("mount-rule", "Large Firearm Mount", "rule", "", 0, "Supports a large chest-mounted firearm.")]),
  component("component-steel-plating", "Steel Exterior Plating", "Plating", 700, true, ["steel", "armor"], [effect("steel-armor", "Steel Plating", "stat", "Armor", 4, "+4 Armor")]),
  component("component-pistol-frame", "Balanced Pistol Frame", "Firearm Frame", 300, true, ["9mm", "pistol"], [effect("frame-accuracy", "Balanced Frame", "stat", "Accuracy", 1, "+1 Accuracy", true)]),
  component("component-revolver-frame", "Service Revolver Frame", "Firearm Frame", 360, true, ["revolver", "handgun", ".357", "frame:revolver"], [effect("revolver-frame-rule", "Revolver Configuration", "rule", "", 0, "Configures the weapon as a durable cylinder-fed revolver.", true)]),
  component("component-shotgun-frame", "Tactical Shotgun Frame", "Firearm Frame", 550, true, ["shotgun", "12-gauge", "frame:shotgun"], [effect("shotgun-frame-rule", "Shotgun Configuration", "rule", "", 0, "Configures the weapon as a close-range shotgun platform.", true)]),
  component("component-rifle-frame", "Precision Rifle Frame", "Firearm Frame", 650, true, ["rifle", "longarm", "frame:rifle"], [effect("rifle-frame-rule", "Rifle Configuration", "rule", "", 0, "Configures the weapon as a stable long-range rifle platform.", true)]),
  component("component-automatic-frame", "Automatic Carbine Frame", "Firearm Frame", 800, true, ["automatic", "carbine", "rifle", "frame:automatic"], [effect("automatic-frame-rule", "Automatic Configuration", "rule", "", 0, "Configures the weapon as a magazine-fed automatic carbine.", true)]),
  component("component-9mm-ammo", "9mm Ammunition System", "Ammunition", 80, true, ["9mm"], [effect("ammo-damage", "9mm Damage", "dice", "Damage", 0, "1d10 piercing", true)]),
  component("component-abyss-incendiary-ammo", "Abyss Fabricator - Incendiary Magazine", "Ammunition", 0, true, ["abyss-fabricator", "universal", "incendiary", "red", "30-round"], [effect("abyss-incendiary-rule", "Incendiary Rounds", "rule", "", 0, "Changes the weapon's damage type to fire and deals an additional 1d8 fire damage on hit.", true)], "A free 30-round magazine produced by the matte-black Abyss Fabricator's red setting."),
  component("component-abyss-cryo-ammo", "Abyss Fabricator - Cryo Magazine", "Ammunition", 0, true, ["abyss-fabricator", "universal", "cryo", "blue", "30-round"], [effect("abyss-cryo-rule", "Cryo Rounds", "rule", "", 0, "On hit, the target makes a Constitution save against DC 10 + proficiency bonus + Constitution modifier. Failure halves speed until the end of its next turn; a target already slowed this way is frozen on another failed save.", true)], "A free 30-round magazine produced by the matte-black Abyss Fabricator's blue setting."),
  component("component-abyss-toxic-ammo", "Abyss Fabricator - Toxic Magazine", "Ammunition", 0, true, ["abyss-fabricator", "universal", "toxic", "green", "30-round"], [effect("abyss-toxic-rule", "Toxic Rounds", "rule", "", 0, "On hit, the target makes a Constitution save or is Poisoned for 1 minute and takes 1d6 poison damage at the start of each turn. The damage stacks, and the save repeats at the end of each turn.", true)], "A free 30-round magazine produced by the matte-black Abyss Fabricator's green setting."),
  component("component-abyss-concussive-ammo", "Abyss Fabricator - Concussive Magazine", "Ammunition", 0, true, ["abyss-fabricator", "universal", "concussive", "yellow", "30-round"], [effect("abyss-concussive-rule", "Concussive Rounds", "rule", "", 0, "On hit, the target gains 1 Stagger Potential. Each point raises the base 50% health threshold for triggering the campaign's stagger effect by 5%.", true)], "A free 30-round magazine produced by the matte-black Abyss Fabricator's yellow setting."),
  component("component-abyss-gravitic-ammo", "Abyss Fabricator - Gravitic Magazine", "Ammunition", 0, true, ["abyss-fabricator", "universal", "gravitic", "purple", "30-round"], [effect("abyss-gravitic-rule", "Gravitic Rounds", "rule", "", 0, "On hit, the target makes an Agility save against DC 10 + proficiency bonus + Dexterity modifier or is pushed 15 feet in a chosen direction and knocked prone.", true)], "A free 30-round magazine produced by the matte-black Abyss Fabricator's purple setting."),
  component("component-abyss-echo-ammo", "Abyss Fabricator - Echo Magazine", "Ammunition", 0, true, ["abyss-fabricator", "universal", "echo", "white", "30-round"], [effect("abyss-echo-rule", "Echo Rounds", "rule", "", 0, "On hit, the projectile rebounds to a second target within 15 feet. Make a separate attack roll; on a hit, it deals full damage including modifiers.", true)], "A free 30-round magazine produced by the matte-black Abyss Fabricator's white setting."),
  component("component-9mm-barrel", "Standard 9mm Barrel", "Firearm Barrel", 220, true, ["9mm"], [effect("barrel-range", "Standard Barrel", "stat", "Range", 30, "+30 ft range", true)]),
  component("component-tactical-stock", "Tactical Folding Stock", "Firearm Stock", 180, true, ["pistol", "rifle"], [effect("stock-accuracy", "Braced Fire", "stat", "Accuracy", 1, "+1 Accuracy while braced", true)]),
  component("component-reflex-sight", "Reflex Sight", "Firearm Sight", 240, true, ["optic", "rail"], [effect("sight-accuracy", "Reflex Sight", "stat", "Accuracy", 1, "+1 Accuracy", true)]),
  component("component-suppressor", "Sound Suppressor", "Firearm Attachment", 320, true, ["muzzle", "9mm"], [effect("suppressor-rule", "Suppressed", "rule", "", 0, "Greatly reduces the sound of firing.", true)]),
];

export const SAINT_GREGORY_SAMPLE: WorkshopBuild = normalizeWorkshopBuild({
  id: "sample-saint-gregory", playerId: "", blueprintId: "blueprint-humanoid-robot", blueprintVersion: 1, name: "Saint Gregory", designation: "Saint Gregory", status: "completed", revision: 1,
  assignments: [
    ["robot-head", "component-basic-head"], ["robot-ai", "component-rapture-ai"], ["robot-core", "component-rapture-reactor"], ["robot-chest", "component-basic-chest"], ["robot-left-arm", "component-basic-arm"], ["robot-right-arm", "component-basic-arm"], ["robot-left-leg", "component-basic-leg"], ["robot-right-leg", "component-basic-leg"], ["robot-aux-chest", "component-heavy-chest-mount"], ["robot-plating", "component-steel-plating"],
  ].map(([slotId, componentId]) => ({ slotId, componentId })),
});
