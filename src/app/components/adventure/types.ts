export type AdventureClassId = "warrior" | "ranger" | "mage" | "cleric";
export type AdventureTheme = "forest" | "desert" | "dungeon" | "ruins" | "swamp" | "snowfield" | "arcane";
export type AdventureSessionStatus = "lobby" | "playing" | "completed" | "abandoned";
export type AdventureSessionPhase = "setup" | "encounter" | "rewards" | "closed";
export type AdventureOutcome = "victory" | "defeat" | "retreat" | "abandoned";
export type AdventureDifficulty = "standard" | "dangerous" | "heroic";
export type AdventureObjectiveType = "defeat_all" | "survive_rounds" | "recover_relic" | "escape";
export type AdventureTileKind = "floor" | "wall" | "cover" | "hazard" | "water" | "chest" | "shrine";
export type AdventureAbilityKind = "damage" | "heal" | "guard" | "mark";
export type AdventureItemKind = "heal" | "damage" | "cleanse" | "guard" | "key";
export type AdventureLogTone = "system" | "player" | "enemy" | "reward" | "warning";
export type AdventureActorKind = "player" | "enemy" | "host" | "system";

export interface AdventurePoint {
  x: number;
  y: number;
}

export interface AdventureTile {
  x: number;
  y: number;
  kind: AdventureTileKind;
  blocksMove: boolean;
  decor?: string;
}

export interface AdventureMap {
  width: number;
  height: number;
  theme: AdventureTheme;
  seed: number;
  tiles: AdventureTile[];
}

export interface AdventureAbility {
  id: string;
  name: string;
  description: string;
  kind: AdventureAbilityKind;
  range: number;
  power: number;
  area?: number;
}

export interface AdventureItem {
  id: string;
  name: string;
  description: string;
  kind: AdventureItemKind;
  range: number;
  power: number;
  quantity: number;
}

export interface AdventureClassDef {
  id: AdventureClassId;
  name: string;
  role: string;
  maxHp: number;
  move: number;
  basicDamage: number;
  color: string;
  abilities: AdventureAbility[];
  inventory: AdventureItem[];
}

export interface AdventureUnitBase {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  position: AdventurePoint;
  blockActive?: boolean;
  marked?: boolean;
}

export interface AdventurePlayer extends AdventureUnitBase {
  playerId: string;
  playerName: string;
  classId: AdventureClassId;
  ready: boolean;
  moveRemaining: number;
  actionTaken: boolean;
  inventory: AdventureItem[];
  abilities: AdventureAbility[];
  joinedAt: string;
  lastSeenAt: string;
}

export interface AdventureEnemy extends AdventureUnitBase {
  enemyType: string;
  attackRange: number;
  damage: number;
  intent: string;
}

export interface AdventureLogEntry {
  id: string;
  at: string;
  tone: AdventureLogTone;
  text: string;
}

export interface AdventureEncounterSettings {
  mapSize: number;
  theme: AdventureTheme;
  difficulty: AdventureDifficulty;
  objectiveType: AdventureObjectiveType;
  maxPlayers: number;
  profilesEnabled: boolean;
  rewardsEnabled: boolean;
}

export interface AdventureObjectiveState {
  type: AdventureObjectiveType;
  label: string;
  description: string;
  targetRounds?: number;
  extractionPoint?: AdventurePoint;
  relicPoint?: AdventurePoint;
  completed?: boolean;
}

export interface AdventureRewardBundle {
  xp: number;
  currency: number;
  items: AdventureItem[];
  summary: string;
}

export interface AdventurePendingReward {
  id: string;
  playerId: string;
  sessionId: string;
  reward: AdventureRewardBundle;
  claimed: boolean;
  createdAt: string;
  claimedAt?: string;
}

export interface AdventureActionRecord {
  id: string;
  at: string;
  actorId: string;
  type: AdventureActionRequest["type"];
  summary: string;
}

export interface AdventureSession {
  id: string;
  name: string;
  status: AdventureSessionStatus;
  phase: AdventureSessionPhase;
  version: number;
  outcome?: AdventureOutcome;
  hostPlayerId: string;
  mapSize: number;
  theme: AdventureTheme;
  seed: number;
  settings: AdventureEncounterSettings;
  objective: AdventureObjectiveState;
  map: AdventureMap | null;
  players: AdventurePlayer[];
  enemies: AdventureEnemy[];
  turnOrder: string[];
  activeTurnIndex: number;
  round: number;
  fleeVotes: string[];
  pendingRewards: AdventurePendingReward[];
  actionHistory: AdventureActionRecord[];
  lastResolvedActionId?: string;
  log: AdventureLogEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface AdventureProfileStats {
  sessionsPlayed: number;
  victories: number;
  defeats: number;
  retreats: number;
  enemiesDefeated: number;
  damageDealt: number;
  damageTaken: number;
}

export interface AdventureProfile {
  playerId: string;
  playerName: string;
  preferredClassId: AdventureClassId;
  level: number;
  xp: number;
  currency: number;
  inventory: AdventureItem[];
  unlockedAbilityIds: string[];
  completedSessionIds: string[];
  claimedRewardIds: string[];
  stats: AdventureProfileStats;
  updatedAt: string;
}

export type AdventureProfilesByPlayer = Record<string, AdventureProfile>;

export interface AdventureStateDoc {
  schemaVersion: 2;
  sessions: AdventureSession[];
  profiles: AdventureProfilesByPlayer;
}

export type AdventureActionMode =
  | { type: "move" }
  | { type: "attack" }
  | { type: "ability"; abilityId: string }
  | { type: "item"; itemId: string };

export type AdventureActionRequest =
  | { id: string; sessionId: string; actorId: string; actorKind: AdventureActorKind; type: "join"; expectedVersion?: number; payload: { playerName: string; classId: AdventureClassId } }
  | { id: string; sessionId: string; actorId: string; actorKind: AdventureActorKind; type: "set_class"; expectedVersion?: number; payload: { classId: AdventureClassId } }
  | { id: string; sessionId: string; actorId: string; actorKind: AdventureActorKind; type: "set_ready"; expectedVersion?: number; payload: { ready: boolean } }
  | { id: string; sessionId: string; actorId: string; actorKind: AdventureActorKind; type: "configure"; expectedVersion?: number; payload: Partial<AdventureEncounterSettings> & { name?: string } }
  | { id: string; sessionId: string; actorId: string; actorKind: AdventureActorKind; type: "start"; expectedVersion?: number }
  | { id: string; sessionId: string; actorId: string; actorKind: AdventureActorKind; type: "move"; expectedVersion?: number; target: AdventurePoint }
  | { id: string; sessionId: string; actorId: string; actorKind: AdventureActorKind; type: "basic_attack"; expectedVersion?: number; targetId: string }
  | { id: string; sessionId: string; actorId: string; actorKind: AdventureActorKind; type: "ability"; expectedVersion?: number; payload: { abilityId: string; targetId?: string } }
  | { id: string; sessionId: string; actorId: string; actorKind: AdventureActorKind; type: "item"; expectedVersion?: number; payload: { itemId: string; targetId?: string } }
  | { id: string; sessionId: string; actorId: string; actorKind: AdventureActorKind; type: "block"; expectedVersion?: number }
  | { id: string; sessionId: string; actorId: string; actorKind: AdventureActorKind; type: "vote_flee"; expectedVersion?: number }
  | { id: string; sessionId: string; actorId: string; actorKind: AdventureActorKind; type: "end_turn"; expectedVersion?: number }
  | { id: string; sessionId: string; actorId: string; actorKind: AdventureActorKind; type: "skip_turn"; expectedVersion?: number; payload?: { targetUnitId?: string } }
  | { id: string; sessionId: string; actorId: string; actorKind: AdventureActorKind; type: "abandon"; expectedVersion?: number }
  | { id: string; sessionId: string; actorId: string; actorKind: AdventureActorKind; type: "reset_to_lobby"; expectedVersion?: number }
  | { id: string; sessionId: string; actorId: string; actorKind: AdventureActorKind; type: "close"; expectedVersion?: number }
  | { id: string; sessionId: string; actorId: string; actorKind: AdventureActorKind; type: "claim_rewards"; expectedVersion?: number };

export interface AdventureActionResult {
  ok: boolean;
  session: AdventureSession;
  profiles: AdventureProfilesByPlayer;
  reason?: string;
  source?: "remote" | "local";
}
