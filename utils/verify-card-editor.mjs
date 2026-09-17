import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const componentPath = path.join(root, "src", "app", "components", "dm-card-manager-section.tsx");
const campaignPackPath = path.join(root, "src", "app", "data", "campaign-ability-pack.ts");
const initialDataPath = path.join(root, "src", "app", "components", "initial-data.tsx");
const balanceReviewPath = path.join(root, "docs", "campaign-ability-balance-review.md");
const bundlePath = path.join(os.tmpdir(), `verify-card-editor-${process.pid}.mjs`);
await build({
  entryPoints: [componentPath],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: bundlePath,
  define: {
    "import.meta.env": JSON.stringify({
      DEV: true,
      PROD: false,
      VITE_SUPABASE_URL: "https://card-editor-test.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "card-editor-test-key",
    }),
    "process.env.NODE_ENV": '"test"',
  },
});
const { DMCardManagerSection } = await import(`${pathToFileURL(bundlePath).href}?run=${Date.now()}`);
const editor = DMCardManagerSection.__cardEditorTestApi;
await fs.unlink(bundlePath).catch(() => undefined);

assert.ok(editor, "Card editor test API must be attached in development builds");

const emptyBuilder = () => ({
  trigger: "",
  target: "",
  requirement: "",
  effect: "",
  duration: "",
  scaling: "",
  notes: "",
});

const makeCard = (overrides = {}) => ({
  id: "card-test",
  name: "Test Card",
  type: "Combat",
  actionCost: "1 Action",
  tags: [],
  effect: "<p>Deal damage.</p>",
  assignedTo: [],
  customFields: {},
  nodeTreeId: "",
  nodeId: "",
  ...overrides,
});

const attackTag = {
  id: "tag-attack",
  name: "Attack",
  description: "An attack card.",
  fields: [{ id: "field-damage", name: "Damage", type: "dice", required: true }],
};
const retiredTag = {
  id: "tag-retired",
  name: "Retired Tag",
  description: "Legacy compatibility fixture.",
  fields: [{ id: "field-legacy", name: "Legacy Value", type: "text" }],
};
const tags = [attackTag, retiredTag];

const created = editor.createCardFromTemplate({
  id: "attack",
  label: "Attack",
  description: "",
  focusPanel: "mechanics",
  name: "New Attack",
  type: "Combat",
  actionCost: "1 Action",
  effect: "<p><strong>Effect:</strong> Strike.</p>",
  suggestedTags: ["attack"],
  defaultFamily: "skill",
}, tags);
assert.equal(created.name, "New Attack", "Template creation must populate identity fields");
assert.equal(editor.getCardFamily(created), "skill", "Template creation must retain its card family");
assert.deepEqual(created.tags, ["Attack"], "Template creation must resolve suggested tags against the saved tag catalog");

const authoredProfile = makeCard({
  customFields: {
    [editor.keys.cardFamily]: "ability",
    "Use Profile::Primary Cost": "3 custom charges",
    "Use Profile::Origin": "Campaign reward",
  },
});
const changedFamily = editor.withCardFamilyDefaults(authoredProfile, "spell");
assert.equal(changedFamily.customFields[editor.keys.cardFamily], "spell", "Family changes must update the selected family");
assert.equal(changedFamily.customFields["Use Profile::Primary Cost"], "3 custom charges", "Family changes must preserve authored costs");
assert.equal(changedFamily.customFields["Use Profile::Origin"], "Campaign reward", "Family changes must preserve authored profile fields");
assert.equal(changedFamily.customFields["Use Profile::Magic Nature"], "Magical (Spell)", "Family changes may fill missing defaults");
const sinCard = editor.withCardFamilyDefaults(makeCard({ name: "The Stage of Pride", type: "SIN Activation" }), "sin");
assert.equal(editor.getCardFamily(sinCard), "sin", "SIN must be a distinct card family");
assert.equal(sinCard.customFields["Use Profile::Magic Nature"], "SIN (Neither Spell, Skill, nor Ability)", "SIN must not inherit spell or ability nature");
assert.equal(sinCard.customFields["Use Profile::Cost Model"], "Emotional activation / Uses", "SIN must use emotional activation instead of Source");
assert.equal(editor.getCardFamily(makeCard({ type: "SIN Activation", effect: "<p>Falsification transforms the play.</p>" })), "sin", "Legacy SIN cards must be inferred before spell or ability keywords");
const reclassifiedSin = editor.withCardFamilyDefaults(editor.withCardFamilyDefaults(makeCard(), "spell"), "sin");
assert.equal(reclassifiedSin.customFields["Use Profile::Magic Nature"], "SIN (Neither Spell, Skill, nor Ability)", "Changing a spell into a SIN must replace generated spell defaults");
assert.equal(reclassifiedSin.customFields["Use Profile::Cost Model"], "Emotional activation / Uses", "Changing a spell into a SIN must not retain Source cost");

const legacy = makeCard({
  id: "legacy-card",
  tags: [],
  assignedTo: ["player-a"],
  nodeTreeId: "tree-a",
  nodeId: "node-b",
  effect: "<p><strong>Target:</strong> One enemy</p><p><strong>Effect:</strong> Deal 2d6 damage.</p>",
  customFields: {
    "Legacy Campaign Field": "Keep this forever",
    "Retired Tag::Legacy Value": "Keep this while hidden",
    [editor.keys.cardDescription]: "<p>Legacy description.</p>",
    [editor.keys.trackerBucket]: "ability",
    [editor.keys.trackerName]: "Legacy Tracker",
    [editor.keys.trackerDuration]: "3 rounds",
    [`${editor.keys.quickRollPrefix}1::${editor.keys.quickRollLabel}`]: "Damage",
    [`${editor.keys.quickRollPrefix}1::${editor.keys.quickRollExpression}`]: "2d6+KNOW",
    [`${editor.keys.quickRollPrefix}1::${editor.keys.quickRollPotency}`]: "2",
  },
});
assert.equal(editor.getStoredRulesMode(legacy), "manual", "Cards without editor metadata must remain manual cards");
assert.equal(editor.parseStoredMechanicsBuilder(legacy).effect, "Deal 2d6 damage.", "Legacy effect text must seed the guided builder without changing save mode");
assert.deepEqual(editor.parseStoredSectionBlocks(legacy), [], "Legacy cards without sections must open safely");

const legacyRolls = editor.buildQuickRollSlots(legacy.customFields);
assert.deepEqual(legacyRolls, [{ slotId: "1", label: "Damage", expression: "2d6+KNOW", potency: "2" }], "Existing quick rolls must round-trip through the redesigned Rules stage");

const manualSaved = editor.withPersistedEditorStructure(legacy, editor.parseStoredMechanicsBuilder(legacy), [], "manual", tags);
assert.equal(manualSaved.effect, legacy.effect, "Manual saves must preserve the authored effect HTML");
assert.equal(manualSaved.customFields["Legacy Campaign Field"], "Keep this forever", "Unknown legacy fields must survive a save");
assert.equal(manualSaved.customFields["Retired Tag::Legacy Value"], "Keep this while hidden", "Inactive tag fields must remain recoverable");
assert.equal(manualSaved.customFields[editor.keys.trackerName], "Legacy Tracker", "Tracker configuration must survive a save");
assert.deepEqual(manualSaved.assignedTo, ["player-a"], "Player assignment must survive a save");
assert.equal(manualSaved.nodeId, "node-b", "Progression assignment must survive a save");

const guidedBuilder = { ...emptyBuilder(), target: "One ally", effect: "Restore 2d8 health." };
const guidedBlocks = [{ id: "section-1", title: "Limitation", content: "Once per rest.", tone: "limitation" }];
const guidedSaved = editor.withPersistedEditorStructure(makeCard({ effect: "Old manual text" }), guidedBuilder, guidedBlocks, "guided", tags);
assert.match(guidedSaved.effect, /<strong>Target:<\/strong> One ally/, "Guided saves must generate effect text from structured rules");
assert.match(guidedSaved.effect, /<strong>Limitation:<\/strong> Once per rest\./, "Additive section blocks must join the guided rules output");
assert.equal(editor.parseStoredMechanicsBuilder(guidedSaved).target, "One ally", "Guided mechanics must round-trip through editor metadata");
assert.equal(editor.parseStoredSectionBlocks(guidedSaved)[0].tone, "limitation", "Section tone and content must round-trip");

const baseline = editor.buildEditorSnapshot(legacy, editor.parseStoredMechanicsBuilder(legacy), [], "manual", false);
const editedSnapshot = editor.buildEditorSnapshot({ ...legacy, name: "Edited Card" }, editor.parseStoredMechanicsBuilder(legacy), [], "manual", false);
assert.notEqual(editedSnapshot, baseline, "Editing any saved field must mark the workspace dirty");

const createdList = editor.upsertManagedCard([legacy], created, true);
assert.deepEqual(createdList.map((card) => card.id), ["legacy-card", created.id], "Create must append a new card without replacing existing cards");
const editedList = editor.upsertManagedCard(createdList, { ...legacy, name: "Edited Legacy Card" }, false);
assert.equal(editedList.find((card) => card.id === "legacy-card")?.name, "Edited Legacy Card", "Edit must replace only the matching card");
assert.equal(editedList.find((card) => card.id === created.id)?.name, created.name, "Edit must leave every other card intact");

const trees = [{
  id: "tree-a",
  name: "Test Progression",
  assignedTo: ["player-a"],
  connections: [],
  nodes: [
    { id: "node-a", label: "Old Node", x: 20, y: 80, rank: 0, cardIds: ["legacy-card"], prerequisites: [] },
    { id: "node-b", label: "New Node", x: 50, y: 30, rank: 1, cardIds: ["other-card"], prerequisites: [] },
  ],
}];
const synchronized = editor.synchronizeCardNodeTrees(trees, legacy);
assert.equal(synchronized.changed, true, "Changing progression placement must mark node trees for persistence");
assert.deepEqual(synchronized.nextTrees[0].nodes[0].cardIds, [], "Progression save must remove a card from its previous node");
assert.deepEqual(synchronized.nextTrees[0].nodes[1].cardIds, ["other-card", "legacy-card"], "Progression save must add a card to its selected node");
assert.equal(editor.getNodeCapacityState({ ...trees[0].nodes[1], cardIds: ["a", "b", "c"] }, "new-card").isFullForSelection, true, "A different card cannot enter a full node");
assert.equal(editor.getNodeCapacityState({ ...trees[0].nodes[1], cardIds: ["a", "b", "legacy-card"] }, "legacy-card").isFullForSelection, false, "A card may keep its current full node assignment");

const cleanedTrees = editor.removeCardFromNodeTrees(trees, "legacy-card");
assert.deepEqual(cleanedTrees[0].nodes[0].cardIds, [], "Deleting a card must release its node-tree slot");

const cleanedMagicLists = editor.removeCardFromMagicLists([{
  id: "magic-a",
  name: "Magic A",
  order: 0,
  tiers: { cantrip: ["legacy-card"], "1": [], "2": [], "3": [], "4": [], "5": [], "6": [], "7": [], "8": [] },
  learnedCardIds: ["legacy-card"],
}], "legacy-card");
assert.deepEqual(cleanedMagicLists[0].tiers.cantrip, [], "Deleting a card must remove it from magic tiers");
assert.deepEqual(cleanedMagicLists[0].learnedCardIds, [], "Deleting a card must remove its learned-magic reference");

const cleanedLevels = editor.removeCardFromLevelCategories([{
  id: "level-1",
  name: "Level 1",
  order: 0,
  cardEntries: [{ cardId: "legacy-card", showInCards: true }],
}], "legacy-card");
assert.deepEqual(cleanedLevels[0].cardEntries, [], "Deleting a card must remove it from level rewards");

const unlockedNodeCards = editor.collectUnlockedNodeCardIds(trees, { "tree-a": ["node-b"] });
assert.deepEqual(Array.from(unlockedNodeCards), ["other-card"], "Only cards on unlocked nodes may be granted to a player");

const invalid = makeCard({
  name: "",
  tags: ["Attack"],
  customFields: {
    [editor.keys.cardFamily]: "skill",
    [`${editor.keys.quickRollPrefix}1::${editor.keys.quickRollLabel}`]: "Damage",
  },
});
const invalidIssues = editor.collectCardValidationIssues(invalid, emptyBuilder(), [], "manual", trees, tags);
assert.ok(invalidIssues.some((issue) => issue.id === "card-name"), "Basics validation must report a missing name beside the affected control");
assert.ok(invalidIssues.some((issue) => issue.id === "tag-required-Attack::Damage"), "Tag validation must report missing required fields");
assert.ok(invalidIssues.some((issue) => issue.id === "quick-roll-expression-1"), "Roll validation must report a missing expression");

const repaired = makeCard({
  tags: ["Attack"],
  customFields: {
    [editor.keys.cardFamily]: "skill",
    "Attack::Damage": "2d6",
    [`${editor.keys.quickRollPrefix}1::${editor.keys.quickRollLabel}`]: "Damage",
    [`${editor.keys.quickRollPrefix}1::${editor.keys.quickRollExpression}`]: "2d6",
    [editor.keys.trackerBucket]: "status",
    [editor.keys.trackerName]: "Burning",
  },
});
const repairedIssues = editor.collectCardValidationIssues(repaired, emptyBuilder(), [], "manual", [], tags);
assert.equal(repairedIssues.filter((issue) => issue.level === "error").length, 0, "A complete manual card with tags, rolls, and tracker must be saveable");

const campaignPackSource = await fs.readFile(campaignPackPath, "utf8");
const cardManagerSource = await fs.readFile(componentPath, "utf8");
const initialDataSource = await fs.readFile(initialDataPath, "utf8");
const balanceReviewSource = await fs.readFile(balanceReviewPath, "utf8");
const personalFilesSource = await fs.readFile(path.join(root, "src", "app", "components", "personal-files.tsx"), "utf8");
const packBundlePath = path.join(os.tmpdir(), `verify-campaign-pack-${process.pid}.mjs`);
await build({ entryPoints: [campaignPackPath], bundle: true, format: "esm", platform: "node", outfile: packBundlePath });
const { campaignAbilityPack, approvedCampaignCards, getCampaignAbilityPackSummary } = await import(`${pathToFileURL(packBundlePath).href}?run=${Date.now()}`);
await fs.unlink(packBundlePath).catch(() => undefined);
const stageOfPride = campaignAbilityPack.find((seed) => seed.card.id === "campaign-unassigned-stage-of-pride");
assert.ok(stageOfPride, "Stage of Pride must be importable as a card");
assert.equal(stageOfPride.ownerName, "Unassigned", "SIN must not be granted to an unspecified character");
assert.equal(stageOfPride.card.customFields["Card Family"], "sin", "The imported SIN must retain its fourth-family classification");
assert.equal(stageOfPride.card.customFields["Level"], "", "SIN must not inherit a spell stage or unlock level");
assert.equal(stageOfPride.magicStage, undefined, "SIN must not enter a Magic tier");
assert.equal(stageOfPride.levelCategory, undefined, "SIN must not enter a level category by default");
assert.equal(approvedCampaignCards.find((card) => card.id === stageOfPride.card.id)?.assignedTo.length, 0, "Default SIN card must stay unassigned");
assert.equal(getCampaignAbilityPackSummary().byOwner.Unassigned, 1, "Pack summary must count the unassigned SIN without a missing-player warning");
const campaignCardIds = Array.from(campaignPackSource.matchAll(/id: "(campaign-(?:lotus|alice|unassigned)-[^"]+)"/g), (match) => match[1]);
assert.equal(campaignCardIds.length, 35, "The campaign import pack must retain 34 submitted Lotus and Alice cards and the unassigned SIN");
assert.equal(new Set(campaignCardIds).size, campaignCardIds.length, "Campaign card IDs must remain unique so repeated imports are safe");
assert.match(campaignPackSource, /nodeLabel: "The Central Star"/, "The Polaris card must remain gated by the Central Star node");
assert.match(campaignPackSource, /nodeLabel: "The Forgotten Star"/, "The Emerald Crown card must remain gated by the Forgotten Star node");
assert.equal((campaignPackSource.match(/type: "Eastern Zodiac Form"/g) || []).length, 5, "All submitted Eastern Astra Forms must be classified as non-spell forms");
assert.equal((campaignPackSource.match(/magicNature: "Non-Magical \(Eastern Zodiac Form\)"/g) || []).length, 5, "Eastern Zodiac Forms must not consume or behave as magic");
assert.equal((campaignPackSource.match(/type: "Western Zodiac Spell"/g) || []).length, 3, "All submitted Western Zodiac cards must be classified as spells");
assert.equal((campaignPackSource.match(/Using any other spell or magical ability that requires concentration immediately ends this spell\./g) || []).length, 3, "Every Western Zodiac spell must explicitly compete for concentration");
assert.match(campaignPackSource, /CAMPAIGN_ABILITY_PACK_VERSION = "2026-09-17-draft-12"/, "The SIN card must use a new import revision");
const approvedIdBlock = campaignPackSource.match(/APPROVED_CAMPAIGN_CARD_IDS = \[([\s\S]*?)\] as const;/)?.[1] || "";
const approvedIds = Array.from(approvedIdBlock.matchAll(/"(campaign-(?:lotus|unassigned)-[^"]+)"/g), (match) => match[1]);
assert.equal(approvedIds.length, 15, "The default catalog must include the approved fourteen cards plus the Stage of Pride SIN");
assert.equal(approvedIds[0], "campaign-lotus-central-star-polaris", "The approved range must begin with Star Polaris");
assert.equal(approvedIds[10], "campaign-lotus-astra-erlang", "The original approved range must end with Erlang");
assert.deepEqual(approvedIds.slice(11, 14), ["campaign-lotus-stellar-tides-aquarius", "campaign-lotus-astral-aegis-cancer", "campaign-lotus-radiant-veil-virgo"], "All three Western Zodiac spells must be completed cards");
assert.equal(approvedIds[14], "campaign-unassigned-stage-of-pride", "Stage of Pride must be present in the default card catalog");
assert.match(campaignPackSource, /id: "campaign-unassigned-stage-of-pride",\s*ownerName: "Unassigned",[\s\S]*?family: "sin",[\s\S]*?type: "SIN Activation: Raise the Curtains"/, "Stage of Pride must remain unassigned and classified as a SIN");
assert.match(campaignPackSource, /Emotional Affinity": "Pride"[\s\S]*?SIN::Falsification/, "The SIN card must preserve Pride affinity and falsification details");
assert.match(campaignPackSource, /120-foot radius[\s\S]*?one minute[\s\S]*?twisting into a Tragedy/, "The SIN card must describe the theater and loss-of-control outcome");
assert.match(cardManagerSource, /seed\.ownerName === "Unassigned" \? undefined/, "The importer must not require a player profile for the SIN");
assert.match(cardManagerSource, /availableCards = managedCards\.filter\(\(card\) => !listCardIds\.has\(card\.id\) && getCardFamily\(card\) !== "sin"\)/, "SIN cards must not be offered in Magic tiers");
assert.match(cardManagerSource, /SIN PROFILE[\s\S]*SIN::Emotional Affinity[\s\S]*SIN::Activation[\s\S]*SIN::Falsification/, "The DM must be able to edit SIN-specific fields without a tag migration");
assert.match(initialDataSource, /name: "SIN"/, "The initial tag catalog must identify the fourth family");
assert.match(personalFilesSource, /id: "sin" as const, label: "SIN"/, "Player cards must expose an independent SIN filter");
assert.match(personalFilesSource, /cardLevel > 0 && getCardPrimaryFamily\(card\) !== "sin"/, "Using a SIN must not log Source use based on a numeric Level field");
assert.match(campaignPackSource, /if \(includeInBalanceReview\) \{[\s\S]*__editor_balance_rating/, "Only unapproved seeds may receive Balance Review metadata");
assert.match(initialDataSource, /approvedCampaignCards\.map/, "Approved abilities must be included in the website's initial card catalog");
assert.doesNotMatch(balanceReviewSource, /^\| (?:Central Form: The Star Polaris|Central Form: An Emerald Crown|Sea Blood Constitution|Brackish Hold|Seashape|Trident of the Reef|Astra Form: The Monkey|Astra Form: The Goat|Astra Form: The Pig|Astra Form: The Dog|Astra Form: Erlang|Stellar Tides of Aquarius|Astral Aegis of Cancer|Radiant Veil of Virgo) \|/m, "Approved cards must not remain in the Balance Review tables");
assert.match(campaignPackSource, /It has 30 hit points and AC equal to yours/, "Polaris Heart must use the revised fixed HP rule");
assert.match(campaignPackSource, /if you reach 0 hit points while already at maximum wounds/, "Polaris Heart must gate its 1-HP lock behind maximum wounds");
assert.match(campaignPackSource, /An Emerald Kingdom for Myself — Passive/, "Emerald Crown must include its revised magical domain passive");
assert.match(campaignPackSource, /Consume six magic crystals to form an emerald crown/, "Emerald Crown must use its revised six-crystal cost");
assert.match(campaignPackSource, /forged from the six crystals sacrificed to cast it/, "Emerald Crown's player-facing description must use six crystals consistently");
assert.match(campaignPackSource, /crown shatters on the fourth strike/, "Emerald Crown must use the resolved four-strike limit");
assert.match(campaignPackSource, /casts a spell of Level 6 or lower/, "Emerald Claim must only contest spells through Level 6");
assert.match(campaignPackSource, /takes 5d8 \+ your spellcasting ability modifier emerald damage/, "Emerald Judgment must retain its revised damage");
assert.match(campaignPackSource, /resistance to water-type Elemental or Devotional damage/, "Sea Blood Constitution must use the revised damage categories");
assert.match(campaignPackSource, /If you take damage while in water and at 0 hit points, this automatic stabilization is negated/, "Brackish Hold must include its damage exception");
assert.match(campaignPackSource, /Crab Carapace:<\/strong> Gain \+2 AC and lose 10 feet of movement speed/, "Seashape must use the revised Crab Carapace tradeoff");
assert.match(campaignPackSource, /uses: "Proficiency Bonus \/ Long Rest"[\s\S]*Coral Surge — Thrown Property/, "Trident of the Reef must use PB summons per long rest and retain Coral Surge");
assert.doesNotMatch(campaignPackSource, /Reef Spike/, "The removed Reef Spike technique must not remain in the campaign pack");
assert.match(campaignPackSource, /who chooses between those outcomes is not yet specified/, "Coral Waves' unresolved damage-or-restraint choice must remain visible for a DM ruling");
assert.match(campaignPackSource, /Mountain's Reach and Weight:[\s\S]*from 5 to 30 feet/, "Monkey must include its variable-length staff tradeoff");
assert.match(campaignPackSource, /At the start of each of your turns, gain temporary hit points equal to twice your Proficiency Bonus/, "Goat must use its revised recurring temporary HP rule");
assert.match(campaignPackSource, /turn tier-1 immunity into resistance/, "Goat must retain its tier-1 immunity conversion option");
assert.match(campaignPackSource, /Level 12: each meal provides two blessings/, "Pig must grant its second blessing at Level 12");
assert.doesNotMatch(campaignPackSource, /\+25 maximum HP|25 maximum hit points/, "Pig's removed maximum-HP increase must not remain in the campaign pack");
assert.match(campaignPackSource, /Level 6: the equipped bell alerts you during sleep/, "Dog must use its revised sleep-alert progression");
assert.match(campaignPackSource, /Level 12: awareness radius becomes 1,000 feet/, "Dog must move its expanded awareness radius to Level 12");
assert.match(campaignPackSource, /15-foot reach[\s\S]*1d12 slashing damage[\s\S]*Heavy Blade/, "Erlang must use the revised reach, sweep damage, and Heavy Blade technique");
assert.match(campaignPackSource, /name: "Astral Aegis of Cancer"[\s\S]*?\+1 AC at spell levels 1–2, \+2 AC at levels 3–4, or \+3 AC at level 5 or higher[\s\S]*?rating: 0,[\s\S]*?status: "Clarify"/, "Cancer must use its capped AC progression and campaign-balanced review rating");
assert.doesNotMatch(campaignPackSource, /bonus to AC equal to the spell's stage/, "Cancer's removed stage-equals-AC rule must not remain");
assert.match(campaignPackSource, /name: "Radiant Veil of Virgo"[\s\S]*?end one stack of a negative condition[\s\S]*?number of d3 hit points equal to the spell's level[\s\S]*?rating: 0,[\s\S]*?status: "Clarify"/, "Virgo must use condition stacks, d3 healing, and the campaign-balanced review rating");
assert.match(campaignPackSource, /name: "Fae Circle of the Wild Hold"[\s\S]*?actionCost: "1-hour Cast Time"[\s\S]*?levelCategory: "Level 6"/, "Fae Circle must use its revised one-hour casting time and Level-6 placement");
assert.match(campaignPackSource, /name: "Roots Beneath Skin"[\s\S]*?small clump of roots and dirt[\s\S]*?Add the result to your saving throw/, "Roots Beneath Skin must use its carried material and saving-throw bonus");
assert.match(campaignPackSource, /name: "Threadstep Tether"[\s\S]*?uses: "Proficiency Bonus \/ Short Rest"[\s\S]*?before the end of your next turn/, "Threadstep Tether must use PB short-rest uses while preserving its stated timing");
assert.match(campaignPackSource, /name: "Burning Bloom of Refusal"[\s\S]*?levelCategory: "Level 3"[\s\S]*?all healing you receive is negated[\s\S]*?collapse and enter death saving throws/, "Burning Bloom must use its Level-3 placement and revised death-gate consequences");
assert.match(campaignPackSource, /name: "Twilight's Decree"[\s\S]*?actionCost: "1 Full Action"[\s\S]*?magicStage: "4"[\s\S]*?either a Constitution or Arcana saving throw/, "Twilight's Decree must use its revised Full Action, Stage 4, and concealment save");
assert.doesNotMatch(campaignPackSource, /2d12 psychic damage/, "Twilight's Decree's removed lie damage must not remain");
assert.match(campaignPackSource, /name: "Twilight Binding"[\s\S]*?dark thread, not consumed[\s\S]*?magicStage: "2"/, "Twilight Binding must use its reusable thread and Stage-2 placement");
assert.match(campaignPackSource, /name: "Horizon's Lament"[\s\S]*?actionCost: "1 Action \(source timing conflicts with its trigger\)"[\s\S]*?magicStage: "2"/, "Horizon's Lament must preserve its stated Action label and expose the timing conflict at Stage 2");
assert.match(cardManagerSource, /centralRulesRefreshIds[\s\S]*campaign-lotus-central-star-polaris[\s\S]*campaign-lotus-forgotten-star-emerald-crown/, "Re-importing older packs must retain the Central Form rules migration");
assert.match(cardManagerSource, /seaRulesRefreshIds[\s\S]*campaign-lotus-sea-blood-constitution[\s\S]*campaign-lotus-brackish-hold[\s\S]*campaign-lotus-seashape[\s\S]*campaign-lotus-trident-of-the-reef/, "Re-importing must refresh all four revised Sea card rules");
assert.match(cardManagerSource, /seaDescriptionRefreshIds[\s\S]*campaign-lotus-seashape[\s\S]*campaign-lotus-trident-of-the-reef/, "Re-importing must refresh the revised Sea card descriptions");
assert.match(cardManagerSource, /easternRulesRefreshIds[\s\S]*campaign-lotus-astra-monkey[\s\S]*campaign-lotus-astra-goat[\s\S]*campaign-lotus-astra-pig[\s\S]*campaign-lotus-astra-dog[\s\S]*campaign-lotus-astra-erlang/, "Re-importing must refresh all five revised Eastern Forms");
assert.match(cardManagerSource, /westernRulesRefreshIds[\s\S]*campaign-lotus-astral-aegis-cancer[\s\S]*campaign-lotus-radiant-veil-virgo/, "Re-importing must refresh the revised Cancer and Virgo rules and descriptions");
assert.match(cardManagerSource, /faeEventideRulesRefreshIds[\s\S]*campaign-lotus-fae-circle-wild-hold[\s\S]*campaign-lotus-roots-beneath-skin[\s\S]*campaign-lotus-threadstep-tether[\s\S]*campaign-lotus-burning-bloom-refusal[\s\S]*campaign-lotus-twilights-decree[\s\S]*campaign-lotus-twilight-binding[\s\S]*campaign-lotus-horizons-lament/, "Re-importing must refresh all seven revised Fae and Eventide cards");
assert.match(cardManagerSource, /hasSeaRevision = \["2026-09-17-draft-6", "2026-09-17-draft-7", "2026-09-17-draft-8", "2026-09-17-draft-9", "2026-09-17-draft-10"\]\.includes\(importedVersion\)/, "The draft-11 migration must preserve current Sea mechanics and descriptions");
assert.match(cardManagerSource, /hasEasternRevision = \["2026-09-17-draft-8", "2026-09-17-draft-9", "2026-09-17-draft-10"\]\.includes\(importedVersion\)/, "The draft-11 migration must preserve current Eastern mechanics and descriptions");
assert.match(cardManagerSource, /hasWesternRevision = importedVersion === "2026-09-17-draft-10"/, "The draft-11 completion migration must preserve current Western Zodiac mechanics and descriptions");

console.log("Card editor verification passed: creation, editing, saves, tags, rolls, trackers, assignment, deletion cleanup, unlock gating, progression, campaign import data, and legacy data are intact.");
