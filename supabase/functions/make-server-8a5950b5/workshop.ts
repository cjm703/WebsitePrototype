export type WorkshopRecord = Record<string, any>;

const cleanText = (value: unknown, fallback = "", max = 1000) => typeof value === "string" ? value.slice(0, max) : fallback;
const cleanNumber = (value: unknown, fallback = 0, min = 0, max = 1_000_000_000) => {
  const parsed = Number(value);
  return Math.min(max, Math.max(min, Number.isFinite(parsed) ? Math.round(parsed) : fallback));
};
const cleanId = (value: unknown, fallback = "") => cleanText(value, fallback, 120).trim() || fallback;
const cleanStrings = (value: unknown, max = 100) => Array.isArray(value)
  ? Array.from(new Set(value.map((entry) => cleanText(entry, "", 100).trim()).filter(Boolean))).slice(0, max)
  : [];

export const workshopId = (prefix: string) => `${prefix}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

export function normalizeWorkshopEffect(raw: unknown, index = 0) {
  const source = raw && typeof raw === "object" ? raw as WorkshopRecord : {};
  return {
    id: cleanId(source.id, `effect-${index + 1}`),
    label: cleanText(source.label, `Effect ${index + 1}`, 100).trim() || `Effect ${index + 1}`,
    kind: ["stat", "dice", "rule"].includes(String(source.kind)) ? source.kind : "rule",
    key: cleanText(source.key, "", 100).trim(),
    mode: ["add", "set", "grant"].includes(String(source.mode)) ? source.mode : "grant",
    value: cleanNumber(source.value, 0, -1_000_000, 1_000_000),
    text: cleanText(source.text, "", 500),
    applyWhenEquipped: source.applyWhenEquipped === true,
  };
}

export function normalizeWorkshopSlot(raw: unknown, index = 0) {
  const source = raw && typeof raw === "object" ? raw as WorkshopRecord : {};
  return {
    id: cleanId(source.id, `slot-${index + 1}`),
    group: cleanText(source.group, "GENERAL", 80).trim() || "GENERAL",
    label: cleanText(source.label, `Slot ${index + 1}`, 100).trim() || `Slot ${index + 1}`,
    description: cleanText(source.description, "", 500),
    required: source.required !== false,
    acceptedCategories: cleanStrings(source.acceptedCategories, 20),
    acceptedTags: cleanStrings(source.acceptedTags, 30),
  };
}

export function normalizeWorkshopBlueprint(raw: unknown, index = 0) {
  const source = raw && typeof raw === "object" ? raw as WorkshopRecord : {};
  return {
    id: cleanId(source.id, `blueprint-${index + 1}`),
    name: cleanText(source.name, `Blueprint ${index + 1}`, 120).trim() || `Blueprint ${index + 1}`,
    category: cleanText(source.category, "General", 80).trim() || "General",
    description: cleanText(source.description, "", 1200),
    basePrice: cleanNumber(source.basePrice),
    rebuildFee: cleanNumber(source.rebuildFee),
    outputType: cleanText(source.outputType, "Equipment", 80).trim() || "Equipment",
    outputRarity: cleanText(source.outputRarity, "Custom", 40).trim() || "Custom",
    outputTags: cleanStrings(source.outputTags, 40),
    equipSlots: cleanStrings(source.equipSlots, 20),
    slots: Array.isArray(source.slots) ? source.slots.slice(0, 80).map(normalizeWorkshopSlot) : [],
    active: source.active !== false,
    version: Math.max(1, cleanNumber(source.version, 1, 1, 100000)),
  };
}

export function normalizeWorkshopComponent(raw: unknown, index = 0) {
  const source = raw && typeof raw === "object" ? raw as WorkshopRecord : {};
  return {
    id: cleanId(source.id, `component-${index + 1}`),
    name: cleanText(source.name, `Component ${index + 1}`, 120).trim() || `Component ${index + 1}`,
    category: cleanText(source.category, "General", 80).trim() || "General",
    description: cleanText(source.description, "", 1000),
    price: cleanNumber(source.price),
    orderable: source.orderable !== false,
    tags: cleanStrings(source.tags, 40),
    effects: Array.isArray(source.effects) ? source.effects.slice(0, 40).map(normalizeWorkshopEffect) : [],
    active: source.active !== false,
  };
}

function normalizeManifest(raw: unknown) {
  return Array.isArray(raw) ? raw.slice(0, 100).flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const source = entry as WorkshopRecord;
    const slotId = cleanId(source.slotId);
    const componentId = cleanId(source.componentId);
    return slotId && componentId ? [{ slotId, componentId, source: source.source === "owned" ? "owned" : "ordered", pricePaid: cleanNumber(source.pricePaid) }] : [];
  }) : [];
}

export function normalizeWorkshopBuild(raw: unknown, index = 0) {
  const source = raw && typeof raw === "object" ? raw as WorkshopRecord : {};
  const assignments = Array.isArray(source.assignments) ? source.assignments.slice(0, 100).flatMap((entry: unknown) => {
    if (!entry || typeof entry !== "object") return [];
    const assignment = entry as WorkshopRecord;
    const slotId = cleanId(assignment.slotId);
    const componentId = cleanId(assignment.componentId);
    return slotId && componentId ? [{ slotId, componentId }] : [];
  }) : [];
  const storageReservation: WorkshopRecord = {};
  if (source.storageReservation && typeof source.storageReservation === "object") {
    Object.entries(source.storageReservation).slice(0, 500).forEach(([key, value]) => {
      const componentId = cleanId(key);
      if (componentId) storageReservation[componentId] = cleanNumber(value, 0, 0, 100000);
    });
  }
  return {
    id: cleanId(source.id, `build-${index + 1}`),
    playerId: cleanId(source.playerId),
    blueprintId: cleanId(source.blueprintId),
    blueprintVersion: Math.max(1, cleanNumber(source.blueprintVersion, 1, 1, 100000)),
    name: cleanText(source.name, "Untitled Build", 120).trim() || "Untitled Build",
    designation: cleanText(source.designation, "", 160),
    notes: cleanText(source.notes, "", 1200),
    status: ["draft", "building", "completed", "scrapped"].includes(String(source.status)) ? source.status : "draft",
    isRebuild: source.isRebuild === true,
    assignments,
    manifest: normalizeManifest(source.manifest),
    rebuildManifest: normalizeManifest(source.rebuildManifest),
    storageReservation,
    outputItemId: cleanId(source.outputItemId),
    quotedCost: cleanNumber(source.quotedCost),
    revision: cleanNumber(source.revision, 0, 0, 1_000_000),
    createdAt: cleanText(source.createdAt, "", 80),
    updatedAt: cleanText(source.updatedAt, "", 80),
    submittedAt: cleanText(source.submittedAt, "", 80),
    completedAt: cleanText(source.completedAt, "", 80),
    completedBy: cleanId(source.completedBy),
    scrappedAt: cleanText(source.scrappedAt, "", 80),
  };
}

export function normalizeWorkshopAccess(raw: unknown, playerId = "") {
  const source = raw && typeof raw === "object" ? raw as WorkshopRecord : {};
  return { playerId: cleanId(source.playerId, playerId), enabled: source.enabled === true, blueprintIds: cleanStrings(source.blueprintIds, 200), updatedAt: cleanText(source.updatedAt, "", 80), updatedBy: cleanId(source.updatedBy) };
}

export function normalizeWorkshopStorage(raw: unknown, playerId = "") {
  const source = raw && typeof raw === "object" ? raw as WorkshopRecord : {};
  const quantities: WorkshopRecord = {};
  if (source.quantities && typeof source.quantities === "object") {
    Object.entries(source.quantities).slice(0, 500).forEach(([key, value]) => {
      const componentId = cleanId(key);
      if (componentId) quantities[componentId] = cleanNumber(value, 0, 0, 100000);
    });
  }
  return { playerId: cleanId(source.playerId, playerId), quantities, updatedAt: cleanText(source.updatedAt, "", 80) };
}

export function normalizeWorkshopRecipe(raw: unknown, index = 0) {
  const source = raw && typeof raw === "object" ? raw as WorkshopRecord : {};
  return {
    id: cleanId(source.id, `salvage-${index + 1}`),
    name: cleanText(source.name, `Salvage Recipe ${index + 1}`, 120).trim() || `Salvage Recipe ${index + 1}`,
    itemId: cleanId(source.itemId),
    itemTag: cleanText(source.itemTag, "Scrappable", 100).trim(),
    components: Array.isArray(source.components) ? source.components.slice(0, 100).flatMap((entry: unknown) => {
      if (!entry || typeof entry !== "object") return [];
      const componentId = cleanId((entry as WorkshopRecord).componentId);
      return componentId ? [{ componentId, quantity: cleanNumber((entry as WorkshopRecord).quantity, 1, 1, 10000) }] : [];
    }) : [],
    active: source.active !== false,
  };
}

export function workshopCompatible(slot: WorkshopRecord, component: WorkshopRecord) {
  const categoryFits = slot.acceptedCategories.length === 0 || slot.acceptedCategories.includes(component.category);
  const tagsFit = slot.acceptedTags.length === 0 || component.tags.some((tag: string) => slot.acceptedTags.includes(tag));
  return component.active && categoryFits && tagsFit;
}

export function workshopQuote(build: WorkshopRecord, blueprint: WorkshopRecord, components: WorkshopRecord[], storage: WorkshopRecord, reservations: WorkshopRecord = {}) {
  const componentMap = new Map(components.map((component) => [component.id, component]));
  const slotMap = new Map(blueprint.slots.map((slot: WorkshopRecord) => [slot.id, slot]));
  const assignmentMap = new Map(build.assignments.map((assignment: WorkshopRecord) => [assignment.slotId, assignment.componentId]));
  const available: WorkshopRecord = {};
  Object.entries(storage.quantities || {}).forEach(([componentId, quantity]) => {
    available[componentId] = Math.max(0, Number(quantity) - Number(reservations[componentId] || 0));
  });
  const missing = blueprint.slots.filter((slot: WorkshopRecord) => slot.required && !assignmentMap.get(slot.id)).map((slot: WorkshopRecord) => slot.label);
  const incompatible: string[] = [];
  const unavailable: string[] = [];
  const manifest: WorkshopRecord[] = [];
  const storageReservation: WorkshopRecord = {};
  let componentCost = 0;
  let orderedParts = 0;
  let ownedParts = 0;
  build.assignments.forEach((assignment: WorkshopRecord) => {
    const slot = slotMap.get(assignment.slotId);
    const component = componentMap.get(assignment.componentId);
    if (!slot || !component || !workshopCompatible(slot, component)) {
      incompatible.push(slot?.label || assignment.slotId);
      return;
    }
    if ((available[component.id] || 0) > 0) {
      available[component.id] -= 1;
      storageReservation[component.id] = (storageReservation[component.id] || 0) + 1;
      manifest.push({ ...assignment, source: "owned", pricePaid: 0 });
      ownedParts += 1;
    } else if (component.orderable) {
      manifest.push({ ...assignment, source: "ordered", pricePaid: component.price });
      componentCost += component.price;
      orderedParts += 1;
    } else {
      unavailable.push(`${component.name} (${slot.label})`);
    }
  });
  const baseCost = build.isRebuild ? blueprint.rebuildFee : blueprint.basePrice;
  return {
    ready: missing.length === 0 && incompatible.length === 0 && unavailable.length === 0,
    missing,
    incompatible: Array.from(new Set(incompatible)),
    unavailable,
    baseCost,
    componentCost,
    totalCost: baseCost + componentCost,
    orderedParts,
    ownedParts,
    manifest,
    storageReservation,
    storageDelta: Object.fromEntries(Object.entries(storageReservation).map(([componentId, quantity]) => [componentId, -Number(quantity)])),
  };
}

export function workshopComponentCounts(manifest: WorkshopRecord[]) {
  const counts: WorkshopRecord = {};
  manifest.forEach((entry) => { counts[entry.componentId] = (counts[entry.componentId] || 0) + 1; });
  return counts;
}

export function workshopFirearmFrameType(component: WorkshopRecord | null | undefined) {
  if (!component) return "receiver";
  const identity = `${component.name || ""} ${(component.tags || []).join(" ")}`.toLowerCase();
  if (/(automatic|auto[- ]?loading|machine|smg|carbine)/.test(identity)) return "automatic";
  if (identity.includes("shotgun")) return "shotgun";
  if (identity.includes("revolver")) return "revolver";
  if (identity.includes("rifle")) return "rifle";
  if (identity.includes("pistol") || identity.includes("handgun")) return "pistol";
  return "receiver";
}

function applyNativeEffect(customFields: WorkshopRecord, effect: WorkshopRecord) {
  if (!effect.applyWhenEquipped || effect.kind !== "stat" || !effect.key) return;
  const match = effect.key.match(/^(Attribute|Skill|Resource)\s*:{1,2}\s*(.+)$/i);
  if (match) {
    const prefix = match[1][0].toUpperCase() + match[1].slice(1).toLowerCase();
    customFields[`${prefix} Buff::${prefix}`] = match[2].trim();
    customFields[`${prefix} Buff::Amount`] = String(effect.value);
  } else if (effect.key.toLowerCase() === "armor") {
    customFields["Armor::AC Bonus"] = String(effect.value);
  }
}

export function workshopGeneratedItem(build: WorkshopRecord, blueprint: WorkshopRecord, components: WorkshopRecord[]) {
  const componentMap = new Map(components.map((component) => [component.id, component]));
  const componentNames = build.manifest.map((entry: WorkshopRecord) => componentMap.get(entry.componentId)?.name || entry.componentId);
  const effects = build.assignments.flatMap((assignment: WorkshopRecord) => componentMap.get(assignment.componentId)?.effects || []);
  const frameAssignment = build.assignments.find((assignment: WorkshopRecord) => assignment.slotId === "gun-frame");
  const frameType = workshopFirearmFrameType(frameAssignment ? componentMap.get(frameAssignment.componentId) : null);
  const customFields: WorkshopRecord = {
    "Workshop::Build ID": build.id,
    "Workshop::Blueprint": blueprint.name,
    "Workshop::Designation": build.designation,
    "Workshop::Components": componentNames.join(" | "),
  };
  if (frameType !== "receiver") customFields["Workshop::Firearm Type"] = frameType[0].toUpperCase() + frameType.slice(1);
  if (blueprint.equipSlots.length > 0) customFields["Equipment::Slots"] = blueprint.equipSlots.join(",");
  effects.forEach((effect: WorkshopRecord, index: number) => {
    const value = effect.kind === "stat" && effect.value ? `${effect.value > 0 ? "+" : ""}${effect.value}${effect.text ? `; ${effect.text}` : ""}` : effect.text;
    customFields[`Effect::${index}`] = `<b>${effect.label}</b>${value ? `: ${value}` : ""}`;
    applyNativeEffect(customFields, effect);
  });
  return {
    id: build.outputItemId,
    name: build.name,
    rarity: blueprint.outputRarity,
    type: blueprint.outputType,
    tags: Array.from(new Set([...blueprint.outputTags, "Workshop Built", "Scrappable", ...(frameType === "receiver" ? [] : [frameType[0].toUpperCase() + frameType.slice(1), `${frameType[0].toUpperCase() + frameType.slice(1)} Firearm`])])),
    description: [blueprint.description, build.notes].filter(Boolean).join("\n\n"),
    assignedTo: [build.playerId],
    customFields,
    locked: true,
  };
}

const effect = (id: string, label: string, kind: string, key: string, value: number, text: string, applyWhenEquipped = false) => ({ id, label, kind, key, mode: kind === "rule" ? "grant" : "add", value, text, applyWhenEquipped });
const slot = (id: string, group: string, label: string, required: boolean, acceptedCategories: string[]) => ({ id, group, label, description: "", required, acceptedCategories, acceptedTags: [] });
const component = (id: string, name: string, category: string, price: number, tags: string[], effects: WorkshopRecord[], description = "Starter Workshop component.") => normalizeWorkshopComponent({ id, name, category, price, orderable: true, tags, effects, active: true, description });

export const WORKSHOP_STARTER_BLUEPRINTS = [
  normalizeWorkshopBlueprint({
    id: "blueprint-humanoid-robot", name: "Humanoid Robot", category: "Robotics", description: "A configurable humanoid construct with core, limb, auxiliary, and exterior systems.", basePrice: 2500, rebuildFee: 300, outputType: "Construct", outputRarity: "Custom", outputTags: ["Workshop Built", "Scrappable", "Robot"], active: true, version: 1,
    slots: [
      slot("robot-head", "CORE SLOTS", "Head Slot", true, ["Sensor", "Interface"]), slot("robot-ai", "CORE SLOTS", "AI Slot", true, ["Artificial Identity"]), slot("robot-core", "CORE SLOTS", "Core Slot", true, ["Reactor"]), slot("robot-chest", "CORE SLOTS", "Chest System Slot", true, ["Robot Chassis"]),
      slot("robot-left-arm", "LIMB SLOTS", "Left Arm Slot", true, ["Robot Arm"]), slot("robot-right-arm", "LIMB SLOTS", "Right Arm Slot", true, ["Robot Arm"]), slot("robot-left-leg", "LIMB SLOTS", "Left Leg Slot", true, ["Robot Leg"]), slot("robot-right-leg", "LIMB SLOTS", "Right Leg Slot", true, ["Robot Leg"]),
      slot("robot-back", "AUXILIARY SLOTS", "Back Slot", false, ["Robot Auxiliary"]), slot("robot-shoulder-left", "AUXILIARY SLOTS", "Left Shoulder Slot", false, ["Robot Auxiliary"]), slot("robot-shoulder-right", "AUXILIARY SLOTS", "Right Shoulder Slot", false, ["Robot Auxiliary"]), slot("robot-aux-chest", "AUXILIARY SLOTS", "Auxiliary Chest Slot", false, ["Robot Auxiliary"]), slot("robot-hip-left", "AUXILIARY SLOTS", "Left Hip Slot", false, ["Robot Auxiliary"]), slot("robot-hip-right", "AUXILIARY SLOTS", "Right Hip Slot", false, ["Robot Auxiliary"]), slot("robot-plating", "EXTERIOR PLATING", "Exterior Plating", true, ["Plating"]),
    ],
  }),
  normalizeWorkshopBlueprint({
    id: "blueprint-modular-firearm", name: "Modular Firearm", category: "Weapons", description: "A firearm assembled around a compatible frame, ammunition system, barrel, and optional attachments.", basePrice: 500, rebuildFee: 75, outputType: "Weapon", outputRarity: "Custom", outputTags: ["Workshop Built", "Scrappable", "Equipped"], equipSlots: ["weapon_r", "weapon_l"], active: true, version: 1,
    slots: [slot("gun-frame", "REQUIRED ASSEMBLY", "Frame / Receiver", true, ["Firearm Frame"]), slot("gun-ammo", "REQUIRED ASSEMBLY", "Ammunition", true, ["Ammunition"]), slot("gun-barrel", "REQUIRED ASSEMBLY", "Barrel", true, ["Firearm Barrel"]), slot("gun-stock", "HANDLING", "Stock / Grip", false, ["Firearm Stock"]), slot("gun-sight", "OPTICS", "Sight", false, ["Firearm Sight"]), slot("gun-muzzle", "ATTACHMENTS", "Muzzle Attachment", false, ["Firearm Attachment"]), slot("gun-underbarrel", "ATTACHMENTS", "Underbarrel Attachment", false, ["Firearm Attachment"]), slot("gun-side", "ATTACHMENTS", "Side Attachment", false, ["Firearm Attachment"])],
  }),
];

export const WORKSHOP_STARTER_COMPONENTS = [
  component("component-basic-head", "Professionally Crafted Basic Head", "Sensor", 350, ["sensor", "interface"], [effect("basic-head-rule", "Basic Sensor Suite", "rule", "", 0, "Standard visual and auditory sensors.")]),
  component("component-rapture-ai", "Rapture Combat and Assistance Artificial Identity Chip", "Artificial Identity", 1800, ["ai", "combat", "assistance"], [effect("rapture-ai-rule", "Combat and Assistance Identity", "rule", "", 0, "Provides a distinct personality, combat guidance, and assistance routines.")]),
  component("component-rapture-reactor", "Rapture Mana Reactor", "Reactor", 2400, ["mana", "rapture", "power"], [effect("reactor-power", "Mana Power", "stat", "Power", 12, "Generates twelve units of magical power.")]),
  component("component-basic-chest", "Professionally Crafted Basic Chassis", "Robot Chassis", 600, ["humanoid", "basic"], [effect("chassis-armor", "Chassis Armor", "stat", "Armor", 2, "+2 Armor")]),
  component("component-basic-arm", "Professionally Crafted Basic Arm", "Robot Arm", 300, ["humanoid", "weapon-capable"], [effect("arm-rule", "Weapon Manipulator", "rule", "", 0, "Can equip ordinary weapons and firearms.")]),
  component("component-basic-leg", "Professionally Crafted Basic Leg", "Robot Leg", 280, ["humanoid", "mobility"], [effect("leg-speed", "Mobility", "stat", "Speed", 2, "+2 Speed")]),
  component("component-heavy-chest-mount", "Augmented Large Firearm Mount", "Robot Auxiliary", 900, ["chest", "heavy-firearm"], [effect("mount-rule", "Large Firearm Mount", "rule", "", 0, "Supports a large chest-mounted firearm.")]),
  component("component-steel-plating", "Steel Exterior Plating", "Plating", 700, ["steel", "armor"], [effect("steel-armor", "Steel Plating", "stat", "Armor", 4, "+4 Armor")]),
  component("component-pistol-frame", "Balanced Pistol Frame", "Firearm Frame", 300, ["9mm", "pistol"], [effect("frame-accuracy", "Balanced Frame", "stat", "Accuracy", 1, "+1 Accuracy", true)]),
  component("component-revolver-frame", "Service Revolver Frame", "Firearm Frame", 360, ["revolver", "handgun", ".357", "frame:revolver"], [effect("revolver-frame-rule", "Revolver Configuration", "rule", "", 0, "Configures the weapon as a durable cylinder-fed revolver.", true)]),
  component("component-shotgun-frame", "Tactical Shotgun Frame", "Firearm Frame", 550, ["shotgun", "12-gauge", "frame:shotgun"], [effect("shotgun-frame-rule", "Shotgun Configuration", "rule", "", 0, "Configures the weapon as a close-range shotgun platform.", true)]),
  component("component-rifle-frame", "Precision Rifle Frame", "Firearm Frame", 650, ["rifle", "longarm", "frame:rifle"], [effect("rifle-frame-rule", "Rifle Configuration", "rule", "", 0, "Configures the weapon as a stable long-range rifle platform.", true)]),
  component("component-automatic-frame", "Automatic Carbine Frame", "Firearm Frame", 800, ["automatic", "carbine", "rifle", "frame:automatic"], [effect("automatic-frame-rule", "Automatic Configuration", "rule", "", 0, "Configures the weapon as a magazine-fed automatic carbine.", true)]),
  component("component-9mm-ammo", "9mm Ammunition System", "Ammunition", 80, ["9mm"], [effect("ammo-damage", "9mm Damage", "dice", "Damage", 0, "1d10 piercing", true)]),
  component("component-abyss-incendiary-ammo", "Abyss Fabricator - Incendiary Magazine", "Ammunition", 0, ["abyss-fabricator", "universal", "incendiary", "red", "30-round"], [effect("abyss-incendiary-rule", "Incendiary Rounds", "rule", "", 0, "Changes the weapon's damage type to fire and deals an additional 1d8 fire damage on hit.", true)], "A free 30-round magazine produced by the matte-black Abyss Fabricator's red setting."),
  component("component-abyss-cryo-ammo", "Abyss Fabricator - Cryo Magazine", "Ammunition", 0, ["abyss-fabricator", "universal", "cryo", "blue", "30-round"], [effect("abyss-cryo-rule", "Cryo Rounds", "rule", "", 0, "On hit, the target makes a Constitution save against DC 10 + proficiency bonus + Constitution modifier. Failure halves speed until the end of its next turn; a target already slowed this way is frozen on another failed save.", true)], "A free 30-round magazine produced by the matte-black Abyss Fabricator's blue setting."),
  component("component-abyss-toxic-ammo", "Abyss Fabricator - Toxic Magazine", "Ammunition", 0, ["abyss-fabricator", "universal", "toxic", "green", "30-round"], [effect("abyss-toxic-rule", "Toxic Rounds", "rule", "", 0, "On hit, the target makes a Constitution save or is Poisoned for 1 minute and takes 1d6 poison damage at the start of each turn. The damage stacks, and the save repeats at the end of each turn.", true)], "A free 30-round magazine produced by the matte-black Abyss Fabricator's green setting."),
  component("component-abyss-concussive-ammo", "Abyss Fabricator - Concussive Magazine", "Ammunition", 0, ["abyss-fabricator", "universal", "concussive", "yellow", "30-round"], [effect("abyss-concussive-rule", "Concussive Rounds", "rule", "", 0, "On hit, the target gains 1 Stagger Potential. Each point raises the base 50% health threshold for triggering the campaign's stagger effect by 5%.", true)], "A free 30-round magazine produced by the matte-black Abyss Fabricator's yellow setting."),
  component("component-abyss-gravitic-ammo", "Abyss Fabricator - Gravitic Magazine", "Ammunition", 0, ["abyss-fabricator", "universal", "gravitic", "purple", "30-round"], [effect("abyss-gravitic-rule", "Gravitic Rounds", "rule", "", 0, "On hit, the target makes an Agility save against DC 10 + proficiency bonus + Dexterity modifier or is pushed 15 feet in a chosen direction and knocked prone.", true)], "A free 30-round magazine produced by the matte-black Abyss Fabricator's purple setting."),
  component("component-abyss-echo-ammo", "Abyss Fabricator - Echo Magazine", "Ammunition", 0, ["abyss-fabricator", "universal", "echo", "white", "30-round"], [effect("abyss-echo-rule", "Echo Rounds", "rule", "", 0, "On hit, the projectile rebounds to a second target within 15 feet. Make a separate attack roll; on a hit, it deals full damage including modifiers.", true)], "A free 30-round magazine produced by the matte-black Abyss Fabricator's white setting."),
  component("component-9mm-barrel", "Standard 9mm Barrel", "Firearm Barrel", 220, ["9mm"], [effect("barrel-range", "Standard Barrel", "stat", "Range", 30, "+30 ft range", true)]),
  component("component-tactical-stock", "Tactical Folding Stock", "Firearm Stock", 180, ["pistol", "rifle"], [effect("stock-accuracy", "Braced Fire", "stat", "Accuracy", 1, "+1 Accuracy while braced", true)]),
  component("component-reflex-sight", "Reflex Sight", "Firearm Sight", 240, ["optic", "rail"], [effect("sight-accuracy", "Reflex Sight", "stat", "Accuracy", 1, "+1 Accuracy", true)]),
  component("component-suppressor", "Sound Suppressor", "Firearm Attachment", 320, ["muzzle", "9mm"], [effect("suppressor-rule", "Suppressed", "rule", "", 0, "Greatly reduces the sound of firing.", true)]),
];

export const WORKSHOP_SAINT_GREGORY = normalizeWorkshopBuild({
  id: "sample-saint-gregory", playerId: "", blueprintId: "blueprint-humanoid-robot", blueprintVersion: 1, name: "Saint Gregory", designation: "Saint Gregory", status: "completed", revision: 1,
  assignments: [["robot-head", "component-basic-head"], ["robot-ai", "component-rapture-ai"], ["robot-core", "component-rapture-reactor"], ["robot-chest", "component-basic-chest"], ["robot-left-arm", "component-basic-arm"], ["robot-right-arm", "component-basic-arm"], ["robot-left-leg", "component-basic-leg"], ["robot-right-leg", "component-basic-leg"], ["robot-aux-chest", "component-heavy-chest-mount"], ["robot-plating", "component-steel-plating"]].map(([slotId, componentId]) => ({ slotId, componentId })),
});
