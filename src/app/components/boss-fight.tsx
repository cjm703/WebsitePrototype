import React, { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { retro } from "./retro-styles";
import { S_ACCENT, DISPLAY_CONTENTS } from "./shared-styles";
import { Trophy, Heart, Volume2, VolumeX, Maximize, Minimize } from "lucide-react";
import { BossFightPhase2 } from "./boss-fight-phase2";
import type { Phase2DebugHandle, Phase2DebugState } from "./boss-fight-phase2";
import bossImg from "@/assets/figma/Gnarpy_Boss1.png";
import bossImg2 from "@/assets/figma/Gnarpy_Miku_Boss2.png";
import alienShipImg from "@/assets/figma/AlienShip.png";
import saucerImg from "@/assets/figma/AlienSaucer.png";
import pawImg from "@/assets/figma/Paw.png";
import { addOwnedSticker } from "./game-leaderboard";
import { safeGetItem, safeSetItem } from "./safe-storage";

// ── Buu Mode / Config Interface ─────────────────────────────────────────
export interface BossFightConfig {
  // Boss identity
  bossName: string;
  bossMaxHp: number;
  playerMaxHp: number;
  startingFood: number;

  // Phase 2 system
  phase2Enabled: boolean;
  phase2BossHp: number;
  phase2DamageMultiplier: number;
  phase2SpeedMultiplier: number;
  phase2TransitionText: string;
  phase2BossName: string;

  // Phase 2 placeholder (shows a "coming soon" screen instead of continuing the fight)
  phase2Placeholder: boolean;
  phase2Colors: { bg: string; accent: string; text: string };

  // Attack damage overrides (phase 1 base values)
  beamDamage: number;
  rotateBeamDamage: number;
  bulletStormDamage: number;
  bulletStormBeamDamage: number;
  tractorBeamDamage: number;
  tractorMissileDamage: number;
  pawBombDirectDamage: number;
  pawBombSplashDamage: number;
  siEnemyBulletDamage: number;
  siBossBulletDamage: number;
  safezoneDamage: number;

  // YouTube music video ID
  youtubeVideoId: string;
}

// Paw Bomb constants (tractor beam hazard)
const PAW_BOMB_INTERVAL = 3500; // ms between paw bomb spawns
const PAW_BOMB_SHOW_DURATION = 900; // ms the paw is visible at 80% opacity
const PAW_BOMB_HIDE_DURATION = 500; // ms the paw is hidden before explosion
const PAW_BOMB_EXPLODE_DURATION = 600; // ms the explosion lasts
const PAW_BOMB_SIZE = 40; // pixel size of the paw image
const PAW_BOMB_EXPLOSION_RADIUS = 50; // pixel radius of explosion
const PAW_BOMB_DIRECT_DAMAGE = 22; // damage from direct paw hit
const PAW_BOMB_SPLASH_DAMAGE = 4; // damage from explosion splash
const PAW_BOMB_FIRST_DELAY = 2500; // delay before first paw bomb

interface PawBomb {
  x: number;
  y: number;
  spawnTime: number; // elapsed ms when spawned
  phase: "show" | "hide" | "explode" | "done";
  damaged: boolean; // whether this bomb already dealt damage
  splashDamaged: boolean; // whether splash already dealt damage
}

// Attack mode types
type AttackMode = "normal" | "spaceInvaders" | "bulletStorm" | "tractorBeam" | "phase2Stage";
const ATTACK_MODE_LABELS: Record<AttackMode, string> = {
  normal: "Normal (Beam Waves)",
  spaceInvaders: "Space Invaders",
  bulletStorm: "Bullet Storm",
  tractorBeam: "Tractor Beam",
  phase2Stage: "Phase 2: STAGE",
};

// Space Invaders constants
const SI_ALIEN_W = 40;
const SI_ALIEN_H = 34;
const SI_GAP_X = 6;
const SI_GAP_Y = 6;
const SI_MOVE_SPEED = 0.9;
const SI_DROP_STEP = 12;
const SI_SHOOT_INTERVAL = 600; // ms between enemy shots (50% less frequent)
const SI_PLAYER_BULLET_SPEED = 5;
const SI_PLAYER_AUTO_SHOOT_INTERVAL = 140; // ms between auto-shots (2x faster)
const SI_ENEMY_BULLET_SPEED = 2.25; // 25% slower
const SI_BULLET_W = 4;
const SI_BULLET_H = 10;
const SI_DURATION = 30000;
const SI_ENEMY_BULLET_DAMAGE = 8;
const SI_BOTTOM_EXPLODE_DAMAGE = 12; // damage when alien explodes at bottom

// Alien type constants
type SIAlienType = "normal" | "fast" | "heavy";
const SI_FAST_ALIEN_W = 30;
const SI_FAST_ALIEN_H = 26;
const SI_HEAVY_ALIEN_W = 48;
const SI_HEAVY_ALIEN_H = 40;
const SI_FAST_MOVE_BONUS = 0.8; // extra speed for fast aliens
const SI_HEAVY_HP = 3; // hits to kill heavy alien
const SI_FAST_SCORE = 25;
const SI_HEAVY_SCORE = 40;

// Boss Gnarpy (Wave 3) constants
const SI_BOSS_W = 120;
const SI_BOSS_H = 100;
const SI_BOSS_HP = 30;
const SI_BOSS_MOVE_SPEED = 0.8;
const SI_BOSS_SHOOT_INTERVAL = 1400; // faster boss firing
const SI_BOSS_SPREAD_COUNT = 5; // bullets in a spread shot
const SI_BOSS_SPREAD_ANGLE = Math.PI / 4; // total spread arc
const SI_BOSS_RAPID_INTERVAL = 220; // faster rapid fire
const SI_BOSS_RAPID_BURST = 5; // more shots per burst
const SI_BOSS_DIVE_BOMB_INTERVAL = 5000; // ms between mini-ship drops
const SI_BOSS_BULLET_SPEED = 2.8; // faster boss bullets
const SI_BOSS_BULLET_DAMAGE = 10;
const SI_BOSS_SCORE = 300;
const SI_BOSS_MINISHIP_W = 28;
const SI_BOSS_MINISHIP_H = 24;
const SI_BOSS_MINISHIP_SPEED = 2.0;
const SI_BOSS_MINISHIP_HP = 1;

type SIBossAttackType = "spread" | "rapid" | "diveBomb";

interface SIBoss {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  dir: number;
  attackTimer: number;
  attackType: SIBossAttackType;
  attackCycle: number;
  rapidBurstRemaining: number;
  rapidBurstTimer: number;
  diveBombTimer: number;
  alive: boolean;
  hitFlash: number;
}

interface SIMiniShip {
  x: number;
  y: number;
  vy: number;
  hp: number;
  alive: boolean;
  shootTimer: number;
}

// Explosion particle for alien bottom-explosion effect
interface SIExplosion {
  x: number;
  y: number;
  timer: number; // ms remaining
  maxTimer: number;
}
const SI_EXPLOSION_DURATION = 400; // ms

// Bullet Storm constants
const BS_BULLET_DURATION_MIN = 20000; // 20s min bullet phase
const BS_BULLET_DURATION_MAX = 30000; // 30s max bullet phase
const BS_PRE_WARNING_DURATION = 3000; // 3s safe zone at start
const BS_WARNING_DURATION = 1000; // 1s warning before beam
const BS_BEAM_DURATION = 1000; // beam lasts 1s
const BS_SPAWN_INTERVAL = 12; // ms between spawning batches — very fast
const BS_BATCH_SIZE = 4; // projectiles per batch
const BS_PROJ_SPEED_MIN = 1.2;
const BS_PROJ_SPEED_MAX = 3.0;
const BS_PROJ_SIZE = 3; // pixel size of each projectile
const BS_SAFE_RADIUS = 40; // px from center — projectiles die before reaching this
const BS_DAMAGE = 25; // damage per hit (5x)
const BS_DAMAGE_INTERVAL = 400; // ms between damage ticks from storm
const BS_BEAM_WIDTH_RATIO = 0.85; // beam covers 85% of box width
const BS_BEAM_DAMAGE = 100; // massive beam damage

// Tractor Beam constants
const TB_DURATION = 25000; // 25 seconds total
const TB_SAUCER_W = 160;
const TB_SAUCER_H = 112;
const TB_SAUCER_Y = 10; // saucer vertical position (near top)
const TB_SAUCER_SPEED = 1.2; // base horizontal speed (pixels per frame tick)
const TB_BEAM_WIDTH_RATIO = 1 / 3; // beam covers 1/3 of box width
const TB_PULL_STRENGTH = 6.3; // pixels per frame of upward pull (10% weaker)
const TB_DAMAGE = 12; // damage per tick when pulled to top
const TB_DAMAGE_INTERVAL = 400; // ms between damage ticks
const TB_DIRECTION_CHANGE_MIN = 1500; // min ms before saucer changes direction
const TB_DIRECTION_CHANGE_MAX = 3500; // max ms before saucer changes direction
const TB_MISSILE_INTERVAL = 1800; // ms between missile launches
const TB_MISSILE_SPEED = 0.0006; // t progress per ms along Bezier curve
const TB_MISSILE_HOMING = 0.02; // how much control points adjust toward player per frame
const TB_MISSILE_DAMAGE = 8;
const TB_MISSILE_RADIUS = 6;

interface TBMissile {
  t: number; // progress along curve 0-1
  x: number;
  y: number;
  // Cubic bezier: P0 (start), P1/P2 (control), P3 (target)
  p0x: number; p0y: number;
  p1x: number; p1y: number;
  p2x: number; p2y: number;
  p3x: number; p3y: number;
  trail: { x: number; y: number }[];
  spawnTime: number; // timestamp (elapsed ms) when missile was created
}

interface BSProjectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number; // remaining distance to travel before fading
  maxLife: number;
}

// Random formations: each is an array of {col, row} grid positions
const SI_FORMATIONS: { col: number; row: number }[][] = [
  // 0: Classic grid 5x3
  (() => {
    const f: { col: number; row: number }[] = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) f.push({ col: c, row: r });
    return f;
  })(),
  // 1: V shape
  [
    { col: 2, row: 0 },
    { col: 1, row: 1 }, { col: 3, row: 1 },
    { col: 0, row: 2 }, { col: 2, row: 2 }, { col: 4, row: 2 },
    { col: 0, row: 3 }, { col: 4, row: 3 },
  ],
  // 2: Diamond
  [
    { col: 2, row: 0 },
    { col: 1, row: 1 }, { col: 3, row: 1 },
    { col: 0, row: 2 }, { col: 2, row: 2 }, { col: 4, row: 2 },
    { col: 1, row: 3 }, { col: 3, row: 3 },
    { col: 2, row: 4 },
  ],
  // 3: Cross / plus
  [
    { col: 2, row: 0 },
    { col: 2, row: 1 },
    { col: 0, row: 2 }, { col: 1, row: 2 }, { col: 2, row: 2 }, { col: 3, row: 2 }, { col: 4, row: 2 },
    { col: 2, row: 3 },
    { col: 2, row: 4 },
  ],
  // 4: Zigzag offset
  [
    { col: 0, row: 0 }, { col: 2, row: 0 }, { col: 4, row: 0 },
    { col: 1, row: 1 }, { col: 3, row: 1 },
    { col: 0, row: 2 }, { col: 2, row: 2 }, { col: 4, row: 2 },
    { col: 1, row: 3 }, { col: 3, row: 3 },
  ],
  // 5: Arrow pointing down
  [
    { col: 0, row: 0 }, { col: 1, row: 0 }, { col: 2, row: 0 }, { col: 3, row: 0 }, { col: 4, row: 0 },
    { col: 1, row: 1 }, { col: 2, row: 1 }, { col: 3, row: 1 },
    { col: 2, row: 2 },
  ],
  // 6: Inverted V (caret)
  [
    { col: 2, row: 0 },
    { col: 1, row: 1 }, { col: 3, row: 1 },
    { col: 0, row: 2 }, { col: 4, row: 2 },
    { col: 0, row: 3 }, { col: 4, row: 3 },
  ],
  // 7: Two columns (walls)
  [
    { col: 0, row: 0 }, { col: 4, row: 0 },
    { col: 0, row: 1 }, { col: 4, row: 1 },
    { col: 0, row: 2 }, { col: 4, row: 2 },
    { col: 0, row: 3 }, { col: 4, row: 3 },
  ],
  // 8: Checkerboard
  [
    { col: 0, row: 0 }, { col: 2, row: 0 }, { col: 4, row: 0 },
    { col: 1, row: 1 }, { col: 3, row: 1 },
    { col: 0, row: 2 }, { col: 2, row: 2 }, { col: 4, row: 2 },
  ],
  // 9: H shape
  [
    { col: 0, row: 0 }, { col: 4, row: 0 },
    { col: 0, row: 1 }, { col: 4, row: 1 },
    { col: 0, row: 2 }, { col: 1, row: 2 }, { col: 2, row: 2 }, { col: 3, row: 2 }, { col: 4, row: 2 },
    { col: 0, row: 3 }, { col: 4, row: 3 },
    { col: 0, row: 4 }, { col: 4, row: 4 },
  ],
  // 10: Diagonal slash
  [
    { col: 4, row: 0 },
    { col: 3, row: 1 },
    { col: 2, row: 2 },
    { col: 1, row: 3 },
    { col: 0, row: 4 },
  ],
  // 11: Square outline
  [
    { col: 0, row: 0 }, { col: 1, row: 0 }, { col: 2, row: 0 }, { col: 3, row: 0 }, { col: 4, row: 0 },
    { col: 0, row: 1 }, { col: 4, row: 1 },
    { col: 0, row: 2 }, { col: 4, row: 2 },
    { col: 0, row: 3 }, { col: 1, row: 3 }, { col: 2, row: 3 }, { col: 3, row: 3 }, { col: 4, row: 3 },
  ],
];

interface SIAlien {
  col: number;
  row: number;
  alive: boolean;
  x: number;
  y: number;
  type: SIAlienType;
  hp: number;
}
interface SIBullet {
  x: number;
  y: number;
  dy: number; // negative = player bullet (up), positive = enemy bullet (down)
  dx?: number; // optional horizontal velocity for angled shots
  isPlayer: boolean;
}

const BOX_W = 300;
const BOX_H = 300;
const PLAYER_MAX_HP = 101;
const BOSS_MAX_HP = 200;
const PLAYER_SIZE = 16;
const PLAYER_SPEED = 3.5;
const ATTACK_DURATION = 21500;
const MINI_IMG_SIZE = 45;
const IFRAMES_DURATION = 800;
const BEAM_DAMAGE = 16;
const BEAM_THICKNESS = 18;
const CHARGE_TIME = 700;
const BEAM_LINGER = 650;
const WARN_TIME = 400;
const BORDER_W = 3;
const TARGET_FRAME_MS = 1000 / 60;

// Spiral attack constants
const SPIRAL_COUNT = 12; // beams in the spiral
const SPIRAL_DELAY = 130; // ms between each spiral beam
const SPIRAL_CHARGE = 350; // faster charge for spiral
const SPIRAL_BEAM_LINGER = 400; // shorter beam for spiral
const SPIRAL_START_OFFSET = 4200; // ms into attack when spiral begins

// Sweep attack constants (Wave 3 — directional chase pattern)
const SWEEP_BEAMS_PER_SIDE = 8; // beams per side (last one skipped = safe zone)
const SWEEP_LOOPS = 1; // number of full up→left→down→right cycles
const SWEEP_DELAY = 90; // ms between each sweep beam
const SWEEP_SIDE_GAP = 350; // ms pause between each side's volley
const SWEEP_CHARGE = 180; // very fast charge
const SWEEP_BEAM_LINGER = 500; // linger long enough to force movement
const SWEEP_WARN = 150; // brief warning
const SWEEP_START_OFFSET = 7000; // ms into attack when sweep begins

// Rotating beam constants (Wave 4 — continuous rotating laser)
const ROTATE_START_OFFSET = 12000; // ms into attack when rotating beam begins
const ROTATE_DURATION = 5000; // how long the rotating beam lasts
// One full 360° sweep over ROTATE_DURATION
const ROTATE_BEAM_DAMAGE = 12; // damage per hit from rotating beam

// Wave 5: Safe zone flash — small red safe box, then lasers everywhere else
const SAFEZONE_START_OFFSET = 17500; // ms into attack when safe zone appears
const SAFEZONE_WARN_TIME = 1000; // 1 second warning before lasers fire
const SAFEZONE_LASER_DURATION = 2000; // how long the lasers stay active
const SAFEZONE_BOX_SIZE = 50; // size of the safe zone box
const SAFEZONE_DAMAGE = 10; // damage per tick if outside safe zone
const SAFEZONE_TICK_INTERVAL = 300; // ms between damage ticks

const COL = {
  soul: "#FF0000",
  boxBorder: "#FFFFFF",
  boxBg: "#000000",
  bossHp: "#00FF00",
  bossHpBg: "#333333",
  playerHp: "#FFFF00",
  text: "#FFFFFF",
};

type GamePhase =
  | "playerTurn"
  | "fightAnim"
  | "actMenu"
  | "itemMenu"
  | "textDisplay"
  | "bossAttack"
  | "gameOver"
  | "victory"
  | "phase2Cinematic"
  | "frustrationVictory";

const ACT_OPTIONS = [
  { name: "Do Nothing", key: "nothing" },
  { name: "Do a little dance", key: "dance" },
  { name: "Pray to the dice bot", key: "pray" },
  { name: "Throw some Food", key: "throwfood" },
  { name: "Scavenge for food in the fridge", key: "scavenge" },
];

type MiniSide = "top" | "bottom" | "left" | "right";
type MiniState = "waiting" | "appearing" | "warning" | "charging" | "firing" | "done";

interface MiniGnarpy {
  id: number;
  side: MiniSide;
  pos: number; // 0-1 along the side
  state: MiniState;
  timer: number;
  isSpiral?: boolean; // spiral beams have faster timing
  waveType?: "normal" | "spiral" | "sweep"; // which wave this belongs to
}

const idleAnimCSS = `
@keyframes bossBreathe {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.03); }
}
@keyframes bossGlowGreen {
  0% { filter: brightness(1) drop-shadow(0 0 0px transparent); }
  25% { filter: brightness(1.8) drop-shadow(0 0 25px #00FF00) drop-shadow(0 0 50px #00FF00); }
  50% { filter: brightness(2.2) drop-shadow(0 0 35px #00FF00) drop-shadow(0 0 70px #00AA00); }
  75% { filter: brightness(1.8) drop-shadow(0 0 25px #00FF00) drop-shadow(0 0 50px #00FF00); }
  100% { filter: brightness(1) drop-shadow(0 0 0px transparent); }
}
@keyframes bossDodge {
  0% { transform: scale(1) translateX(0); }
  20% { transform: scale(0.95) translateX(40px); }
  40% { transform: scale(1.02) translateX(40px); }
  60% { transform: scale(1) translateX(40px); }
  80% { transform: scale(1) translateX(10px); }
  100% { transform: scale(1) translateX(0); }
}
@keyframes bossDistracted {
  0%, 100% { transform: rotate(0deg); }
  25% { transform: rotate(-5deg); }
  75% { transform: rotate(5deg); }
}
@keyframes resultFlash {
  0% { opacity: 0; transform: scale(0.5); }
  50% { opacity: 1; transform: scale(1.2); }
  100% { opacity: 1; transform: scale(1); }
}
@keyframes bossVanish {
  0% { opacity: 1; transform: scale(1); }
  100% { opacity: 0; transform: scale(0.3); }
}
@keyframes bossAppear {
  0% { opacity: 0; transform: scale(0.3); }
  100% { opacity: 1; transform: scale(1); }
}
@keyframes miniPopIn {
  0% { opacity: 0; transform: scale(0); }
  60% { opacity: 1; transform: scale(1.2); }
  100% { opacity: 1; transform: scale(1); }
}
@keyframes miniFadeOut {
  0% { opacity: 1; }
  100% { opacity: 0; transform: scale(0.4); }
}
@keyframes miniChargeFlash {
  0%, 100% { filter: brightness(1) drop-shadow(0 0 4px rgba(0,255,0,0.3)); }
  50% { filter: brightness(2.5) drop-shadow(0 0 18px #00FF00) drop-shadow(0 0 30px #00FF00); }
}
@keyframes miniFiringGlow {
  0%, 100% { filter: brightness(2) drop-shadow(0 0 20px #00FF00); }
  50% { filter: brightness(3) drop-shadow(0 0 30px #00FF00) drop-shadow(0 0 50px #00FF00); }
}
@keyframes beamExpand {
  0% { transform: scaleY(0.2); opacity: 0.5; }
  15% { transform: scaleY(1.3); opacity: 1; }
  25% { transform: scaleY(1); opacity: 1; }
  80% { transform: scaleY(1); opacity: 1; }
  100% { transform: scaleY(0.3); opacity: 0; }
}
@keyframes safeZonePulse {
  0%, 100% { box-shadow: 0 0 8px 2px rgba(255,0,0,0.6), inset 0 0 6px rgba(255,0,0,0.3); }
  50% { box-shadow: 0 0 20px 6px rgba(255,0,0,1), inset 0 0 12px rgba(255,0,0,0.6); }
}
@keyframes laserFlash {
  0% { opacity: 0; }
  10% { opacity: 0.95; }
  50% { opacity: 0.85; }
  90% { opacity: 0.95; }
  100% { opacity: 0; }
}
@keyframes laserScanline {
  0% { background-position: 0 0; }
  100% { background-position: 0 10px; }
}
@keyframes beamExpandH {
  0% { transform: scaleX(0.2); opacity: 0.5; }
  15% { transform: scaleX(1.3); opacity: 1; }
  25% { transform: scaleX(1); opacity: 1; }
  80% { transform: scaleX(1); opacity: 1; }
  100% { transform: scaleX(0.3); opacity: 0; }
}
`;

export function BossFight({
  onBack,
  onScoreSave,
  config: userConfig,
}: {
  onBack: () => void;
  onScoreSave?: (score: number) => void;
  config?: Partial<BossFightConfig>;
}) {
  // Merge user config with defaults
  const cfg: BossFightConfig = {
    bossName: userConfig?.bossName ?? "GNARPY OF DOOM",
    bossMaxHp: userConfig?.bossMaxHp ?? BOSS_MAX_HP,
    playerMaxHp: userConfig?.playerMaxHp ?? PLAYER_MAX_HP,
    startingFood: userConfig?.startingFood ?? 1,
    phase2Enabled: userConfig?.phase2Enabled ?? false,
    phase2BossHp: userConfig?.phase2BossHp ?? 300,
    phase2DamageMultiplier: userConfig?.phase2DamageMultiplier ?? 1.5,
    phase2SpeedMultiplier: userConfig?.phase2SpeedMultiplier ?? 1.25,
    phase2TransitionText: userConfig?.phase2TransitionText ?? "* The boss powers up!\n* This isn't even their final form!",
    phase2BossName: userConfig?.phase2BossName ?? "GNARPY UNLEASHED",
    phase2Placeholder: userConfig?.phase2Placeholder ?? false,
    phase2Colors: userConfig?.phase2Colors ?? { bg: "#000", accent: "#FF00FF", text: "#FFF" },
    beamDamage: userConfig?.beamDamage ?? BEAM_DAMAGE,
    rotateBeamDamage: userConfig?.rotateBeamDamage ?? ROTATE_BEAM_DAMAGE,
    bulletStormDamage: userConfig?.bulletStormDamage ?? BS_DAMAGE,
    bulletStormBeamDamage: userConfig?.bulletStormBeamDamage ?? BS_BEAM_DAMAGE,
    tractorBeamDamage: userConfig?.tractorBeamDamage ?? TB_DAMAGE,
    tractorMissileDamage: userConfig?.tractorMissileDamage ?? TB_MISSILE_DAMAGE,
    pawBombDirectDamage: userConfig?.pawBombDirectDamage ?? PAW_BOMB_DIRECT_DAMAGE,
    pawBombSplashDamage: userConfig?.pawBombSplashDamage ?? PAW_BOMB_SPLASH_DAMAGE,
    siEnemyBulletDamage: userConfig?.siEnemyBulletDamage ?? SI_ENEMY_BULLET_DAMAGE,
    siBossBulletDamage: userConfig?.siBossBulletDamage ?? SI_BOSS_BULLET_DAMAGE,
    safezoneDamage: userConfig?.safezoneDamage ?? SAFEZONE_DAMAGE,
    youtubeVideoId: userConfig?.youtubeVideoId ?? "BPwvV1V1S8Y",
  };

  // Phase 2 state
  const [bossPhase, setBossPhase] = useState(1);
  const bossPhaseRef = useRef(1);
  useEffect(() => { bossPhaseRef.current = bossPhase; }, [bossPhase]);

  // Damage/speed multiplier based on boss phase
  const getDmgMult = useCallback(() => bossPhaseRef.current === 2 ? cfg.phase2DamageMultiplier : 1, [cfg.phase2DamageMultiplier]);
  const getSpdMult = useCallback(() => bossPhaseRef.current === 2 ? cfg.phase2SpeedMultiplier : 1, [cfg.phase2SpeedMultiplier]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  // Fullscreen support
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  // Phase 2 background stars — generated once
  const p2BgStars = useMemo(() => {
    const stars: { x: number; y: number; size: number; color: string; twinkleSpeed: number; twinklePhase: number }[] = [];
    for (let i = 0; i < 120; i++) {
      stars.push({
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: Math.random() * 2.5 + 0.8,
        color: Math.random() > 0.5 ? "#23ac38" : "#86cecb",
        twinkleSpeed: Math.random() * 2 + 0.8,
        twinklePhase: Math.random() * Math.PI * 2,
      });
    }
    return stars;
  }, []);

  const [phase, setPhase] = useState<GamePhase>("playerTurn");
  const [playerHp, setPlayerHp] = useState(cfg.playerMaxHp);
  const [bossHp, setBossHp] = useState(cfg.bossMaxHp);
  const [score, setScore] = useState(0);
  const [foodCount, setFoodCount] = useState(cfg.startingFood);
  const [displayText, setDisplayText] = useState("");
  const [displayedChars, setDisplayedChars] = useState(0);
  const [textDone, setTextDone] = useState(false);
  const [selectedAction, setSelectedAction] = useState(0);
  const [selectedAct, setSelectedAct] = useState(0);
  const [selectedItem, setSelectedItem] = useState(0);
  const [bossHitGlow, setBossHitGlow] = useState(false);
  const [bossDodging, setBossDodging] = useState(false);
  const [bossDistracted, setBossDistracted] = useState(false);
  const [bossVisible, setBossVisible] = useState(true);
  const [bossVanishing, setBossVanishing] = useState(false);
  const [bossAppearing, setBossAppearing] = useState(false);
  const [bossIdleOffset, setBossIdleOffset] = useState({ x: 0, y: 0 });
  const [turnCount, setTurnCount] = useState(0);

  // Fight anim state
  const [fightBarPos, setFightBarPos] = useState(0);
  const [fightBarDir, setFightBarDir] = useState(1);
  const [fightBarStopped, setFightBarStopped] = useState(false);
  const [fightBarSpeed, setFightBarSpeed] = useState(3.5);

  // Boss attack state
  const miniGnarpysRef = useRef<MiniGnarpy[]>([]);
  const [miniGnarpysRender, setMiniGnarpysRender] = useState<MiniGnarpy[]>([]);
  const playerPosRef = useRef({ x: BOX_W / 2, y: BOX_H / 2 });
  const keysRef = useRef<Set<string>>(new Set());
  const iframesRef = useRef(0);

  // Debug attack picker
  const [debugAttackMode, setDebugAttackMode] = useState<AttackMode | "auto">("auto");
  const [currentAttackMode, setCurrentAttackMode] = useState<AttackMode>("normal");
  const debugAttackModeRef = useRef<AttackMode | "auto">("auto");
  const turnCountRef = useRef(0);

  // Phase 2 debug controls & embedded battle box
  const phase2Ref = useRef<Phase2DebugHandle>(null);
  const [p2DebugState, setP2DebugState] = useState<Phase2DebugState>({ isAttacking: false, currentAttack: "idle", demoMode: false, loopingAttack: null });
  const [debugNextP2Attack, setDebugNextP2Attack] = useState<string>("stage");
  const debugOverrideNextRef = useRef<string | null>(null); // override next attack in natural sequence
  const [debugOverrideNext, setDebugOverrideNext] = useState<string | null>(null); // UI mirror
  const phase2TurnCountRef = useRef(0); // tracks turns within Phase 2 for attack selection
  const [p2AttackName, setP2AttackName] = useState("stage"); // which Phase 2 attack to auto-start
  const p2AttackNameRef = useRef("stage"); // ref mirror for callbacks
  const startBossAttackRef = useRef<(() => void) | null>(null); // TDZ fix: ref for advanceAfterText
  const [frustVictoryFade, setFrustVictoryFade] = useState(0); // 0→1 fade for frustration victory
  const frustDialogueShownRef = useRef(false); // ensures frustration pre-dialogue only shows once

  // ── Phase 2 Cinematic ("Miku, Gnarpy, Beam!!!!") ──
  const [cinematicStep, setCinematicStep] = useState(-1); // -1 = stars only, 0-4 = text boxes
  const [cinematicFade, setCinematicFade] = useState(0); // 0→1 fade in
  const cinematicStarsRef = useRef<{ x: number; y: number; size: number; color: string; speed: number; twinkleSpeed: number; twinklePhase: number }[]>([]);

  // ── Resolve system (Phase 2 only) ─���
  const RESOLVE_MAX = 240;
  const RESOLVE_DRAIN_RATE = 30; // per second — 8s total shield
  const [resolve, setResolve] = useState(RESOLVE_MAX);
  const [resolveActive, setResolveActive] = useState(false);
  const [resolveRefilling, setResolveRefilling] = useState(false);
  const resolveRefillTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resolveRef = useRef(RESOLVE_MAX);
  const resolveActiveRef = useRef(false);
  // resolveRef is now updated directly in the drain loop — only sync from setState calls (refill etc.)
  useEffect(() => { resolveRef.current = resolve; }, [resolve]);
  useEffect(() => { resolveActiveRef.current = resolveActive; }, [resolveActive]);

  // Keep refs in sync
  useEffect(() => { debugAttackModeRef.current = debugAttackMode; }, [debugAttackMode]);
  useEffect(() => { turnCountRef.current = turnCount; }, [turnCount]);

  // Space Invaders state
  const siAliensRef = useRef<SIAlien[]>([]);
  const siBulletsRef = useRef<SIBullet[]>([]);
  const siDirRef = useRef(1); // 1 = right, -1 = left
  const siLastShootRef = useRef(0);
  const siPlayerCanShootRef = useRef(true);
  const siShootKeyRef = useRef(false);
  const siAlienImgRef = useRef<HTMLImageElement | null>(null);
  const siAutoShootTimerRef = useRef(0);
  const siExplosionsRef = useRef<SIExplosion[]>([]);
  const siWaveRef = useRef(1); // Track current wave (1, 2, or 3)
  const siWaveTextRef = useRef(0); // Timer for "WAVE X" text display
  const siBossRef = useRef<SIBoss | null>(null); // Wave 3 boss
  const siMiniShipsRef = useRef<SIMiniShip[]>([]); // Wave 3 mini-ships from dive bomb

  // Bullet Storm refs
  const bsProjectilesRef = useRef<BSProjectile[]>([]);
  const bsSpawnTimerRef = useRef(0);
  const bsDamageTimerRef = useRef(0);

  // Tractor Beam refs
  const tbSaucerXRef = useRef(BOX_W / 2); // saucer center x
  const tbSaucerDirRef = useRef(1); // 1 = right, -1 = left
  const tbNextDirChangeRef = useRef(0); // ms until next direction change
  const tbDamageTimerRef = useRef(0); // damage tick timer
  const tbSaucerElRef = useRef<HTMLDivElement | null>(null);
  const tbMissilesRef = useRef<TBMissile[]>([]);
  const tbMissileTimerRef = useRef(0);
  const tbPawBombsRef = useRef<PawBomb[]>([]);
  const tbPawBombTimerRef = useRef(0);
  const pawImgRef = useRef<HTMLImageElement | null>(null);

  // Preload paw image
  useEffect(() => {
    const img = new Image();
    img.src = pawImg;
    img.onload = () => { pawImgRef.current = img; };
  }, []);

  // Preload alien ship image
  useEffect(() => {
    const img = new Image();
    img.src = alienShipImg;
    img.onload = () => { siAlienImgRef.current = img; };
  }, []);

  // Rotating beam state (Wave 4 — circular sweep like a clock hand)
  const rotatingBeamRef = useRef<{ angle: number; active: boolean }>({ angle: 0, active: false });
  const [rotatingBeamRender, setRotatingBeamRender] = useState<{ angle: number; active: boolean }>({ angle: 0, active: false });

  // Wave 5: Safe zone flash state
  const safeZoneRef = useRef<{ x: number; y: number; active: boolean; lasersOn: boolean; lastDamageTick: number }>({
    x: 0, y: 0, active: false, lasersOn: false, lastDamageTick: 0
  });
  const [safeZoneRender, setSafeZoneRender] = useState<{ x: number; y: number; active: boolean; lasersOn: boolean }>({
    x: 0, y: 0, active: false, lasersOn: false
  });

  const [highScore, setHighScore] = useState(() =>
    parseInt(safeGetItem("inet-bossfight-highscore") || "0", 10)
  );

  // Music state
  const [isMuted, setIsMuted] = useState(() => {
    return safeGetItem("inet-bossfight-muted") === "true";
  });
  const [musicVolume, setMusicVolume] = useState(() => {
    const saved = safeGetItem("inet-bossfight-volume");
    return saved ? parseInt(saved, 10) : 40;
  });
  const ytPlayerRef = useRef<any>(null);
  const ytContainerRef = useRef<HTMLDivElement>(null);

  // Inject CSS
  useEffect(() => {
    const id = "boss-breathe-anim";
    if (!document.getElementById(id)) {
      const style = document.createElement("style");
      style.id = id;
      style.textContent = idleAnimCSS;
      document.head.appendChild(style);
    }
  }, []);

  // YouTube IFrame API for background music
  useEffect(() => {
    const YOUTUBE_VIDEO_ID = cfg.youtubeVideoId;

    // Load the YouTube IFrame API script if not already loaded
    const loadYTApi = (): Promise<void> => {
      return new Promise((resolve) => {
        if ((window as any).YT && (window as any).YT.Player) {
          resolve();
          return;
        }
        const existing = document.getElementById("yt-iframe-api");
        if (existing) {
          // Script is loading, wait for callback
          const prevCb = (window as any).onYouTubeIframeAPIReady;
          (window as any).onYouTubeIframeAPIReady = () => {
            if (prevCb) prevCb();
            resolve();
          };
          return;
        }
        const tag = document.createElement("script");
        tag.id = "yt-iframe-api";
        tag.src = "https://www.youtube.com/iframe_api";
        (window as any).onYouTubeIframeAPIReady = () => resolve();
        document.head.appendChild(tag);
      });
    };

    let cancelled = false;

    loadYTApi().then(() => {
      if (cancelled || !ytContainerRef.current) return;
      // Create a unique div for the player inside our container
      const playerDiv = document.createElement("div");
      playerDiv.id = "yt-boss-music-" + Date.now();
      ytContainerRef.current.appendChild(playerDiv);

      const player = new (window as any).YT.Player(playerDiv.id, {
        height: "1",
        width: "1",
        videoId: YOUTUBE_VIDEO_ID,
        playerVars: {
          autoplay: 1,
          loop: 1,
          playlist: YOUTUBE_VIDEO_ID, // Required for looping
          controls: 0,
          disablekb: 1,
          fs: 0,
          modestbranding: 1,
          rel: 0,
        },
        events: {
          onReady: (event: any) => {
            if (cancelled) return;
            ytPlayerRef.current = event.target;
            event.target.setVolume(musicVolume);
            if (isMuted) {
              event.target.mute();
            } else {
              event.target.unMute();
            }
            event.target.playVideo();
          },
        },
      });
    });

    return () => {
      cancelled = true;
      if (ytPlayerRef.current) {
        try { ytPlayerRef.current.destroy(); } catch {}
        ytPlayerRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync mute state to YouTube player
  useEffect(() => {
    safeSetItem("inet-bossfight-muted", String(isMuted));
    if (ytPlayerRef.current) {
      try {
        if (isMuted) {
          ytPlayerRef.current.mute();
        } else {
          ytPlayerRef.current.unMute();
        }
      } catch {}
    }
  }, [isMuted]);

  // Sync volume to YouTube player
  useEffect(() => {
    safeSetItem("inet-bossfight-volume", String(musicVolume));
    if (ytPlayerRef.current) {
      try { ytPlayerRef.current.setVolume(musicVolume); } catch {}
    }
  }, [musicVolume]);

  const toggleMute = useCallback(() => {
    setIsMuted((m) => !m);
  }, []);

  // Key handlers for menu navigation
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (phase === "playerTurn") {
        if (e.key === "ArrowLeft" || e.key === "a") setSelectedAction((p) => Math.max(0, p - 1));
        else if (e.key === "ArrowRight" || e.key === "d") setSelectedAction((p) => Math.min(3, p + 1));
      }
      if (phase === "actMenu") {
        if (e.key === "ArrowUp" || e.key === "w") setSelectedAct((p) => Math.max(0, p - 1));
        else if (e.key === "ArrowDown" || e.key === "s") setSelectedAct((p) => Math.min(ACT_OPTIONS.length - 1, p + 1));
        else if (e.key === "x" || e.key === "Escape") setPhase("playerTurn");
      }
      if (phase === "itemMenu" && (e.key === "x" || e.key === "Escape")) setPhase("playerTurn");
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [phase]);

  // Movement key tracking for boss attack phase
  useEffect(() => {
    if (phase !== "bossAttack") return;
    const down = (e: KeyboardEvent) => {
      e.preventDefault();
      keysRef.current.add(e.key.toLowerCase());
    };
    const up = (e: KeyboardEvent) => keysRef.current.delete(e.key.toLowerCase());
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      keysRef.current.clear();
    };
  }, [phase]);

  const showText = useCallback((text: string) => {
    setDisplayText(text);
    setDisplayedChars(0);
    setTextDone(false);
    setPhase("textDisplay");
  }, []);

  useEffect(() => {
    if (phase !== "textDisplay") return;
    if (displayedChars >= displayText.length) { setTextDone(true); return; }
    const t = setTimeout(() => setDisplayedChars((c) => c + 1), 30);
    return () => clearTimeout(t);
  }, [phase, displayedChars, displayText]);

  const advanceAfterText = useCallback(() => {
    if (bossHp <= 0) {
      // Phase 2 transition: if phase2 is enabled and we're still in phase 1
      // → Start the "Miku, Gnarpy, Beam!!!!" cinematic
      if (cfg.phase2Enabled && bossPhaseRef.current === 1) {
        // Generate stars for the cinematic
        const stars: typeof cinematicStarsRef.current = [];
        for (let i = 0; i < 80; i++) {
          stars.push({
            x: Math.random() * 100,
            y: Math.random() * 100,
            size: Math.random() * 3 + 1,
            color: Math.random() > 0.5 ? "#23ac38" : "#86cecb",
            speed: Math.random() * 0.3 + 0.1,
            twinkleSpeed: Math.random() * 2 + 1,
            twinklePhase: Math.random() * Math.PI * 2,
          });
        }
        cinematicStarsRef.current = stars;
        setCinematicStep(-1);
        setCinematicFade(0);
        setBossVisible(false);
        setPhase("phase2Cinematic");
        // Trigger fade-in on next frame
        requestAnimationFrame(() => setCinematicFade(1));
        // Badge unlock: beating Buu stage 1 awards Gnarpy
        addOwnedSticker("gnarpy");
        return;
      }
      // Actual victory
      setBossVisible(true);
      setPhase("victory");
      const finalScore = score + (bossPhaseRef.current === 2 ? 1000 : 500);
      setScore(finalScore);
      if (finalScore > highScore) {
        safeSetItem("inet-bossfight-highscore", String(finalScore));
        setHighScore(finalScore);
      }
      onScoreSave?.(finalScore);
      // Badge unlocks on victory
      addOwnedSticker("gnarpy"); // normal mode or Buu stage 1
      if (bossPhaseRef.current === 2) {
        addOwnedSticker("gnarpy-miku"); // Buu stage 2
      }
      return;
    }
    startBossAttackRef.current?.();
  }, [bossHp, score, highScore, onScoreSave, cfg.phase2Enabled, cfg.phase2BossHp, cfg.phase2TransitionText, showText]);

  // Auto-advance text display after 3 seconds once typing finishes
  useEffect(() => {
    if (phase !== "textDisplay" || !textDone) return;
    const t = setTimeout(() => {
      advanceAfterText();
    }, 3000);
    return () => clearTimeout(t);
  }, [phase, textDone, advanceAfterText]);

  // ── Phase 2 Cinematic: advance to next step (or finish) ──
  const cinematicAdvance = useCallback(() => {
    if (phase !== "phase2Cinematic") return;
    const nextStep = cinematicStep + 1;
    if (nextStep > 4) {
      // Cinematic complete → transition to Phase 2
      setBossPhase(2);
      bossPhaseRef.current = 2;
      setBossHp(cfg.phase2BossHp);
      phase2TurnCountRef.current = 0;
      setResolve(RESOLVE_MAX);
      setResolveActive(false);
      setBossVisible(true);
      setBossHitGlow(true);
      setTimeout(() => setBossHitGlow(false), 1200);
      showText(cfg.phase2TransitionText);
    } else {
      setCinematicStep(nextStep);
    }
  }, [phase, cinematicStep, cfg.phase2BossHp, cfg.phase2TransitionText, showText]);

  // ── Auto-advance cinematic every 10s ──
  useEffect(() => {
    if (phase !== "phase2Cinematic") return;
    const delay = cinematicStep === -1 ? 8000 : cinematicStep === 0 ? 6000 : 10000;
    const t = setTimeout(cinematicAdvance, delay);
    return () => clearTimeout(t);
  }, [phase, cinematicStep, cinematicAdvance]);

  // ── Skip cinematic step: z / Enter / click ──
  useEffect(() => {
    if (phase !== "phase2Cinematic") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "z" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        cinematicAdvance();
      }
    };
    const onClick = () => cinematicAdvance();
    window.addEventListener("keydown", onKey);
    window.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("click", onClick);
    };
  }, [phase, cinematicAdvance]);

  // ── Phase 2 attack complete callback ──
  const handlePhase2AttackComplete = useCallback(() => {
    // ── Frustration victory: surviving frustration = you win ──
    if (p2AttackNameRef.current === "frustration") {
      console.log("[BossFight] Frustration survived — VICTORY!");
      // Fade to black, then show scoreboard
      setFrustVictoryFade(0);
      setPhase("frustrationVictory");
      setBossVisible(false);
      // Start fade-in after a brief delay
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setFrustVictoryFade(1));
      });
      // Score calculation
      const finalScore = score + 2000; // bonus for surviving frustration
      setScore(finalScore);
      if (finalScore > highScore) {
        safeSetItem("inet-bossfight-highscore", String(finalScore));
        setHighScore(finalScore);
      }
      onScoreSave?.(finalScore);
      // Badge unlocks: frustration victory = Buu stage 2 beaten
      addOwnedSticker("gnarpy");
      addOwnedSticker("gnarpy-miku");
      return;
    }

    // Attack finished — return to player turn
    setResolveActive(false); // deactivate shield when attack ends
    resolveActiveRef.current = false; // sync ref immediately
    setResolve(RESOLVE_MAX); // refill resolve for next attack
    resolveRef.current = RESOLVE_MAX; // sync ref immediately (don't wait for useEffect)
    // Trigger refill animation
    setResolveRefilling(true);
    if (resolveRefillTimerRef.current) clearTimeout(resolveRefillTimerRef.current);
    resolveRefillTimerRef.current = setTimeout(() => setResolveRefilling(false), 800);
    setBossVisible(true);
    setBossAppearing(true);
    setTimeout(() => setBossAppearing(false), 400);
    setTurnCount(t => t + 1);
    phase2TurnCountRef.current += 1;
    setPhase("playerTurn");
  }, [score, highScore, onScoreSave]);

  // ── Phase 2 damage callback ──
  // Resolve shield blocks damage at this level too (belt-and-suspenders with Phase 2 component)
  const handlePhase2Damage = useCallback((dmg: number) => {
    if (resolveActiveRef.current && resolveRef.current > 0) return; // shielded
    setPlayerHp(prev => {
      const next = Math.max(0, prev - dmg);
      if (next <= 0) {
        setPhase("gameOver");
      }
      return next;
    });
  }, []);

  const startBossAttack = useCallback(() => {
    // ── Phase 2: use Phase 2 battle box attacks ──
    if (bossPhaseRef.current === 2) {
      const p2Turn = phase2TurnCountRef.current;
      // Phase 2 attack sequence: MGB first, then cycle through others
      const p2Attacks = ["mgbeam", "stage", "empress", "annoyance", "stage", "frustration"];
      // Debug override: if set, use that attack instead of sequence
      let attackName: string;
      if (debugOverrideNextRef.current) {
        attackName = debugOverrideNextRef.current;
        console.log("[BossFight] Debug override consumed:", attackName);
        debugOverrideNextRef.current = null;
        setDebugOverrideNext(null);
      } else {
        attackName = p2Turn === 0 ? "mgbeam" : p2Attacks[p2Turn % p2Attacks.length];
        console.log("[BossFight] Phase 2 attack from sequence:", attackName, "turn:", p2Turn);
      }
      // Frustration pre-attack dialogue — show once, then re-enter startBossAttack
      if (attackName === "frustration" && !frustDialogueShownRef.current) {
        frustDialogueShownRef.current = true;
        setP2AttackName(attackName);
        p2AttackNameRef.current = attackName;
        showText("* " + cfg.phase2BossName + " is trembling with rage...\n* \"ENOUGH. Clearly your taste in music is lacking. Prepare for my arrival worm.\"\n* \"Let's see how long you REALLY last.\"\n* Every attack at once befalls you...");
        return;
      }
      // Reset for next time
      if (attackName === "frustration") {
        frustDialogueShownRef.current = false;
      }

      setP2AttackName(attackName);
      p2AttackNameRef.current = attackName;
      setCurrentAttackMode("phase2Stage");

      setBossVanishing(true);
      setTimeout(() => {
        setBossVisible(false);
        setBossVanishing(false);
        setPhase("bossAttack");
      }, 500);
      return;
    }

    // Determine attack mode — read from refs to avoid stale closures
    const curDebug = debugAttackModeRef.current;
    const curTurn = turnCountRef.current;
    const autoModes: AttackMode[] = ["normal", "spaceInvaders", "bulletStorm", "tractorBeam"];
    const mode: AttackMode = curDebug === "auto"
      ? autoModes[curTurn % autoModes.length]
      : curDebug;
    setCurrentAttackMode(mode);

    setBossVanishing(true);
    setTimeout(() => {
      setBossVisible(false);
      setBossVanishing(false);

      playerPosRef.current = { x: BOX_W / 2, y: BOX_H / 2 };
      iframesRef.current = 0;

      if (mode === "spaceInvaders") {
        // Initialize Space Invaders — pick a random formation
        const formation = SI_FORMATIONS[Math.floor(Math.random() * SI_FORMATIONS.length)];
        const maxCol = Math.max(...formation.map(f => f.col));
        const gridW = (maxCol + 1) * SI_ALIEN_W + maxCol * SI_GAP_X;
        const startX = (BOX_W - gridW) / 2;
        // Wave 1: mostly normal with a couple fast aliens
        const aliens: SIAlien[] = formation.map((f, i) => {
          const roll = Math.random();
          const type: SIAlienType = roll < 0.2 ? "fast" : "normal";
          return {
            col: f.col, row: f.row, alive: true,
            x: startX + f.col * (SI_ALIEN_W + SI_GAP_X),
            y: -30 + f.row * (SI_ALIEN_H + SI_GAP_Y),
            type,
            hp: 1,
          };
        });
        siAliensRef.current = aliens;
        siBulletsRef.current = [];
        siDirRef.current = 1;
        siLastShootRef.current = 0;
        siPlayerCanShootRef.current = true;
        siShootKeyRef.current = false;
        siAutoShootTimerRef.current = 0;
        siExplosionsRef.current = [];
        siWaveRef.current = 1;
        siWaveTextRef.current = 1500; // Show "WAVE 1" for 1.5s
        siBossRef.current = null;
        siMiniShipsRef.current = [];
        // Player starts at bottom center
        playerPosRef.current = { x: BOX_W / 2, y: BOX_H - 20 };
        miniGnarpysRef.current = [];
        setMiniGnarpysRender([]);
        setPhase("bossAttack");
        return;
      }

      if (mode === "bulletStorm") {
        bsProjectilesRef.current = [];
        bsSpawnTimerRef.current = 0;
        bsDamageTimerRef.current = 0;
        playerPosRef.current = { x: BOX_W / 2, y: BOX_H / 2 };
        miniGnarpysRef.current = [];
        setMiniGnarpysRender([]);
        setPhase("bossAttack");
        return;
      }

      if (mode === "tractorBeam") {
        tbSaucerXRef.current = BOX_W / 2;
        tbSaucerDirRef.current = Math.random() > 0.5 ? 1 : -1;
        tbNextDirChangeRef.current = TB_DIRECTION_CHANGE_MIN + Math.random() * (TB_DIRECTION_CHANGE_MAX - TB_DIRECTION_CHANGE_MIN);
        tbDamageTimerRef.current = 0;
        tbMissilesRef.current = [];
        tbMissileTimerRef.current = 2000; // first missile after 2s
        tbPawBombsRef.current = [];
        tbPawBombTimerRef.current = PAW_BOMB_FIRST_DELAY;
        playerPosRef.current = { x: BOX_W / 2, y: BOX_H - 30 };
        miniGnarpysRef.current = [];
        setMiniGnarpysRender([]);
        setPhase("bossAttack");
        return;
      }

      // Phase 1: Spawn 4-6 random mini gnarpys with staggered delays
      const count = 4 + Math.floor(Math.random() * 3);
      const sides: MiniSide[] = ["top", "bottom", "left", "right"];
      const minis: MiniGnarpy[] = [];
      for (let i = 0; i < count; i++) {
        minis.push({
          id: i,
          side: sides[Math.floor(Math.random() * 4)],
          pos: 0.12 + Math.random() * 0.76,
          state: "waiting",
          timer: i * 650 + Math.random() * 350,
        });
      }

      // Phase 2: Spiral beam attack — gnarpys placed clockwise around the perimeter
      // Walk clockwise: top (left→right), right (top→bottom), bottom (right→left), left (bottom→top)
      const spiralPositions: { side: MiniSide; pos: number }[] = [];
      const stepsPerSide = Math.ceil(SPIRAL_COUNT / 4);
      for (let i = 0; i < SPIRAL_COUNT; i++) {
        const sideIdx = Math.floor(i / stepsPerSide);
        const posInSide = (i % stepsPerSide) / stepsPerSide;
        const side = sides[sideIdx] || "left";
        // For bottom and left, reverse direction to complete the clockwise loop
        const pos = (side === "bottom" || side === "left")
          ? 0.9 - posInSide * 0.8
          : 0.1 + posInSide * 0.8;
        spiralPositions.push({ side, pos });
      }

      const baseId = count;
      for (let i = 0; i < spiralPositions.length; i++) {
        const sp = spiralPositions[i];
        minis.push({
          id: baseId + i,
          side: sp.side,
          pos: sp.pos,
          state: "waiting",
          timer: SPIRAL_START_OFFSET + i * SPIRAL_DELAY,
          isSpiral: true,
          waveType: "spiral",
        });
      }

      // Phase 3: Sweep attack — directional chase pattern
      // Beams sweep: up (left side, bottom→top), left (bottom side, right→left),
      //              down (right side, top→bottom), right (top side, left��right)
      // Last beam on each side is skipped → safe zone at the edge the player runs toward
      const sweepSidePattern: { side: MiniSide; startPos: number; endPos: number }[] = [
        { side: "left",   startPos: 0.9, endPos: 0.1 },  // horizontal beams sweep upward
        { side: "bottom", startPos: 0.9, endPos: 0.1 },  // vertical beams sweep leftward
        { side: "right",  startPos: 0.1, endPos: 0.9 },  // horizontal beams sweep downward
        { side: "top",    startPos: 0.1, endPos: 0.9 },  // vertical beams sweep rightward
      ];

      const sweepBaseId = baseId + spiralPositions.length;
      let sweepTime = 0;
      let sweepId = 0;
      for (let loop = 0; loop < SWEEP_LOOPS; loop++) {
        for (let sideIdx = 0; sideIdx < 4; sideIdx++) {
          const pat = sweepSidePattern[sideIdx];
          for (let b = 0; b < SWEEP_BEAMS_PER_SIDE; b++) {
            // Skip the last beam on each side — creates safe zone at the edge
            if (b === SWEEP_BEAMS_PER_SIDE - 1) continue;
            const t = b / (SWEEP_BEAMS_PER_SIDE - 1);
            const pos = pat.startPos + (pat.endPos - pat.startPos) * t;
            minis.push({
              id: sweepBaseId + sweepId,
              side: pat.side,
              pos,
              state: "waiting",
              timer: SWEEP_START_OFFSET + sweepTime,
              isSpiral: true,
              waveType: "sweep",
            });
            sweepTime += SWEEP_DELAY;
            sweepId++;
          }
          // Add gap between sides
          sweepTime += SWEEP_SIDE_GAP;
        }
      }

      miniGnarpysRef.current = minis;
      setMiniGnarpysRender(minis.map(m => ({ ...m })));
      setPhase("bossAttack");
    }, 500);
  }, []);

  // Sync startBossAttackRef so advanceAfterText can call it without TDZ
  startBossAttackRef.current = startBossAttack;

  // === SPACE INVADERS GAME LOOP ===
  useEffect(() => {
    if (phase !== "bossAttack" || currentAttackMode !== "spaceInvaders") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let running = true;
    const startTime = Date.now();
    let lastTime = Date.now();
    let lastFrameAt = 0;

    const loop = (frameNow: number) => {
      if (!running) return;
      if (lastFrameAt !== 0 && frameNow - lastFrameAt < TARGET_FRAME_MS) {
        animRef.current = requestAnimationFrame(loop);
        return;
      }
      lastFrameAt = frameNow;
      const now = Date.now();
      const dt = now - lastTime;
      lastTime = now;
      const elapsed = now - startTime;
      const pp = playerPosRef.current;

      // Player movement (left/right only, at bottom)
      const keys = keysRef.current;
      let dx = 0;
      if (keys.has("arrowleft") || keys.has("a")) dx -= 1;
      if (keys.has("arrowright") || keys.has("d")) dx += 1;
      pp.x = Math.max(PLAYER_SIZE, Math.min(BOX_W - PLAYER_SIZE, pp.x + dx * PLAYER_SPEED * 1.5));
      pp.y = BOX_H - 20; // Lock to bottom

      const aliens = siAliensRef.current;
      const bullets = siBulletsRef.current;

      // Auto-shoot: fire a bullet on a timer
      siAutoShootTimerRef.current -= dt;
      if (siAutoShootTimerRef.current <= 0) {
        const playerBulletCount = bullets.filter(b => b.isPlayer).length;
        if (playerBulletCount < 2) {
          bullets.push({
            x: pp.x,
            y: pp.y - PLAYER_SIZE,
            dy: -SI_PLAYER_BULLET_SPEED,
            isPlayer: true,
          });
        }
        siAutoShootTimerRef.current = SI_PLAYER_AUTO_SHOOT_INTERVAL;
      }

      // Move aliens (type-aware)
      const aliveAliens = aliens.filter(a => a.alive);
      if (aliveAliens.length > 0) {
        // Check if any alien hits the edge
        let hitEdge = false;
        for (const a of aliveAliens) {
          const aw = a.type === "fast" ? SI_FAST_ALIEN_W : a.type === "heavy" ? SI_HEAVY_ALIEN_W : SI_ALIEN_W;
          if ((siDirRef.current > 0 && a.x + aw >= BOX_W - 4) ||
              (siDirRef.current < 0 && a.x <= 4)) {
            hitEdge = true;
            break;
          }
        }
        if (hitEdge) {
          siDirRef.current *= -1;
          for (const a of aliens) {
            a.y += SI_DROP_STEP;
          }
        }
        for (const a of aliens) {
          // Fast aliens move quicker
          const speedBonus = a.type === "fast" ? SI_FAST_MOVE_BONUS : 0;
          const moveAmt = (SI_MOVE_SPEED + speedBonus) * siDirRef.current * (dt / 16);
          a.x += moveAmt;
        }

        // Enemy shooting — different behavior per type
        siLastShootRef.current -= dt;
        if (siLastShootRef.current <= 0) {
          const shooter = aliveAliens[Math.floor(Math.random() * aliveAliens.length)];
          const aw = shooter.type === "fast" ? SI_FAST_ALIEN_W : shooter.type === "heavy" ? SI_HEAVY_ALIEN_W : SI_ALIEN_W;
          const ah = shooter.type === "fast" ? SI_FAST_ALIEN_H : shooter.type === "heavy" ? SI_HEAVY_ALIEN_H : SI_ALIEN_H;

          if (shooter.type === "heavy") {
            // Heavy aliens fire a 3-bullet spread
            for (let si = -1; si <= 1; si++) {
              const spreadBullet: any = {
                x: shooter.x + aw / 2,
                y: shooter.y + ah,
                dy: SI_ENEMY_BULLET_SPEED * 0.9,
                isPlayer: false,
              };
              if (si !== 0) spreadBullet.dx = si * 0.8;
              bullets.push(spreadBullet);
            }
          } else if (shooter.type === "fast") {
            // Fast aliens fire quicker, aimed shots
            const angle = Math.atan2(pp.y - (shooter.y + ah), pp.x - (shooter.x + aw / 2));
            const fastBullet: any = {
              x: shooter.x + aw / 2,
              y: shooter.y + ah,
              dy: Math.sin(angle) * (SI_ENEMY_BULLET_SPEED + 1),
              isPlayer: false,
              dx: Math.cos(angle) * (SI_ENEMY_BULLET_SPEED + 1),
            };
            bullets.push(fastBullet);
          } else {
            // Normal straight-down shot
            bullets.push({
              x: shooter.x + aw / 2,
              y: shooter.y + ah,
              dy: SI_ENEMY_BULLET_SPEED,
              isPlayer: false,
            });
          }
          siLastShootRef.current = SI_SHOOT_INTERVAL * (0.6 + Math.random() * 0.8);
        }
      }

      // Move bullets (including angled boss bullets with dx)
      for (const b of bullets) {
        b.y += b.dy;
        if (b.dx) b.x += b.dx;
      }

      // Remove out-of-bounds bullets
      siBulletsRef.current = bullets.filter(b => b.y > -10 && b.y < BOX_H + 10 && b.x > -20 && b.x < BOX_W + 20);

      // Player bullet → alien collision (type-aware)
      for (let bi = siBulletsRef.current.length - 1; bi >= 0; bi--) {
        const b = siBulletsRef.current[bi];
        if (!b.isPlayer) continue;
        for (const a of aliens) {
          if (!a.alive) continue;
          const aw = a.type === "fast" ? SI_FAST_ALIEN_W : a.type === "heavy" ? SI_HEAVY_ALIEN_W : SI_ALIEN_W;
          const ah = a.type === "fast" ? SI_FAST_ALIEN_H : a.type === "heavy" ? SI_HEAVY_ALIEN_H : SI_ALIEN_H;
          if (b.x >= a.x && b.x <= a.x + aw &&
              b.y >= a.y && b.y <= a.y + ah) {
            a.hp -= 1;
            siBulletsRef.current.splice(bi, 1);
            if (a.hp <= 0) {
              a.alive = false;
              const pts = a.type === "fast" ? SI_FAST_SCORE : a.type === "heavy" ? SI_HEAVY_SCORE : 15;
              setScore(s => s + pts);
              siExplosionsRef.current.push({
                x: a.x + aw / 2, y: a.y + ah / 2,
                timer: SI_EXPLOSION_DURATION, maxTimer: SI_EXPLOSION_DURATION,
              });
            }
            break;
          }
        }
        // Player bullet → boss collision (Wave 3)
        const boss = siBossRef.current;
        if (boss && boss.alive && bi >= 0 && bi < siBulletsRef.current.length) {
          const b2 = siBulletsRef.current[bi];
          if (b2 && b2.isPlayer &&
              b2.x >= boss.x - SI_BOSS_W / 2 && b2.x <= boss.x + SI_BOSS_W / 2 &&
              b2.y >= boss.y && b2.y <= boss.y + SI_BOSS_H) {
            boss.hp -= 1;
            boss.hitFlash = 150;
            siBulletsRef.current.splice(bi, 1);
            if (boss.hp <= 0) {
              boss.alive = false;
              setScore(s => s + SI_BOSS_SCORE);
              siExplosionsRef.current.push(
                { x: boss.x - 20, y: boss.y + 20, timer: 600, maxTimer: 600 },
                { x: boss.x + 20, y: boss.y + 40, timer: 700, maxTimer: 700 },
                { x: boss.x, y: boss.y + SI_BOSS_H / 2, timer: 800, maxTimer: 800 },
              );
            }
          }
        }
        // Player bullet → mini-ship collision (Wave 3)
        const miniShips = siMiniShipsRef.current;
        if (bi >= 0 && bi < siBulletsRef.current.length) {
          const b3 = siBulletsRef.current[bi];
          if (b3 && b3.isPlayer) {
            for (let mi = miniShips.length - 1; mi >= 0; mi--) {
              const ms = miniShips[mi];
              if (!ms.alive) continue;
              if (b3.x >= ms.x - SI_BOSS_MINISHIP_W / 2 && b3.x <= ms.x + SI_BOSS_MINISHIP_W / 2 &&
                  b3.y >= ms.y && b3.y <= ms.y + SI_BOSS_MINISHIP_H) {
                ms.hp -= 1;
                if (ms.hp <= 0) {
                  ms.alive = false;
                  setScore(s => s + 20);
                  siExplosionsRef.current.push({
                    x: ms.x, y: ms.y + SI_BOSS_MINISHIP_H / 2,
                    timer: SI_EXPLOSION_DURATION, maxTimer: SI_EXPLOSION_DURATION,
                  });
                }
                siBulletsRef.current.splice(bi, 1);
                break;
              }
            }
          }
        }
      }

      // Enemy bullet → player collision
      if (iframesRef.current <= 0) {
        for (let bi = siBulletsRef.current.length - 1; bi >= 0; bi--) {
          const b = siBulletsRef.current[bi];
          if (b.isPlayer) continue;
          const dist = Math.sqrt((b.x - pp.x) ** 2 + (b.y - pp.y) ** 2);
          if (dist < PLAYER_SIZE * 0.8) {
            const isBossBullet = b.dx !== undefined;
            const dmg = Math.round((isBossBullet ? cfg.siBossBulletDamage : cfg.siEnemyBulletDamage) * getDmgMult());
            siBulletsRef.current.splice(bi, 1);
            iframesRef.current = IFRAMES_DURATION;
            setPlayerHp(hp => {
              const newHp = Math.max(0, hp - dmg);
              if (newHp <= 0) { running = false; setPhase("gameOver"); }
              return newHp;
            });
            break;
          }
        }
      }

      // Alien reaches bottom = explode, die, and deal damage
      let bottomHitDamage = 0;
      for (const a of aliveAliens) {
        const ah = a.type === "fast" ? SI_FAST_ALIEN_H : a.type === "heavy" ? SI_HEAVY_ALIEN_H : SI_ALIEN_H;
        const aw = a.type === "fast" ? SI_FAST_ALIEN_W : a.type === "heavy" ? SI_HEAVY_ALIEN_W : SI_ALIEN_W;
        if (a.y + ah >= BOX_H - 10) {
          a.alive = false;
          siExplosionsRef.current.push({
            x: a.x + aw / 2,
            y: a.y + ah / 2,
            timer: SI_EXPLOSION_DURATION,
            maxTimer: SI_EXPLOSION_DURATION,
          });
          bottomHitDamage += Math.round(SI_BOTTOM_EXPLODE_DAMAGE * getDmgMult());
        }
      }
      if (bottomHitDamage > 0 && iframesRef.current <= 0) {
        iframesRef.current = IFRAMES_DURATION;
        setPlayerHp(hp => {
          const newHp = Math.max(0, hp - bottomHitDamage);
          if (newHp <= 0) { running = false; setPhase("gameOver"); }
          return newHp;
        });
      }

      // Update explosions
      siExplosionsRef.current = siExplosionsRef.current
        .map(e => ({ ...e, timer: e.timer - dt }))
        .filter(e => e.timer > 0);

      if (iframesRef.current > 0) iframesRef.current -= dt;

      // === WAVE 3 BOSS LOGIC ===
      const boss = siBossRef.current;
      if (boss && boss.alive && siWaveRef.current === 3) {
        // Boss movement (side to side)
        boss.x += SI_BOSS_MOVE_SPEED * boss.dir;
        if (boss.x + SI_BOSS_W / 2 >= BOX_W - 4) { boss.dir = -1; }
        if (boss.x - SI_BOSS_W / 2 <= 4) { boss.dir = 1; }

        // Hit flash countdown
        if (boss.hitFlash > 0) boss.hitFlash -= dt;

        // Boss attack cycle
        boss.attackTimer -= dt;

        // Handle rapid burst mode
        if (boss.attackType === "rapid" && boss.rapidBurstRemaining > 0) {
          boss.rapidBurstTimer -= dt;
          if (boss.rapidBurstTimer <= 0) {
            // Fire single aimed shot at player
            const angle = Math.atan2(pp.y - (boss.y + SI_BOSS_H), pp.x - boss.x);
            siBulletsRef.current.push({
              x: boss.x, y: boss.y + SI_BOSS_H,
              dy: Math.sin(angle) * SI_BOSS_BULLET_SPEED,
              dx: Math.cos(angle) * SI_BOSS_BULLET_SPEED,
              isPlayer: false,
            });
            boss.rapidBurstRemaining--;
            boss.rapidBurstTimer = SI_BOSS_RAPID_INTERVAL;
          }
        }

        if (boss.attackTimer <= 0) {
          const attacks: SIBossAttackType[] = ["spread", "rapid", "diveBomb"];
          boss.attackCycle = (boss.attackCycle + 1) % attacks.length;
          boss.attackType = attacks[boss.attackCycle];
          boss.attackTimer = SI_BOSS_SHOOT_INTERVAL;

          if (boss.attackType === "spread") {
            // Fire a fan of bullets
            const startAngle = Math.PI / 2 - SI_BOSS_SPREAD_ANGLE / 2;
            for (let i = 0; i < SI_BOSS_SPREAD_COUNT; i++) {
              const angle = startAngle + (SI_BOSS_SPREAD_ANGLE / (SI_BOSS_SPREAD_COUNT - 1)) * i;
              const bullet: any = {
                x: boss.x, y: boss.y + SI_BOSS_H,
                dy: Math.sin(angle) * SI_BOSS_BULLET_SPEED,
                isPlayer: false,
                dx: Math.cos(angle) * SI_BOSS_BULLET_SPEED,
              };
              siBulletsRef.current.push(bullet);
            }
          } else if (boss.attackType === "rapid") {
            boss.rapidBurstRemaining = SI_BOSS_RAPID_BURST;
            boss.rapidBurstTimer = 0;
          } else if (boss.attackType === "diveBomb") {
            // Spawn a mini-ship that drifts down
            siMiniShipsRef.current.push({
              x: boss.x,
              y: boss.y + SI_BOSS_H,
              vy: SI_BOSS_MINISHIP_SPEED,
              hp: SI_BOSS_MINISHIP_HP,
              alive: true,
              shootTimer: 1200 + Math.random() * 600,
            });
            boss.attackTimer = SI_BOSS_SHOOT_INTERVAL * 0.8;
          }
        }
      }

      // Update mini-ships (Wave 3)
      for (let mi = siMiniShipsRef.current.length - 1; mi >= 0; mi--) {
        const ms = siMiniShipsRef.current[mi];
        if (!ms.alive) continue;
        ms.y += ms.vy;
        // Mini-ships shoot at player
        ms.shootTimer -= dt;
        if (ms.shootTimer <= 0) {
          siBulletsRef.current.push({
            x: ms.x, y: ms.y + SI_BOSS_MINISHIP_H,
            dy: SI_ENEMY_BULLET_SPEED, isPlayer: false,
          });
          ms.shootTimer = 900 + Math.random() * 600;
        }
        // Remove if off bottom
        if (ms.y > BOX_H + 20) {
          ms.alive = false;
        }
        // Collision with player
        if (iframesRef.current <= 0) {
          const dist = Math.hypot(ms.x - pp.x, ms.y + SI_BOSS_MINISHIP_H / 2 - pp.y);
          if (dist < PLAYER_SIZE + SI_BOSS_MINISHIP_W / 3) {
            ms.alive = false;
            iframesRef.current = IFRAMES_DURATION;
            siExplosionsRef.current.push({
              x: ms.x, y: ms.y + SI_BOSS_MINISHIP_H / 2,
              timer: SI_EXPLOSION_DURATION, maxTimer: SI_EXPLOSION_DURATION,
            });
            setPlayerHp(hp => {
              const newHp = Math.max(0, hp - Math.round(cfg.siBossBulletDamage * getDmgMult()));
              if (newHp <= 0) { running = false; setPhase("gameOver"); }
              return newHp;
            });
          }
        }
      }
      siMiniShipsRef.current = siMiniShipsRef.current.filter(ms => ms.alive);

      // Check win conditions: all aliens dead or time up
      const allDead = aliens.every(a => !a.alive);
      const bossAlive = siBossRef.current?.alive ?? false;
      if (allDead && siWaveRef.current === 1) {
        // Spawn wave 2 with mixed types
        siWaveRef.current = 2;
        siWaveTextRef.current = 1500;
        setScore(s => s + 100);
        const formation2 = SI_FORMATIONS[Math.floor(Math.random() * SI_FORMATIONS.length)];
        const maxCol2 = Math.max(...formation2.map(f => f.col));
        const gridW2 = (maxCol2 + 1) * SI_ALIEN_W + maxCol2 * SI_GAP_X;
        const startX2 = (BOX_W - gridW2) / 2;
        // Wave 2: mix of normal, fast, and heavy
        const newAliens: SIAlien[] = formation2.map((f, i) => {
          const roll = Math.random();
          const type: SIAlienType = roll < 0.25 ? "heavy" : roll < 0.5 ? "fast" : "normal";
          return {
            col: f.col, row: f.row, alive: true,
            x: startX2 + f.col * (SI_ALIEN_W + SI_GAP_X),
            y: -30 + f.row * (SI_ALIEN_H + SI_GAP_Y),
            type,
            hp: type === "heavy" ? SI_HEAVY_HP : 1,
          };
        });
        siAliensRef.current = newAliens;
        siBulletsRef.current = [];
        siDirRef.current = 1;
        siLastShootRef.current = 0;
        animRef.current = requestAnimationFrame(loop);
        return;
      } else if (allDead && siWaveRef.current === 2) {
        // Spawn wave 3: BOSS GNARPY
        siWaveRef.current = 3;
        siWaveTextRef.current = 2000; // Show "WAVE 3 — BOSS" longer
        setScore(s => s + 100);
        siAliensRef.current = [];
        siBulletsRef.current = [];
        siMiniShipsRef.current = [];
        siBossRef.current = {
          x: BOX_W / 2,
          y: 15,
          hp: SI_BOSS_HP,
          maxHp: SI_BOSS_HP,
          dir: 1,
          attackTimer: SI_BOSS_SHOOT_INTERVAL,
          attackType: "spread",
          attackCycle: -1,
          rapidBurstRemaining: 0,
          rapidBurstTimer: 0,
          diveBombTimer: 0,
          alive: true,
          hitFlash: 0,
        };
        animRef.current = requestAnimationFrame(loop);
        return;
      } else if (siWaveRef.current === 3 && !bossAlive && siMiniShipsRef.current.every(ms => !ms.alive)) {
        // Boss defeated — end Space Invaders
        running = false;
        siAliensRef.current = [];
        siBulletsRef.current = [];
        siExplosionsRef.current = [];
        siBossRef.current = null;
        siMiniShipsRef.current = [];
        setBossVisible(true);
        setBossAppearing(true);
        setTimeout(() => setBossAppearing(false), 400);
        setTurnCount(t => t + 1);
        setScore(s => s + 200); // bonus for boss kill
        setPhase("playerTurn");
        return;
      } else if (elapsed >= SI_DURATION && siWaveRef.current < 3) {
        // Time up during waves 1-2
        running = false;
        siAliensRef.current = [];
        siBulletsRef.current = [];
        siExplosionsRef.current = [];
        siBossRef.current = null;
        siMiniShipsRef.current = [];
        setBossVisible(true);
        setBossAppearing(true);
        setTimeout(() => setBossAppearing(false), 400);
        setTurnCount(t => t + 1);
        setPhase("playerTurn");
        return;
      }

      // === DRAW ===
      ctx.fillStyle = COL.boxBg;
      ctx.fillRect(0, 0, BOX_W, BOX_H);

      // Starfield background
      ctx.fillStyle = "#0a0a1a";
      ctx.fillRect(0, 0, BOX_W, BOX_H);
      for (let i = 0; i < 30; i++) {
        const sx = ((i * 37 + elapsed * 0.01) % BOX_W);
        const sy = ((i * 53 + elapsed * 0.005) % BOX_H);
        ctx.fillStyle = `rgba(255,255,255,${0.1 + (i % 3) * 0.1})`;
        ctx.fillRect(sx, sy, 1, 1);
      }

      // Draw aliens using the provided image — type-aware sizes and tinting
      const aImg = siAlienImgRef.current;
      for (const a of aliens) {
        if (!a.alive) continue;
        const aw = a.type === "fast" ? SI_FAST_ALIEN_W : a.type === "heavy" ? SI_HEAVY_ALIEN_W : SI_ALIEN_W;
        const ah = a.type === "fast" ? SI_FAST_ALIEN_H : a.type === "heavy" ? SI_HEAVY_ALIEN_H : SI_ALIEN_H;
        if (aImg) {
          ctx.save();
          // Type-specific glow color
          const glowCol = a.type === "fast" ? "#00FFFF" : a.type === "heavy" ? "#FF8800" : "#00FF00";
          ctx.shadowColor = glowCol;
          ctx.shadowBlur = a.type === "heavy" ? 10 : 6;
          ctx.drawImage(aImg, a.x, a.y, aw, ah);
          // Heavy aliens: draw HP pips below
          if (a.type === "heavy" && a.hp > 1) {
            ctx.shadowBlur = 0;
            ctx.fillStyle = "#FF8800";
            for (let pip = 0; pip < a.hp; pip++) {
              ctx.fillRect(a.x + aw / 2 - (a.hp * 4) / 2 + pip * 5, a.y + ah + 2, 3, 3);
            }
          }
          // Fast aliens: draw speed lines
          if (a.type === "fast") {
            ctx.shadowBlur = 0;
            ctx.strokeStyle = "rgba(0,255,255,0.4)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(a.x - 4, a.y + ah * 0.3);
            ctx.lineTo(a.x - 10, a.y + ah * 0.3);
            ctx.moveTo(a.x - 3, a.y + ah * 0.7);
            ctx.lineTo(a.x - 9, a.y + ah * 0.7);
            ctx.stroke();
          }
          ctx.restore();
        } else {
          // Fallback colored rectangle
          ctx.fillStyle = a.type === "fast" ? "#00FFFF" : a.type === "heavy" ? "#FF8800" : "#00FF00";
          ctx.fillRect(a.x, a.y, aw, ah);
        }
      }

      // Draw boss gnarpy (Wave 3) — bigger version of the alien ship image
      const bossG = siBossRef.current;
      if (bossG && bossG.alive && aImg) {
        ctx.save();
        const bx = bossG.x - SI_BOSS_W / 2;
        const by = bossG.y;
        // Hit flash effect
        if (bossG.hitFlash > 0) {
          ctx.shadowColor = "#FFFFFF";
          ctx.shadowBlur = 20;
        } else {
          ctx.shadowColor = "#FF0000";
          ctx.shadowBlur = 12;
        }
        ctx.drawImage(aImg, bx, by, SI_BOSS_W, SI_BOSS_H);
        // Draw boss HP bar below the ship
        ctx.shadowBlur = 0;
        const hpBarW = SI_BOSS_W * 0.8;
        const hpBarH = 6;
        const hpBarX = bossG.x - hpBarW / 2;
        const hpBarY = by + SI_BOSS_H + 4;
        ctx.fillStyle = "#330000";
        ctx.fillRect(hpBarX, hpBarY, hpBarW, hpBarH);
        ctx.fillStyle = "#FF0000";
        ctx.fillRect(hpBarX, hpBarY, hpBarW * (bossG.hp / bossG.maxHp), hpBarH);
        ctx.strokeStyle = "#FF000066";
        ctx.strokeRect(hpBarX, hpBarY, hpBarW, hpBarH);
        // "BOSS" label
        ctx.fillStyle = "#FF4444";
        ctx.font = "bold 9px 'Courier New'";
        ctx.textAlign = "center";
        ctx.fillText("BOSS", bossG.x, hpBarY + hpBarH + 10);
        ctx.restore();
      }

      // Draw mini-ships (Wave 3 dive bombs) ��� smaller gnarpy ships
      for (const ms of siMiniShipsRef.current) {
        if (!ms.alive) continue;
        if (aImg) {
          ctx.save();
          ctx.shadowColor = "#FF6600";
          ctx.shadowBlur = 5;
          ctx.drawImage(aImg, ms.x - SI_BOSS_MINISHIP_W / 2, ms.y, SI_BOSS_MINISHIP_W, SI_BOSS_MINISHIP_H);
          ctx.restore();
        } else {
          ctx.fillStyle = "#FF6600";
          ctx.fillRect(ms.x - SI_BOSS_MINISHIP_W / 2, ms.y, SI_BOSS_MINISHIP_W, SI_BOSS_MINISHIP_H);
        }
      }

      // Draw explosions
      for (const ex of siExplosionsRef.current) {
        const eprogress = 1 - ex.timer / ex.maxTimer;
        const radius = 8 + eprogress * 22;
        const alpha = 1 - eprogress;
        ctx.save();
        ctx.globalAlpha = alpha * 0.6;
        ctx.fillStyle = "#FF8800";
        ctx.shadowColor = "#FF4400";
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.arc(ex.x, ex.y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = "#FFFF44";
        ctx.shadowColor = "#FFFF00";
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(ex.x, ex.y, radius * 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = alpha * 0.8;
        ctx.fillStyle = "#FF4400";
        ctx.shadowBlur = 0;
        for (let i = 0; i < 6; i++) {
          const angle = (i / 6) * Math.PI * 2 + eprogress * 2;
          const dist = radius * (0.8 + eprogress * 0.5);
          const px = ex.x + Math.cos(angle) * dist;
          const py = ex.y + Math.sin(angle) * dist;
          ctx.fillRect(px - 2, py - 2, 4, 4);
        }
        ctx.restore();
      }

      // Draw bullets
      for (const b of siBulletsRef.current) {
        ctx.save();
        if (b.isPlayer) {
          ctx.fillStyle = "#00FF00";
          ctx.shadowColor = "#00FF00";
          ctx.shadowBlur = 6;
          ctx.fillRect(b.x - SI_BULLET_W / 2, b.y, SI_BULLET_W, SI_BULLET_H);
        } else {
          // Boss bullets glow more intensely
          const isBossBullet = (b as any).dx !== undefined;
          ctx.fillStyle = isBossBullet ? "#FF6600" : "#FF4444";
          ctx.shadowColor = isBossBullet ? "#FF4400" : "#FF0000";
          ctx.shadowBlur = isBossBullet ? 8 : 4;
          const bw = isBossBullet ? SI_BULLET_W + 2 : SI_BULLET_W;
          const bh = isBossBullet ? SI_BULLET_H + 2 : SI_BULLET_H;
          ctx.fillRect(b.x - bw / 2, b.y, bw, bh);
        }
        ctx.restore();
      }

      // Draw player heart
      const blinking = iframesRef.current > 0 && Math.floor(iframesRef.current / 80) % 2 === 0;
      if (!blinking) {
        ctx.fillStyle = COL.soul;
        ctx.save();
        ctx.translate(pp.x, pp.y);
        const size = PLAYER_SIZE * 0.7;
        ctx.beginPath();
        ctx.moveTo(0, size * 0.4);
        ctx.bezierCurveTo(-size, -size * 0.2, -size * 0.5, -size, 0, -size * 0.4);
        ctx.bezierCurveTo(size * 0.5, -size, size, -size * 0.2, 0, size * 0.4);
        ctx.fill();
        ctx.restore();
      }

      // Timer bar (only shown for waves 1-2 which have a time limit)
      if (siWaveRef.current < 3) {
        const timerProgress = Math.min(1, elapsed / SI_DURATION);
        ctx.fillStyle = "#111";
        ctx.fillRect(10, 8, BOX_W - 20, 4);
        ctx.fillStyle = "#00FF00";
        ctx.fillRect(10, 8, (BOX_W - 20) * timerProgress, 4);
      }

      // Status display (bottom)
      if (siWaveRef.current < 3) {
        const remaining = aliens.filter(a => a.alive).length;
        ctx.fillStyle = "#FFD700";
        ctx.font = "10px 'Courier New'";
        ctx.textAlign = "right";
        ctx.fillText(`ALIENS: ${remaining}/${aliens.length}`, BOX_W - 10, BOX_H - 6);
      } else if (bossG && bossG.alive) {
        ctx.fillStyle = "#FF4444";
        ctx.font = "10px 'Courier New'";
        ctx.textAlign = "right";
        ctx.fillText(`BOSS HP: ${bossG.hp}/${bossG.maxHp}`, BOX_W - 10, BOX_H - 6);
      }

      // Wave indicator
      ctx.fillStyle = "#00FF0066";
      ctx.font = "10px 'Courier New'";
      ctx.textAlign = "left";
      ctx.fillText(`WAVE ${siWaveRef.current}/3`, 10, BOX_H - 6);

      // Wave announcement text
      if (siWaveTextRef.current > 0) {
        siWaveTextRef.current -= dt;
        const waveAlpha = Math.min(1, siWaveTextRef.current / 500);
        ctx.save();
        ctx.globalAlpha = waveAlpha;
        ctx.fillStyle = siWaveRef.current === 3 ? "#FF4444" : "#00FF00";
        ctx.font = "bold 24px 'Courier New', monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.shadowColor = siWaveRef.current === 3 ? "#FF0000" : "#00FF00";
        ctx.shadowBlur = 12;
        const waveLabel = siWaveRef.current === 3 ? "WAVE 3 — BOSS!" : `WAVE ${siWaveRef.current}`;
        ctx.fillText(waveLabel, BOX_W / 2, BOX_H / 2 - 10);
        if (siWaveRef.current === 3) {
          ctx.font = "12px 'Courier New', monospace";
          ctx.fillStyle = "#FF8844";
          ctx.fillText("MEGA GNARPY", BOX_W / 2, BOX_H / 2 + 14);
        }
        ctx.shadowBlur = 0;
        ctx.restore();
      }

      animRef.current = requestAnimationFrame(loop);
    };

    animRef.current = requestAnimationFrame(loop);
    return () => {
      running = false;
      cancelAnimationFrame(animRef.current);
    };
  }, [phase, currentAttackMode]);

  // === BULLET STORM GAME LOOP ===
  useEffect(() => {
    if (phase !== "bossAttack" || currentAttackMode !== "bulletStorm") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let running = true;
    const startTime = Date.now();
    let lastTime = Date.now();
    const centerX = BOX_W / 2;
    const centerY = BOX_H / 2;

    // Randomize bullet phase duration between 20-30s
    const bulletPhaseDuration = BS_BULLET_DURATION_MIN + Math.random() * (BS_BULLET_DURATION_MAX - BS_BULLET_DURATION_MIN);
    const bulletsStart = BS_PRE_WARNING_DURATION; // bullets start after pre-warning
    const warningStart = bulletsStart + bulletPhaseDuration;
    const beamStart = warningStart + BS_WARNING_DURATION;
    const totalDuration = beamStart + BS_BEAM_DURATION;

    // Beam geometry — 85% of box width, centered
    const beamW = BOX_W * BS_BEAM_WIDTH_RATIO;
    const beamX = (BOX_W - beamW) / 2;
    let lastFrameAt = 0;
    const loop = (frameNow: number) => {
      if (!running) return;
      if (lastFrameAt !== 0 && frameNow - lastFrameAt < TARGET_FRAME_MS) {
        animRef.current = requestAnimationFrame(loop);
        return;
      }
      lastFrameAt = frameNow;
      const now = Date.now();
      const dt = now - lastTime;
      lastTime = now;
      const elapsed = now - startTime;
      const pp = playerPosRef.current;

      // Determine phase: "preWarning" | "bullets" | "warning" | "beam"
      const stormPhase = elapsed < bulletsStart ? "preWarning" : elapsed < warningStart ? "bullets" : elapsed < beamStart ? "warning" : "beam";

      // Player movement (all directions)
      const keys = keysRef.current;
      let dx = 0, dy = 0;
      if (keys.has("arrowleft") || keys.has("a")) dx -= 1;
      if (keys.has("arrowright") || keys.has("d")) dx += 1;
      if (keys.has("arrowup") || keys.has("w")) dy -= 1;
      if (keys.has("arrowdown") || keys.has("s")) dy += 1;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      pp.x = Math.max(PLAYER_SIZE, Math.min(BOX_W - PLAYER_SIZE, pp.x + (dx / len) * PLAYER_SPEED * 1.3));
      pp.y = Math.max(PLAYER_SIZE, Math.min(BOX_H - PLAYER_SIZE, pp.y + (dy / len) * PLAYER_SPEED * 1.3));

      // === BULLET PHASE: spawn & move projectiles ===
      if (stormPhase === "bullets") {
        const projs = bsProjectilesRef.current;

        bsSpawnTimerRef.current -= dt;
        if (bsSpawnTimerRef.current <= 0) {
          bsSpawnTimerRef.current = BS_SPAWN_INTERVAL;
          for (let i = 0; i < BS_BATCH_SIZE; i++) {
            const wall = Math.floor(Math.random() * 4);
            let sx: number, sy: number, angle: number;
            const speed = BS_PROJ_SPEED_MIN + Math.random() * (BS_PROJ_SPEED_MAX - BS_PROJ_SPEED_MIN);

            switch (wall) {
              case 0: sx = Math.random() * BOX_W; sy = 0; angle = Math.PI / 2 + (Math.random() - 0.5) * 1.2; break;
              case 1: sx = Math.random() * BOX_W; sy = BOX_H; angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.2; break;
              case 2: sx = 0; sy = Math.random() * BOX_H; angle = 0 + (Math.random() - 0.5) * 1.2; break;
              default: sx = BOX_W; sy = Math.random() * BOX_H; angle = Math.PI + (Math.random() - 0.5) * 1.2; break;
            }

            const dxToCenter = centerX - sx;
            const dyToCenter = centerY - sy;
            const distToCenter = Math.sqrt(dxToCenter * dxToCenter + dyToCenter * dyToCenter);
            const maxTravel = Math.max(10, distToCenter - BS_SAFE_RADIUS - Math.random() * 30);

            projs.push({
              x: sx, y: sy,
              vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
              life: maxTravel, maxLife: maxTravel,
            });
          }
        }

        for (const p of projs) {
          const moved = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
          p.x += p.vx; p.y += p.vy; p.life -= moved;
        }
        bsProjectilesRef.current = projs.filter(p => p.life > 0 && p.x > -10 && p.x < BOX_W + 10 && p.y > -10 && p.y < BOX_H + 10);

        // Player collision with projectiles
        if (iframesRef.current <= 0) {
          let hit = false;
          for (const p of bsProjectilesRef.current) {
            const pdx = p.x - pp.x;
            const pdy = p.y - pp.y;
            if (pdx * pdx + pdy * pdy < (PLAYER_SIZE * 0.7) ** 2) { hit = true; break; }
          }
          if (hit) {
            iframesRef.current = IFRAMES_DURATION;
            setPlayerHp(hp => {
              const newHp = Math.max(0, hp - Math.round(cfg.bulletStormDamage * getDmgMult()));
              if (newHp <= 0) { running = false; setPhase("gameOver"); }
              return newHp;
            });
          }
        }
      }

      // === WARNING PHASE: red flash, clear bullets, show beam zone ===
      if (stormPhase === "warning") {
        // Clear remaining projectiles on first warning frame
        if (bsProjectilesRef.current.length > 0) bsProjectilesRef.current = [];
      }

      // === BEAM PHASE: massive damage if inside beam zone ===
      if (stormPhase === "beam") {
        if (bsProjectilesRef.current.length > 0) bsProjectilesRef.current = [];
        // Check if player is inside the beam (full height, 85% width centered)
        const inBeam = pp.x >= beamX && pp.x <= beamX + beamW;
        if (inBeam && iframesRef.current <= 0) {
          iframesRef.current = IFRAMES_DURATION;
          setPlayerHp(hp => {
            const newHp = Math.max(0, hp - Math.round(cfg.bulletStormBeamDamage * getDmgMult()));
            if (newHp <= 0) { running = false; setPhase("gameOver"); }
            return newHp;
          });
        }
      }

      if (iframesRef.current > 0) iframesRef.current -= dt;

      // Total time up = end attack
      if (elapsed >= totalDuration) {
        running = false;
        bsProjectilesRef.current = [];
        setBossVisible(true);
        setBossAppearing(true);
        setTimeout(() => setBossAppearing(false), 400);
        setTurnCount(t => t + 1);
        setPhase("playerTurn");
        return;
      }

      // === DRAW ===
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, BOX_W, BOX_H);

      // === PRE-WARNING PHASE DRAWING ===
      if (stormPhase === "preWarning") {
        const preProgress = elapsed / BS_PRE_WARNING_DURATION;
        const boxW = 120;
        const boxH = 80;
        const bx = centerX - boxW / 2;
        const by = centerY - boxH / 2;

        // Pulsing green glow
        const pulse = 0.6 + 0.4 * Math.sin(elapsed * 0.008);
        ctx.save();
        ctx.shadowColor = "#00FF00";
        ctx.shadowBlur = 15 * pulse;
        ctx.strokeStyle = "#00FF00";
        ctx.lineWidth = 3;
        ctx.globalAlpha = 0.8;
        ctx.strokeRect(bx, by, boxW, boxH);
        ctx.shadowBlur = 0;

        // Fill with translucent green
        ctx.globalAlpha = 0.15 + 0.1 * Math.sin(elapsed * 0.006);
        ctx.fillStyle = "#00FF00";
        ctx.fillRect(bx, by, boxW, boxH);
        ctx.restore();

        // "WARNING?" text
        const flashOn = Math.sin(elapsed * 0.01) > -0.3;
        if (flashOn) {
          ctx.save();
          ctx.fillStyle = "#00FF00";
          ctx.font = "bold 18px 'Courier New', monospace";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.shadowColor = "#00FF00";
          ctx.shadowBlur = 10;
          ctx.fillText("WARNING?", centerX, centerY);
          ctx.shadowBlur = 0;
          ctx.restore();
        }
      }

      if (stormPhase === "bullets") {
        // Subtle safe zone indicator
        const pulseAlpha = 0.04 + 0.03 * Math.sin(elapsed * 0.004);
        ctx.save();
        ctx.globalAlpha = pulseAlpha;
        ctx.strokeStyle = "#FFFFFF";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(centerX, centerY, BS_SAFE_RADIUS, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();

        // Draw projectiles
        for (const p of bsProjectilesRef.current) {
          const fadeRatio = Math.min(1, p.life / (p.maxLife * 0.3));
          ctx.save();
          ctx.globalAlpha = fadeRatio * 0.9;
          ctx.fillStyle = "#FFFFFF";
          ctx.shadowColor = "#FFFFFF";
          ctx.shadowBlur = 3;
          ctx.fillRect(p.x - BS_PROJ_SIZE / 2, p.y - BS_PROJ_SIZE / 2, BS_PROJ_SIZE, BS_PROJ_SIZE);
          ctx.shadowBlur = 0;
          ctx.restore();
        }

        // Wall glow effects
        const wallGlow = 0.15 + 0.1 * Math.sin(elapsed * 0.008);
        ctx.save();
        ctx.globalAlpha = wallGlow;
        const grdT = ctx.createLinearGradient(0, 0, 0, 30);
        grdT.addColorStop(0, "#FFFFFF"); grdT.addColorStop(1, "transparent");
        ctx.fillStyle = grdT; ctx.fillRect(0, 0, BOX_W, 30);
        const grdB = ctx.createLinearGradient(0, BOX_H, 0, BOX_H - 30);
        grdB.addColorStop(0, "#FFFFFF"); grdB.addColorStop(1, "transparent");
        ctx.fillStyle = grdB; ctx.fillRect(0, BOX_H - 30, BOX_W, 30);
        const grdL = ctx.createLinearGradient(0, 0, 30, 0);
        grdL.addColorStop(0, "#FFFFFF"); grdL.addColorStop(1, "transparent");
        ctx.fillStyle = grdL; ctx.fillRect(0, 0, 30, BOX_H);
        const grdR = ctx.createLinearGradient(BOX_W, 0, BOX_W - 30, 0);
        grdR.addColorStop(0, "#FFFFFF"); grdR.addColorStop(1, "transparent");
        ctx.fillStyle = grdR; ctx.fillRect(BOX_W - 30, 0, 30, BOX_H);
        ctx.restore();
      }

      // === WARNING PHASE DRAWING ===
      if (stormPhase === "warning") {
        const warningElapsed = elapsed - warningStart;
        const warningProgress = warningElapsed / BS_WARNING_DURATION;

        // Flashing red background over the beam zone — faster flashing as time runs out
        const flashSpeed = 4 + warningProgress * 16; // accelerates
        const flashOn = Math.sin(warningElapsed * flashSpeed * 0.01) > 0;

        // Draw beam danger zone with red flashing
        if (flashOn) {
          ctx.save();
          ctx.globalAlpha = 0.25 + warningProgress * 0.2;
          ctx.fillStyle = "#FF0000";
          ctx.fillRect(beamX, 0, beamW, BOX_H);
          ctx.restore();
        }

        // Red border outline of beam zone (always visible)
        ctx.save();
        ctx.strokeStyle = "#FF0000";
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.6 + 0.4 * Math.sin(warningElapsed * 0.02);
        ctx.strokeRect(beamX, 0, beamW, BOX_H);
        ctx.restore();

        // "WARNING" text
        ctx.save();
        ctx.fillStyle = "#FF0000";
        ctx.globalAlpha = flashOn ? 1 : 0.4;
        ctx.font = "bold 24px 'Courier New', monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.shadowColor = "#FF0000";
        ctx.shadowBlur = 10;
        ctx.fillText("⚠ WARNING ⚠", centerX, centerY - 14);
        ctx.shadowBlur = 0;
        ctx.restore();

        // Countdown
        const secondsLeft = Math.ceil((BS_WARNING_DURATION - warningElapsed) / 1000);
        ctx.save();
        ctx.fillStyle = "#FF4444";
        ctx.font = "bold 36px 'Courier New', monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.globalAlpha = 0.9;
        ctx.fillText(String(secondsLeft), centerX, centerY + 45);
        ctx.restore();

        // Draw safe edge indicators (left & right strips)
        ctx.save();
        ctx.globalAlpha = 0.15 + 0.1 * Math.sin(warningElapsed * 0.01);
        ctx.fillStyle = "#00FF00";
        ctx.fillRect(0, 0, beamX, BOX_H); // left safe zone
        ctx.fillRect(beamX + beamW, 0, BOX_W - beamX - beamW, BOX_H); // right safe zone
        ctx.restore();
      }

      // === BEAM PHASE DRAWING ===
      if (stormPhase === "beam") {
        const beamElapsed = elapsed - beamStart;
        const beamFlicker = 0.7 + 0.3 * Math.sin(beamElapsed * 0.05);

        // Massive red beam covering the center 85%
        ctx.save();
        ctx.globalAlpha = beamFlicker;
        ctx.fillStyle = "#FF0000";
        ctx.shadowColor = "#FF0000";
        ctx.shadowBlur = 30;
        ctx.fillRect(beamX, 0, beamW, BOX_H);
        ctx.restore();

        // Inner bright white-red core
        const coreW = beamW * 0.6;
        const coreX = (BOX_W - coreW) / 2;
        ctx.save();
        ctx.globalAlpha = 0.4 + 0.3 * Math.sin(beamElapsed * 0.08);
        ctx.fillStyle = "#FF6666";
        ctx.fillRect(coreX, 0, coreW, BOX_H);
        ctx.restore();

        // Scanline effect inside beam
        ctx.save();
        ctx.globalAlpha = 0.15;
        for (let y = 0; y < BOX_H; y += 4) {
          if ((y + Math.floor(beamElapsed * 0.1)) % 8 < 4) {
            ctx.fillStyle = "#FFFFFF";
            ctx.fillRect(beamX, y, beamW, 2);
          }
        }
        ctx.restore();

        // Safe edge glow
        ctx.save();
        ctx.globalAlpha = 0.2;
        ctx.fillStyle = "#00FF00";
        ctx.fillRect(0, 0, beamX, BOX_H);
        ctx.fillRect(beamX + beamW, 0, BOX_W - beamX - beamW, BOX_H);
        ctx.restore();
      }

      // Draw player heart (all phases)
      const blinking = iframesRef.current > 0 && Math.floor(iframesRef.current / 80) % 2 === 0;
      if (!blinking) {
        ctx.fillStyle = COL.soul;
        ctx.save();
        ctx.translate(pp.x, pp.y);
        const size = PLAYER_SIZE * 0.7;
        ctx.beginPath();
        ctx.moveTo(0, size * 0.4);
        ctx.bezierCurveTo(-size, -size * 0.2, -size * 0.5, -size, 0, -size * 0.4);
        ctx.bezierCurveTo(size * 0.5, -size, size, -size * 0.2, 0, size * 0.4);
        ctx.fill();
        ctx.restore();
      }

      animRef.current = requestAnimationFrame(loop);
    };

    animRef.current = requestAnimationFrame(loop);
    return () => {
      running = false;
      cancelAnimationFrame(animRef.current);
    };
  }, [phase, currentAttackMode]);

  // === TRACTOR BEAM GAME LOOP ===
  useEffect(() => {
    if (phase !== "bossAttack" || currentAttackMode !== "tractorBeam") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let running = true;
    const startTime = Date.now();
    let lastTime = Date.now();
    let lastFrameAt = 0;

    const loop = (frameNow: number) => {
      if (!running) return;
      if (lastFrameAt !== 0 && frameNow - lastFrameAt < TARGET_FRAME_MS) {
        animRef.current = requestAnimationFrame(loop);
        return;
      }
      lastFrameAt = frameNow;
      const now = Date.now();
      const dt = now - lastTime;
      lastTime = now;
      const elapsed = now - startTime;
      const pp = playerPosRef.current;

      // Player movement (full WASD/arrows)
      const keys = keysRef.current;
      let dx = 0, dy = 0;
      if (keys.has("arrowleft") || keys.has("a")) dx -= 1;
      if (keys.has("arrowright") || keys.has("d")) dx += 1;
      if (keys.has("arrowup") || keys.has("w")) dy -= 1;
      if (keys.has("arrowdown") || keys.has("s")) dy += 1;
      if (dx !== 0 && dy !== 0) { dx *= 0.707; dy *= 0.707; }
      pp.x += dx * PLAYER_SPEED * 1.5;
      pp.y += dy * PLAYER_SPEED * 1.5;

      // Saucer movement — moves left/right above the box
      tbNextDirChangeRef.current -= dt;
      if (tbNextDirChangeRef.current <= 0) {
        tbSaucerDirRef.current *= -1;
        tbNextDirChangeRef.current = TB_DIRECTION_CHANGE_MIN + Math.random() * (TB_DIRECTION_CHANGE_MAX - TB_DIRECTION_CHANGE_MIN);
      }

      // Saucer speed increases over time
      const speedMult = 1 + (elapsed / TB_DURATION) * 1.5;
      const saucerSpeed = TB_SAUCER_SPEED * speedMult * (dt / 16);
      tbSaucerXRef.current += tbSaucerDirRef.current * saucerSpeed;

      // Bounce off walls (saucer can extend 20px beyond box edges)
      const halfSaucer = TB_SAUCER_W / 2;
      const saucerOverhang = 20;
      if (tbSaucerXRef.current - halfSaucer <= -saucerOverhang) {
        tbSaucerXRef.current = halfSaucer - saucerOverhang;
        tbSaucerDirRef.current = 1;
        tbNextDirChangeRef.current = TB_DIRECTION_CHANGE_MIN + Math.random() * (TB_DIRECTION_CHANGE_MAX - TB_DIRECTION_CHANGE_MIN);
      }
      if (tbSaucerXRef.current + halfSaucer >= BOX_W + saucerOverhang) {
        tbSaucerXRef.current = BOX_W - halfSaucer + saucerOverhang;
        tbSaucerDirRef.current = -1;
        tbNextDirChangeRef.current = TB_DIRECTION_CHANGE_MIN + Math.random() * (TB_DIRECTION_CHANGE_MAX - TB_DIRECTION_CHANGE_MIN);
      }

      // Update saucer DOM element position directly (avoids React batching lag)
      if (tbSaucerElRef.current) {
        tbSaucerElRef.current.style.left = `${BORDER_W + tbSaucerXRef.current - TB_SAUCER_W / 2}px`;
      }

      // Tractor beam zone — centered under saucer, 1/3 of box width
      // Beam enters from the top of the box (y=0) and goes to bottom
      const beamW = BOX_W * TB_BEAM_WIDTH_RATIO;
      const beamLeft = tbSaucerXRef.current - beamW / 2;
      const beamRight = tbSaucerXRef.current + beamW / 2;

      // Check if player is in the beam (full height of box)
      const inBeam = pp.x >= beamLeft && pp.x <= beamRight;

      // Pull player upward if in beam (increases over time)
      if (inBeam) {
        const pullMult = 1 + (elapsed / TB_DURATION) * 0.8;
        pp.y -= TB_PULL_STRENGTH * pullMult * getSpdMult() * (dt / 16);

        // Damage if pulled against the north wall (top of box)
        if (pp.y <= PLAYER_SIZE + 10) {
          tbDamageTimerRef.current -= dt;
          if (tbDamageTimerRef.current <= 0 && iframesRef.current <= 0) {
            tbDamageTimerRef.current = TB_DAMAGE_INTERVAL;
            iframesRef.current = IFRAMES_DURATION;
            setPlayerHp(hp => {
              const newHp = Math.max(0, hp - Math.round(cfg.tractorBeamDamage * 0.5 * getDmgMult()));
              if (newHp <= 0) { running = false; setPhase("gameOver"); }
              return newHp;
            });
          }
        }
      } else {
        tbDamageTimerRef.current = 0;
      }

      // Clamp player position — player stays inside the box
      pp.x = Math.max(PLAYER_SIZE, Math.min(BOX_W - PLAYER_SIZE, pp.x));
      pp.y = Math.max(PLAYER_SIZE, Math.min(BOX_H - PLAYER_SIZE, pp.y));

      if (iframesRef.current > 0) iframesRef.current -= dt;

      // === MISSILES ===
      // Spawn missiles from saucer
      tbMissileTimerRef.current -= dt;
      if (tbMissileTimerRef.current <= 0) {
        // Increase fire rate over time
        const rateScale = Math.max(0.5, 1 - elapsed / TB_DURATION * 0.4);
        tbMissileTimerRef.current = TB_MISSILE_INTERVAL * rateScale;
        const sx = tbSaucerXRef.current;
        const sy = 5; // enters from top of box
        // Random Bezier control points creating a swooping arc
        const side = Math.random() > 0.5 ? 1 : -1;
        const arcW = 60 + Math.random() * 120;
        const m: TBMissile = {
          t: 0, x: sx, y: sy,
          p0x: sx, p0y: sy,
          p1x: sx + side * arcW, p1y: BOX_H * 0.25 + Math.random() * BOX_H * 0.15,
          p2x: pp.x - side * arcW * 0.5, p2y: BOX_H * 0.55 + Math.random() * BOX_H * 0.15,
          p3x: pp.x, p3y: pp.y,
          trail: [],
          spawnTime: elapsed,
        };
        tbMissilesRef.current.push(m);
      }

      // Update missiles
      const missiles = tbMissilesRef.current;
      for (let i = missiles.length - 1; i >= 0; i--) {
        const m = missiles[i];
        m.t += TB_MISSILE_SPEED * dt;

        // Slight homing: nudge target (p3) and control point (p2) toward player
        // Homing ends after 1 second of missile lifetime
        const missileAge = elapsed - m.spawnTime;
        if (missileAge < 1000) {
          m.p3x += (pp.x - m.p3x) * TB_MISSILE_HOMING;
          m.p3y += (pp.y - m.p3y) * TB_MISSILE_HOMING;
          m.p2x += (pp.x - m.p2x) * TB_MISSILE_HOMING * 0.3;
          m.p2y += (pp.y - m.p2y) * TB_MISSILE_HOMING * 0.15;
        }

        // Evaluate cubic Bezier position
        const t = Math.min(m.t, 1);
        const u = 1 - t;
        m.x = u*u*u*m.p0x + 3*u*u*t*m.p1x + 3*u*t*t*m.p2x + t*t*t*m.p3x;
        m.y = u*u*u*m.p0y + 3*u*u*t*m.p1y + 3*u*t*t*m.p2y + t*t*t*m.p3y;

        // Store trail
        m.trail.push({ x: m.x, y: m.y });
        if (m.trail.length > 12) m.trail.shift();

        // Collision with player
        const mdx = m.x - pp.x;
        const mdy = m.y - pp.y;
        if (Math.sqrt(mdx*mdx + mdy*mdy) < TB_MISSILE_RADIUS + PLAYER_SIZE * 0.5) {
          missiles.splice(i, 1);
          if (iframesRef.current <= 0) {
            iframesRef.current = IFRAMES_DURATION;
            setPlayerHp(hp => {
              const newHp = Math.max(0, hp - Math.round(cfg.tractorMissileDamage * 0.5 * getDmgMult()));
              if (newHp <= 0) { running = false; setPhase("gameOver"); }
              return newHp;
            });
          }
          continue;
        }

        // Remove if past curve or off-screen
        if (m.t > 1.2 || m.x < -20 || m.x > BOX_W + 20 || m.y > BOX_H + 20) {
          missiles.splice(i, 1);
        }
      }

      // === PAW BOMB LOGIC ===
      tbPawBombTimerRef.current -= dt;
      if (tbPawBombTimerRef.current <= 0) {
        // Spawn a new paw bomb at a random position within the box
        const margin = PAW_BOMB_SIZE / 2 + 10;
        const bx = margin + Math.random() * (BOX_W - margin * 2);
        const by = margin + Math.random() * (BOX_H - margin * 2);
        tbPawBombsRef.current.push({
          x: bx, y: by,
          spawnTime: elapsed,
          phase: "show",
          damaged: false,
          splashDamaged: false,
        });
        tbPawBombTimerRef.current = PAW_BOMB_INTERVAL;
      }

      // Update paw bombs
      for (let i = tbPawBombsRef.current.length - 1; i >= 0; i--) {
        const pb = tbPawBombsRef.current[i];
        const age = elapsed - pb.spawnTime;

        if (age < PAW_BOMB_SHOW_DURATION) {
          pb.phase = "show";
        } else if (age < PAW_BOMB_SHOW_DURATION + PAW_BOMB_HIDE_DURATION) {
          pb.phase = "hide";
        } else if (age < PAW_BOMB_SHOW_DURATION + PAW_BOMB_HIDE_DURATION + PAW_BOMB_EXPLODE_DURATION) {
          pb.phase = "explode";

          // Direct hit damage (paw image overlap)
          if (!pb.damaged && iframesRef.current <= 0) {
            const pdx = pp.x - pb.x;
            const pdy = pp.y - pb.y;
            const dist = Math.sqrt(pdx * pdx + pdy * pdy);
            if (dist < PAW_BOMB_SIZE / 2 + PLAYER_SIZE * 0.4) {
              pb.damaged = true;
              iframesRef.current = IFRAMES_DURATION;
              setPlayerHp((hp) => {
                const newHp = Math.max(0, hp - Math.round(cfg.pawBombDirectDamage * getDmgMult()));
                if (newHp <= 0) { running = false; setPhase("gameOver"); }
                return newHp;
              });
            }
          }

          // Splash damage (explosion radius)
          if (!pb.splashDamaged && !pb.damaged && iframesRef.current <= 0) {
            const pdx = pp.x - pb.x;
            const pdy = pp.y - pb.y;
            const dist = Math.sqrt(pdx * pdx + pdy * pdy);
            if (dist < PAW_BOMB_EXPLOSION_RADIUS + PLAYER_SIZE * 0.4) {
              pb.splashDamaged = true;
              iframesRef.current = IFRAMES_DURATION;
              setPlayerHp((hp) => {
                const newHp = Math.max(0, hp - Math.round(cfg.pawBombSplashDamage * getDmgMult()));
                if (newHp <= 0) { running = false; setPhase("gameOver"); }
                return newHp;
              });
            }
          }
        } else {
          pb.phase = "done";
          tbPawBombsRef.current.splice(i, 1);
        }
      }

      // === DRAW ===
      // Dark space background
      ctx.fillStyle = "#0a0a1a";
      ctx.fillRect(0, 0, BOX_W, BOX_H);

      // Starfield
      for (let i = 0; i < 40; i++) {
        const sx = ((i * 37 + elapsed * 0.008) % BOX_W);
        const sy = ((i * 53 + elapsed * 0.004) % BOX_H);
        const twinkle = Math.sin(elapsed * 0.003 + i) * 0.5 + 0.5;
        ctx.fillStyle = `rgba(255,255,255,${0.1 + twinkle * 0.2})`;
        ctx.fillRect(sx, sy, 1, 1);
      }

      // Draw tractor beam (green translucent cone entering from top of box)
      const beamBottomW = beamW * 1.2; // slightly wider at bottom
      const beamTopW = TB_SAUCER_W * 0.4; // narrow at top where it enters from saucer
      const beamCenterX = tbSaucerXRef.current;
      const pulseAlpha = 0.15 + Math.sin(elapsed * 0.008) * 0.05;

      // Beam gradient cone — from top of box (y=0) to bottom
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(beamCenterX - beamTopW / 2, 0);
      ctx.lineTo(beamCenterX - beamBottomW / 2, BOX_H);
      ctx.lineTo(beamCenterX + beamBottomW / 2, BOX_H);
      ctx.lineTo(beamCenterX + beamTopW / 2, 0);
      ctx.closePath();

      const beamGrad = ctx.createLinearGradient(0, 0, 0, BOX_H);
      beamGrad.addColorStop(0, `rgba(0, 255, 0, ${pulseAlpha + 0.2})`);
      beamGrad.addColorStop(0.5, `rgba(0, 255, 0, ${pulseAlpha})`);
      beamGrad.addColorStop(1, `rgba(0, 255, 0, ${pulseAlpha * 0.3})`);
      ctx.fillStyle = beamGrad;
      ctx.fill();

      // Beam scan lines
      ctx.globalAlpha = 0.15;
      for (let sy = 0; sy < BOX_H; sy += 6) {
        const t = sy / BOX_H;
        const lineW = beamTopW + (beamBottomW - beamTopW) * t;
        const lineAlpha = Math.sin(sy * 0.3 + elapsed * 0.01) * 0.5 + 0.5;
        ctx.fillStyle = `rgba(0, 255, 0, ${lineAlpha * 0.3})`;
        ctx.fillRect(beamCenterX - lineW / 2, sy, lineW, 2);
      }
      ctx.globalAlpha = 1;

      // Beam edge glow
      ctx.strokeStyle = `rgba(0, 255, 0, ${pulseAlpha * 1.5})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(beamCenterX - beamTopW / 2, 0);
      ctx.lineTo(beamCenterX - beamBottomW / 2, BOX_H);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(beamCenterX + beamTopW / 2, 0);
      ctx.lineTo(beamCenterX + beamBottomW / 2, BOX_H);
      ctx.stroke();
      ctx.restore();

      // Bright entry glow at top of box
      ctx.save();
      ctx.globalAlpha = 0.5 + Math.sin(elapsed * 0.01) * 0.2;
      const topGlow = ctx.createRadialGradient(beamCenterX, 0, 0, beamCenterX, 0, beamTopW);
      topGlow.addColorStop(0, "rgba(0, 255, 0, 0.6)");
      topGlow.addColorStop(1, "rgba(0, 255, 0, 0)");
      ctx.fillStyle = topGlow;
      ctx.fillRect(beamCenterX - beamTopW, 0, beamTopW * 2, 20);
      ctx.restore();

      // Floating particles inside beam (float upward)
      for (let i = 0; i < 8; i++) {
        const particleT = ((elapsed * 0.0003 + i * 0.125) % 1);
        const particleY = BOX_H - particleT * BOX_H;
        const lineT = particleY / BOX_H;
        const lineW2 = beamTopW + (beamBottomW - beamTopW) * lineT;
        const particleX = beamCenterX + (Math.sin(i * 2.5 + elapsed * 0.002) * lineW2 * 0.3);
        const pAlpha = Math.sin(particleT * Math.PI) * 0.6;
        ctx.fillStyle = `rgba(100, 255, 100, ${pAlpha})`;
        ctx.fillRect(particleX - 2, particleY - 2, 4, 4);
      }

      // Draw missiles
      for (const m of tbMissilesRef.current) {
        // Trail
        for (let ti = 0; ti < m.trail.length; ti++) {
          const alpha = (ti / m.trail.length) * 0.6;
          const size = 2 + (ti / m.trail.length) * 2;
          ctx.fillStyle = `rgba(0, 255, 50, ${alpha})`;
          ctx.beginPath();
          ctx.arc(m.trail[ti].x, m.trail[ti].y, size, 0, Math.PI * 2);
          ctx.fill();
        }
        // Missile body — bright green with glow
        ctx.save();
        ctx.shadowColor = "#00FF33";
        ctx.shadowBlur = 10;
        ctx.fillStyle = "#00FF33";
        ctx.beginPath();
        ctx.arc(m.x, m.y, TB_MISSILE_RADIUS, 0, Math.PI * 2);
        ctx.fill();
        // Inner bright core
        ctx.fillStyle = "#AAFFAA";
        ctx.beginPath();
        ctx.arc(m.x, m.y, TB_MISSILE_RADIUS * 0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Draw paw bombs
      const pImg = pawImgRef.current;
      for (const pb of tbPawBombsRef.current) {
        if (pb.phase === "show" && pImg) {
          // Show paw at 80% opacity
          ctx.save();
          ctx.globalAlpha = 0.8;
          ctx.drawImage(pImg, pb.x - PAW_BOMB_SIZE / 2, pb.y - PAW_BOMB_SIZE / 2, PAW_BOMB_SIZE, PAW_BOMB_SIZE);
          ctx.restore();
          // Warning indicator — pulsing ring
          ctx.save();
          const age = elapsed - pb.spawnTime;
          const pulse = Math.sin(age * 0.012) * 0.3 + 0.5;
          ctx.strokeStyle = `rgba(255, 100, 0, ${pulse})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(pb.x, pb.y, PAW_BOMB_SIZE / 2 + 6, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        } else if (pb.phase === "explode" && pImg) {
          const explodeAge = elapsed - pb.spawnTime - PAW_BOMB_SHOW_DURATION - PAW_BOMB_HIDE_DURATION;
          const explodeProgress = explodeAge / PAW_BOMB_EXPLODE_DURATION;

          // Draw expanding explosion ring
          ctx.save();
          const ringRadius = PAW_BOMB_EXPLOSION_RADIUS * Math.min(1, explodeProgress * 1.5);
          const ringAlpha = Math.max(0, 1 - explodeProgress);
          // Outer explosion glow
          ctx.shadowColor = "#FF6600";
          ctx.shadowBlur = 20;
          ctx.strokeStyle = `rgba(255, 150, 0, ${ringAlpha * 0.7})`;
          ctx.lineWidth = 4 + (1 - explodeProgress) * 4;
          ctx.beginPath();
          ctx.arc(pb.x, pb.y, ringRadius, 0, Math.PI * 2);
          ctx.stroke();
          // Inner explosion fill
          ctx.fillStyle = `rgba(255, 200, 50, ${ringAlpha * 0.25})`;
          ctx.beginPath();
          ctx.arc(pb.x, pb.y, ringRadius * 0.7, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();

          // Draw paw image at center (reappeared)
          ctx.save();
          ctx.globalAlpha = Math.max(0, 1 - explodeProgress * 0.5);
          const shake = (1 - explodeProgress) * 3;
          const sx = (Math.random() - 0.5) * shake;
          const sy = (Math.random() - 0.5) * shake;
          ctx.drawImage(pImg, pb.x - PAW_BOMB_SIZE / 2 + sx, pb.y - PAW_BOMB_SIZE / 2 + sy, PAW_BOMB_SIZE, PAW_BOMB_SIZE);
          ctx.restore();

          // Explosion particles
          ctx.save();
          for (let pi = 0; pi < 8; pi++) {
            const angle = (pi / 8) * Math.PI * 2 + explodeProgress * 0.5;
            const dist = ringRadius * 0.5 + explodeProgress * 20;
            const px = pb.x + Math.cos(angle) * dist;
            const py = pb.y + Math.sin(angle) * dist;
            const particleAlpha = Math.max(0, 1 - explodeProgress * 1.3);
            ctx.fillStyle = pi % 2 === 0 ? `rgba(255, 200, 0, ${particleAlpha})` : `rgba(255, 100, 0, ${particleAlpha})`;
            ctx.fillRect(px - 2, py - 2, 4, 4);
          }
          ctx.restore();
        }
        // "hide" phase: nothing drawn (paw disappears)
      }

      // Draw player heart
      const blinking = iframesRef.current > 0 && Math.floor(iframesRef.current / 80) % 2 === 0;
      if (!blinking) {
        ctx.fillStyle = inBeam ? "#FF4444" : COL.soul;
        ctx.save();
        ctx.translate(pp.x, pp.y);
        const size = PLAYER_SIZE * 0.7;
        ctx.beginPath();
        ctx.moveTo(0, size * 0.4);
        ctx.bezierCurveTo(-size, -size * 0.2, -size * 0.5, -size, 0, -size * 0.4);
        ctx.bezierCurveTo(size * 0.5, -size, size, -size * 0.2, 0, size * 0.4);
        ctx.fill();
        ctx.restore();

        // If in beam, draw upward pull arrows around player
        if (inBeam) {
          ctx.save();
          ctx.globalAlpha = 0.5 + Math.sin(elapsed * 0.01) * 0.3;
          ctx.strokeStyle = "#00FF00";
          ctx.lineWidth = 2;
          for (let a = 0; a < 3; a++) {
            const ay = pp.y + 10 + a * 12 - ((elapsed * 0.05) % 12);
            ctx.beginPath();
            ctx.moveTo(pp.x - 5, ay);
            ctx.lineTo(pp.x, ay - 6);
            ctx.lineTo(pp.x + 5, ay);
            ctx.stroke();
          }
          ctx.restore();
        }
      }

      // Warning text when pulled to north wall
      if (inBeam && pp.y <= PLAYER_SIZE + 20) {
        ctx.save();
        ctx.globalAlpha = Math.sin(elapsed * 0.01) * 0.5 + 0.5;
        ctx.fillStyle = "#FF4444";
        ctx.font = "bold 14px 'Courier New', monospace";
        ctx.textAlign = "center";
        ctx.fillText("ABDUCTING!", BOX_W / 2, BOX_H / 2);
        ctx.restore();
      }

      // Timer bar
      const progress = Math.min(1, elapsed / TB_DURATION);
      ctx.fillStyle = "#111";
      ctx.fillRect(10, BOX_H - 8, BOX_W - 20, 4);
      ctx.fillStyle = "#00FF00";
      ctx.fillRect(10, BOX_H - 8, (BOX_W - 20) * progress, 4);

      // End attack
      if (elapsed >= TB_DURATION) {
        running = false;
        tbPawBombsRef.current = [];
        setBossVisible(true);
        setBossAppearing(true);
        setTimeout(() => setBossAppearing(false), 400);
        setTurnCount(t => t + 1);
        setPhase("playerTurn");
        return;
      }

      animRef.current = requestAnimationFrame(loop);
    };

    animRef.current = requestAnimationFrame(loop);
    return () => {
      running = false;
      cancelAnimationFrame(animRef.current);
    };
  }, [phase, currentAttackMode]);

  // === BOSS ATTACK GAME LOOP (NORMAL) ===
  useEffect(() => {
    if (phase !== "bossAttack" || currentAttackMode !== "normal") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let running = true;
    const startTime = Date.now();
    let lastTime = Date.now();
    let lastFrameAt = 0;

    const loop = (frameNow: number) => {
      if (!running) return;
      if (lastFrameAt !== 0 && frameNow - lastFrameAt < TARGET_FRAME_MS) {
        animRef.current = requestAnimationFrame(loop);
        return;
      }
      lastFrameAt = frameNow;
      const now = Date.now();
      const dt = now - lastTime;
      lastTime = now;
      const elapsed = now - startTime;
      const pp = playerPosRef.current;

      // Player movement
      const keys = keysRef.current;
      let dx = 0, dy = 0;
      if (keys.has("arrowleft") || keys.has("a")) dx -= 1;
      if (keys.has("arrowright") || keys.has("d")) dx += 1;
      if (keys.has("arrowup") || keys.has("w")) dy -= 1;
      if (keys.has("arrowdown") || keys.has("s")) dy += 1;
      if (dx !== 0 && dy !== 0) { dx *= 0.707; dy *= 0.707; }
      // 2x speed during sweep wave (Wave 3)
      const inSweepWave = elapsed >= SWEEP_START_OFFSET;
      const currentSpeed = inSweepWave ? PLAYER_SPEED * 2 : PLAYER_SPEED;
      pp.x = Math.max(PLAYER_SIZE, Math.min(BOX_W - PLAYER_SIZE, pp.x + dx * currentSpeed));
      pp.y = Math.max(PLAYER_SIZE, Math.min(BOX_H - PLAYER_SIZE, pp.y + dy * currentSpeed));

      // Update mini gnarpys state machine
      const minis = miniGnarpysRef.current;
      let stateChanged = false;
      for (const m of minis) {
        m.timer -= dt;
        if (m.timer <= 0) {
          stateChanged = true;
          const wt = m.waveType || "normal";
          switch (m.state) {
            case "waiting":
              m.state = "appearing";
              m.timer = wt === "sweep" ? 200 : 400;
              break;
            case "appearing":
              m.state = "warning";
              m.timer = wt === "sweep" ? SWEEP_WARN : WARN_TIME;
              break;
            case "warning":
              m.state = "charging";
              m.timer = wt === "sweep" ? SWEEP_CHARGE : wt === "spiral" ? SPIRAL_CHARGE : CHARGE_TIME;
              break;
            case "charging":
              m.state = "firing";
              m.timer = wt === "sweep" ? SWEEP_BEAM_LINGER : wt === "spiral" ? SPIRAL_BEAM_LINGER : BEAM_LINGER;
              break;
            case "firing":
              m.state = "done";
              m.timer = wt === "sweep" ? 150 : 300;
              break;
            default:
              break;
          }
        }
      }

      // Collision: check gnarpys in "firing" state
      if (iframesRef.current <= 0) {
        for (const m of minis) {
          if (m.state !== "firing") continue;
          const isH = m.side === "left" || m.side === "right";
          if (isH) {
            const beamY = m.pos * BOX_H;
            if (Math.abs(pp.y - beamY) < BEAM_THICKNESS / 2 + PLAYER_SIZE * 0.35) {
              iframesRef.current = IFRAMES_DURATION;
              setPlayerHp((hp) => {
                const newHp = Math.max(0, hp - Math.round(cfg.beamDamage * getDmgMult()));
                if (newHp <= 0) { running = false; setPhase("gameOver"); }
                return newHp;
              });
              break;
            }
          } else {
            const beamX = m.pos * BOX_W;
            if (Math.abs(pp.x - beamX) < BEAM_THICKNESS / 2 + PLAYER_SIZE * 0.35) {
              iframesRef.current = IFRAMES_DURATION;
              setPlayerHp((hp) => {
                const newHp = Math.max(0, hp - Math.round(cfg.beamDamage * getDmgMult()));
                if (newHp <= 0) { running = false; setPhase("gameOver"); }
                return newHp;
              });
              break;
            }
          }
        }
      }
      if (iframesRef.current > 0) iframesRef.current -= dt;

      // === Wave 4: Rotating beam (circular sweep — one full revolution) ===
      const rotateElapsed = elapsed - ROTATE_START_OFFSET;
      const rb = rotatingBeamRef.current;
      if (rotateElapsed >= 0 && rotateElapsed < ROTATE_DURATION) {
        rb.active = true;
        // 20% faster rotation, reverses direction halfway through
        const progress = rotateElapsed / ROTATE_DURATION;
        const totalSweep = Math.PI * 4 * 1.2; // 2 full revolutions, 20% faster
        if (progress < 0.5) {
          // First half: clockwise
          rb.angle = (progress * 2) * (totalSweep / 2);
        } else {
          // Second half: counter-clockwise (reverse)
          const halfSweep = totalSweep / 2;
          rb.angle = halfSweep - ((progress - 0.5) * 2) * halfSweep;
        }

        // Collision: perpendicular distance from player to beam line through center
        if (iframesRef.current <= 0) {
          const cx = BOX_W / 2, cy = BOX_H / 2;
          // Beam direction vector (0 = up, clockwise)
          const dirX = Math.sin(rb.angle);
          const dirY = -Math.cos(rb.angle);
          // Perpendicular distance = |dirY * (px - cx) - dirX * (py - cy)|
          const perpDist = Math.abs(dirY * (pp.x - cx) - dirX * (pp.y - cy));
          if (perpDist < BEAM_THICKNESS / 2 + PLAYER_SIZE * 0.35) {
            iframesRef.current = IFRAMES_DURATION;
            setPlayerHp((hp) => {
              const newHp = Math.max(0, hp - Math.round(cfg.rotateBeamDamage * getDmgMult()));
              if (newHp <= 0) { running = false; setPhase("gameOver"); }
              return newHp;
            });
          }
        }
      } else {
        rb.active = false;
      }
      setRotatingBeamRender({ ...rb });

      // === Wave 5: Safe zone flash (safe box + lasers everywhere else) ===
      const szElapsed = elapsed - SAFEZONE_START_OFFSET;
      const sz = safeZoneRef.current;
      if (szElapsed >= 0 && szElapsed < SAFEZONE_WARN_TIME + SAFEZONE_LASER_DURATION) {
        if (!sz.active) {
          // Initialize safe zone at a random position within the box (with margin)
          const margin = SAFEZONE_BOX_SIZE / 2 + PLAYER_SIZE;
          sz.x = margin + Math.random() * (BOX_W - margin * 2);
          sz.y = margin + Math.random() * (BOX_H - margin * 2);
          sz.active = true;
          sz.lasersOn = false;
          sz.lastDamageTick = 0;
        }
        // After warning period, lasers activate
        if (szElapsed >= SAFEZONE_WARN_TIME) {
          sz.lasersOn = true;
          // Damage if player is outside the safe zone box
          if (iframesRef.current <= 0 && szElapsed - sz.lastDamageTick >= SAFEZONE_TICK_INTERVAL) {
            const halfSz = SAFEZONE_BOX_SIZE / 2;
            const inSafeZone = pp.x >= sz.x - halfSz && pp.x <= sz.x + halfSz &&
                               pp.y >= sz.y - halfSz && pp.y <= sz.y + halfSz;
            if (!inSafeZone) {
              sz.lastDamageTick = szElapsed;
              iframesRef.current = IFRAMES_DURATION;
              setPlayerHp((hp) => {
                const newHp = Math.max(0, hp - Math.round(cfg.safezoneDamage * getDmgMult()));
                if (newHp <= 0) { running = false; setPhase("gameOver"); }
                return newHp;
              });
            }
          }
        }
      } else if (szElapsed >= SAFEZONE_WARN_TIME + SAFEZONE_LASER_DURATION) {
        sz.active = false;
        sz.lasersOn = false;
      }
      setSafeZoneRender({ x: sz.x, y: sz.y, active: sz.active, lasersOn: sz.lasersOn });

      // Sync to React state for HTML rendering
      if (stateChanged) {
        setMiniGnarpysRender(minis.map(m => ({ ...m })));
      }

      // === DRAW CANVAS (player heart + timer only) ===
      ctx.fillStyle = COL.boxBg;
      ctx.fillRect(0, 0, BOX_W, BOX_H);

      // Warning/charge lines on canvas for firing gnarpys
      for (const m of minis) {
        if (m.state === "warning" || m.state === "charging") {
          const isH = m.side === "left" || m.side === "right";
          const intensity = m.state === "charging"
            ? 0.25 + 0.35 * Math.abs(Math.sin(now / 80))
            : 0.1 + 0.05 * Math.sin(now / 150);

          ctx.save();
          ctx.globalAlpha = intensity;
          ctx.strokeStyle = "#00FF00";
          ctx.lineWidth = m.state === "charging" ? 3 : 1;
          ctx.setLineDash(m.state === "charging" ? [] : [4, 6]);
          ctx.beginPath();
          if (isH) {
            const y = m.pos * BOX_H;
            ctx.moveTo(0, y);
            ctx.lineTo(BOX_W, y);
          } else {
            const x = m.pos * BOX_W;
            ctx.moveTo(x, 0);
            ctx.lineTo(x, BOX_H);
          }
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();
        }
      }

      // Rotating beam — canvas warning line (beam itself rendered as HTML from Gnarpy sprite)
      if (rb.active) {
        const cx = BOX_W / 2, cy = BOX_H / 2;
        const bDirX = Math.sin(rb.angle);
        const bDirY = -Math.cos(rb.angle);
        ctx.save();
        ctx.globalAlpha = 0.12 + 0.06 * Math.abs(Math.sin(now / 80));
        ctx.strokeStyle = "#00FF00";
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 5]);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx - bDirX * BOX_W, cy - bDirY * BOX_H);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }

      // Wave 5 safe zone — draw pulsing red outline on canvas during warning
      if (sz.active && !sz.lasersOn) {
        const halfSz = SAFEZONE_BOX_SIZE / 2;
        const pulse = 0.3 + 0.4 * Math.abs(Math.sin(now / 150));
        ctx.save();
        ctx.globalAlpha = pulse;
        ctx.strokeStyle = "#FF0000";
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(sz.x - halfSz, sz.y - halfSz, SAFEZONE_BOX_SIZE, SAFEZONE_BOX_SIZE);
        ctx.setLineDash([]);
        // Draw arrow pointing to safe zone from player
        ctx.globalAlpha = pulse * 0.6;
        ctx.fillStyle = "#FF4444";
        ctx.font = "10px 'Courier New'";
        ctx.textAlign = "center";
        ctx.fillText("▼", sz.x, sz.y - halfSz - 4);
        ctx.restore();
      }

      // Player heart
      const blinking = iframesRef.current > 0 && Math.floor(iframesRef.current / 80) % 2 === 0;
      if (!blinking) {
        ctx.fillStyle = COL.soul;
        ctx.save();
        ctx.translate(pp.x, pp.y);
        const size = PLAYER_SIZE * 0.7;
        ctx.beginPath();
        ctx.moveTo(0, size * 0.4);
        ctx.bezierCurveTo(-size, -size * 0.2, -size * 0.5, -size, 0, -size * 0.4);
        ctx.bezierCurveTo(size * 0.5, -size, size, -size * 0.2, 0, size * 0.4);
        ctx.fill();
        ctx.restore();
      }

      // Timer bar
      const progress = Math.min(1, elapsed / ATTACK_DURATION);
      ctx.fillStyle = "#111";
      ctx.fillRect(10, 8, BOX_W - 20, 4);
      ctx.fillStyle = "#00FF00";
      ctx.fillRect(10, 8, (BOX_W - 20) * progress, 4);

      // End attack
      if (elapsed >= ATTACK_DURATION) {
        running = false;
        miniGnarpysRef.current = [];
        setMiniGnarpysRender([]);
        rotatingBeamRef.current.active = false;
        setRotatingBeamRender({ angle: 0, active: false });
        safeZoneRef.current = { x: 0, y: 0, active: false, lasersOn: false, lastDamageTick: 0 };
        setSafeZoneRender({ x: 0, y: 0, active: false, lasersOn: false });
        setBossVisible(true);
        setBossAppearing(true);
        setTimeout(() => setBossAppearing(false), 400);
        setTurnCount((t) => t + 1);
        setPhase("playerTurn");
        return;
      }

      animRef.current = requestAnimationFrame(loop);
    };

    animRef.current = requestAnimationFrame(loop);
    return () => {
      running = false;
      cancelAnimationFrame(animRef.current);
    };
  }, [phase, currentAttackMode]);

  // === FIGHT BAR ANIMATION ===
  useEffect(() => {
    if (phase !== "fightAnim" || fightBarStopped) return;
    const interval = setInterval(() => {
      setFightBarPos((pos) => {
        const newPos = pos + fightBarDir * fightBarSpeed;
        if (newPos >= 100) { setFightBarDir(-1); return 100; }
        if (newPos <= 0) { setFightBarDir(1); return 0; }
        return newPos;
      });
    }, TARGET_FRAME_MS);
    return () => clearInterval(interval);
  }, [phase, fightBarStopped, fightBarDir, fightBarSpeed]);

  const stopFightBar = useCallback(() => {
    if (phase !== "fightAnim" || fightBarStopped) return;
    setFightBarStopped(true);
    const distFromCenter = Math.abs(fightBarPos - 50);
    const damage = Math.round(110 - (distFromCenter / 50) * 60);
    const quality = distFromCenter < 5 ? "CRITICAL HIT!" : distFromCenter < 15 ? "Great hit!" : distFromCenter < 30 ? "Decent hit." : "Weak hit...";

    if (!bossDistracted) {
      setBossDodging(true);
      setTimeout(() => setBossDodging(false), 800);
      const bName = bossPhaseRef.current === 2 ? cfg.phase2BossName : cfg.bossName;
      setTimeout(() => showText(`* You swung at ${bName} for ${damage} damage!\n* But ${bName} dodged the attack!`), 600);
    } else {
      setBossDistracted(false);
      setBossHitGlow(true);
      setBossHp((hp) => Math.max(0, hp - damage));
      setScore((s) => s + damage * 2);
      setTimeout(() => setBossHitGlow(false), 600);
      const bName = bossPhaseRef.current === 2 ? cfg.phase2BossName : cfg.bossName;
      setTimeout(() => showText(`* You attacked ${bName} for ${damage} damage! ${quality}`), 500);
    }
  }, [phase, fightBarStopped, fightBarPos, bossDistracted, showText]);

  const fightDist = Math.abs(fightBarPos - 50);
  const fightSliderColor = fightDist < 5 ? "#00FF00" : fightDist < 15 ? "#66FF00" : fightDist < 30 ? "#FFD700" : "#FF4444";
  const fightResultLabel = fightDist < 5 ? ">> CRITICAL! <<" : fightDist < 15 ? "> NICE! <" : fightDist < 30 ? "OK" : "WEAK";

  // Boss idle wander — pick a random spot within 30px radius every 10 seconds
  useEffect(() => {
    const idlePhases = ["playerTurn", "fightAnim", "actMenu", "itemMenu", "textDisplay"];
    if (!idlePhases.includes(phase) || !bossVisible) {
      setBossIdleOffset({ x: 0, y: 0 });
      return;
    }
    // Pick an initial random offset immediately
    const pickRandom = () => {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * 30;
      setBossIdleOffset({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
    };
    pickRandom();
    const interval = setInterval(pickRandom, 10000);
    return () => clearInterval(interval);
  }, [phase, bossVisible]);

  // Draw idle canvas when NOT in boss attack
  useEffect(() => {
    if (phase === "bossAttack") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = COL.boxBg;
    ctx.fillRect(0, 0, BOX_W, BOX_H);
    ctx.fillStyle = COL.soul;
    const cx = BOX_W / 2, cy = BOX_H / 2, size = PLAYER_SIZE * 0.7;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.beginPath();
    ctx.moveTo(0, size * 0.4);
    ctx.bezierCurveTo(-size, -size * 0.2, -size * 0.5, -size, 0, -size * 0.4);
    ctx.bezierCurveTo(size * 0.5, -size, size, -size * 0.2, 0, size * 0.4);
    ctx.fill();
    ctx.restore();
  }, [phase]);

  // === ACTION HANDLERS ===
  const handleAction = useCallback((i: number) => {
    if (phase !== "playerTurn") return;
    switch (i) {
      case 0: {
        const speedMod = 0.7 + Math.random() * 0.5;
        setFightBarSpeed(3.5 * speedMod);
        setFightBarPos(0);
        setFightBarDir(1);
        setFightBarStopped(false);
        setPhase("fightAnim");
        break;
      }
      case 1: setSelectedAct(0); setPhase("actMenu"); break;
      case 2: {
        const isItemBlocked = turnCount > 0 && turnCount % 3 === 0;
        if (isItemBlocked) {
          const bn = bossPhaseRef.current === 2 ? cfg.phase2BossName : cfg.bossName;
          showText(`* ${bn}'s paw is blocking the ITEM button!\n* You can't use items this turn!`);
        } else {
          setSelectedItem(0); setPhase("itemMenu");
        }
        break;
      }
      case 3: { const bn = bossPhaseRef.current === 2 ? cfg.phase2BossName : cfg.bossName; showText(`* You tried to pet ${bn}...\n* ${bn} hissed at you menacingly.`); break; }
    }
  }, [phase, showText, turnCount]);

  const handleActOption = useCallback((key: string) => {
    switch (key) {
      case "nothing": { const bn = bossPhaseRef.current === 2 ? cfg.phase2BossName : cfg.bossName; showText(`* You did absolutely nothing.\n* ${bn} stares at you, unimpressed.`); break; }
      case "dance": { const bn = bossPhaseRef.current === 2 ? cfg.phase2BossName : cfg.bossName; showText(`* You do a little dance!\n* ${bn} watches, completely unmoved.`); break; }
      case "pray": {
        const heal = Math.floor(Math.random() * 20) + 1;
        setPlayerHp((hp) => Math.min(cfg.playerMaxHp, hp + heal));
        showText(`* You pray to the dice bot...\n* The dice bot smiles upon you! Healed ${heal} HP!`);
        break;
      }
      case "throwfood": {
        const bn = bossPhaseRef.current === 2 ? cfg.phase2BossName : cfg.bossName;
        if (foodCount <= 0) { showText(`* You reach for food to throw, but you don't have any!\n* ${bn} laughs.`); return; }
        setFoodCount((f) => f - 1);
        setBossDistracted(true);
        setScore((s) => s + 10);
        showText(`* You threw some food at ${bn}!\n* ${bn} is distracted by the food!\n* Now's your chance to attack!`);
        break;
      }
      case "scavenge": setFoodCount((f) => f + 1); showText("* You scavenge around in the fridge...\n* You found 1 Food!"); break;
    }
  }, [foodCount, showText]);

  const handleUseFood = useCallback(() => {
    if (foodCount <= 0) return;
    setFoodCount((f) => f - 1);
    setPlayerHp((hp) => Math.min(cfg.playerMaxHp, hp + 50));
    showText("* You ate the Food.\n* You recovered 50 HP!");
  }, [foodCount, showText]);

  // Global key handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (phase === "fightAnim" && (e.key === "z" || e.key === "Enter" || e.key === " ")) { e.preventDefault(); stopFightBar(); }
      if (phase === "textDisplay" && (e.key === "z" || e.key === "Enter")) {
        e.preventDefault();
        if (!textDone) { setDisplayedChars(displayText.length); setTextDone(true); }
        else advanceAfterText();
      }
      if (phase === "actMenu" && (e.key === "z" || e.key === "Enter")) { e.preventDefault(); handleActOption(ACT_OPTIONS[selectedAct].key); }
      if (phase === "itemMenu" && (e.key === "z" || e.key === "Enter")) { e.preventDefault(); handleUseFood(); }
      if (phase === "playerTurn" && (e.key === "z" || e.key === "Enter")) { e.preventDefault(); handleAction(selectedAction); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [phase, stopFightBar, textDone, displayText, advanceAfterText, selectedAct, handleActOption, handleUseFood, selectedAction, handleAction]);

  // ── Resolve: spacebar hold during Phase 2 boss attacks ──
  useEffect(() => {
    if (bossPhase !== 2) return;
    const onDown = (e: KeyboardEvent) => {
      if (e.key === " " && phase === "bossAttack" && resolveRef.current > 0) {
        e.preventDefault();
        resolveActiveRef.current = true; // sync ref immediately for drain loop
        setResolveActive(true);
      }
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key === " ") {
        resolveActiveRef.current = false;
        setResolveActive(false);
      }
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => { window.removeEventListener("keydown", onDown); window.removeEventListener("keyup", onUp); };
  }, [bossPhase, phase]);

  // ── Resolve drain loop (ref-driven, throttled state sync to avoid 60fps re-renders) ──
  useEffect(() => {
    if (bossPhase !== 2) return;
    let last = performance.now();
    let lastStateSync = 0;
    let raf = 0;
    let lastFrameAt = 0;
    const STATE_SYNC_MS = 50; // sync to React state every 50ms instead of every frame
    const tick = (now: number) => {
      if (lastFrameAt !== 0 && now - lastFrameAt < TARGET_FRAME_MS) {
        raf = requestAnimationFrame(tick);
        return;
      }
      lastFrameAt = now;
      const dt = (now - last) / 1000;
      last = now;
      if (resolveActiveRef.current && resolveRef.current > 0) {
        const next = Math.max(0, resolveRef.current - RESOLVE_DRAIN_RATE * dt);
        resolveRef.current = next;
        if (next <= 0) {
          resolveActiveRef.current = false;
          setResolveActive(false);
          setResolve(0);
          lastStateSync = now;
        } else if (now - lastStateSync >= STATE_SYNC_MS) {
          lastStateSync = now;
          setResolve(next);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [bossPhase]);

  const actionNames = ["FIGHT", "ACT", "ITEM", "MERCY"];
  const actionColors = ["#FF6633", "#FFD700", "#33FF33", "#FF66FF"];
  const effectiveBossMaxHp = bossPhase === 2 ? cfg.phase2BossHp : cfg.bossMaxHp;
  const bossHpPercent = Math.max(0, (bossHp / effectiveBossMaxHp) * 100);
  const playerHpPercent = Math.max(0, (playerHp / cfg.playerMaxHp) * 100);

  const getBossAnimation = () => {
    if (bossVanishing) return "bossVanish 0.5s ease-in forwards";
    if (bossAppearing) return "bossAppear 0.4s ease-out forwards";
    if (bossHitGlow) return "bossGlowGreen 0.6s ease-out";
    if (bossDodging) return "bossDodge 0.8s ease-in-out";
    if (bossDistracted) return "bossDistracted 0.5s ease-in-out infinite, bossBreathe 2.5s ease-in-out infinite";
    return "bossBreathe 2.5s ease-in-out infinite";
  };

  // --- Helpers for mini gnarpy + beam positioning ---
  // All positions relative to the battle-box wrapper (which is sized to border-box of the battle box)
  const WRAPPER_W = BOX_W + BORDER_W * 2;
  const WRAPPER_H = BOX_H + BORDER_W * 2;
  const GAP = 4; // gap between image edge and box border

  const getMiniStyle = (mg: MiniGnarpy): React.CSSProperties => {
    const half = MINI_IMG_SIZE / 2;
    switch (mg.side) {
      case "top":
        return { left: BORDER_W + mg.pos * BOX_W - half, top: -(MINI_IMG_SIZE + GAP) };
      case "bottom":
        return { left: BORDER_W + mg.pos * BOX_W - half, top: WRAPPER_H + GAP };
      case "left":
        return { left: -(MINI_IMG_SIZE + GAP), top: BORDER_W + mg.pos * BOX_H - half };
      case "right":
        return { left: WRAPPER_W + GAP, top: BORDER_W + mg.pos * BOX_H - half };
    }
  };

  const getMiniAnim = (mg: MiniGnarpy): string => {
    switch (mg.state) {
      case "appearing": return "miniPopIn 0.35s ease-out forwards";
      case "warning": return "bossBreathe 0.4s ease-in-out infinite";
      case "charging": return "miniChargeFlash 0.2s ease-in-out infinite";
      case "firing": return "miniFiringGlow 0.15s ease-in-out infinite";
      case "done": return "miniFadeOut 0.3s ease-in forwards";
      default: return "";
    }
  };

  const getMiniRotation = (side: MiniSide): string => {
    switch (side) {
      case "top": return "scaleY(-1)"; // flip upside down to face box
      case "bottom": return "scaleY(1)";
      case "left": return "rotate(90deg)";
      case "right": return "rotate(-90deg)";
    }
  };

  // Get beam style: beam starts from the gnarpy image center and goes to the opposite side
  const getBeamStyle = (mg: MiniGnarpy): React.CSSProperties | null => {
    if (mg.state !== "firing") return null;
    const isH = mg.side === "left" || mg.side === "right";
    const wt = mg.waveType || "normal";
    const linger = wt === "sweep" ? SWEEP_BEAM_LINGER : wt === "spiral" ? SPIRAL_BEAM_LINGER : BEAM_LINGER;
    if (isH) {
      const beamY = BORDER_W + mg.pos * BOX_H - BEAM_THICKNESS / 2;
      const startX = mg.side === "left" ? -(GAP + MINI_IMG_SIZE / 2) : 0;
      const width = mg.side === "left"
        ? WRAPPER_W + GAP + MINI_IMG_SIZE / 2
        : WRAPPER_W + GAP + MINI_IMG_SIZE / 2;
      return {
        position: "absolute" as const,
        left: startX,
        top: beamY,
        width,
        height: BEAM_THICKNESS,
        zIndex: 5,
        pointerEvents: "none" as const,
        animation: `beamExpand ${linger}ms ease-out forwards`,
      };
    } else {
      const beamX = BORDER_W + mg.pos * BOX_W - BEAM_THICKNESS / 2;
      const startY = mg.side === "top" ? -(GAP + MINI_IMG_SIZE / 2) : 0;
      const height = mg.side === "top"
        ? WRAPPER_H + GAP + MINI_IMG_SIZE / 2
        : WRAPPER_H + GAP + MINI_IMG_SIZE / 2;
      return {
        position: "absolute" as const,
        left: beamX,
        top: startY,
        width: BEAM_THICKNESS,
        height,
        zIndex: 5,
        pointerEvents: "none" as const,
        animation: `beamExpandH ${linger}ms ease-out forwards`,
      };
    }
  };

  const isInAttack = phase === "bossAttack";

  return (
    <div
      ref={containerRef}
      className="flex flex-col items-center w-full"
      style={{ minHeight: "100vh", background: "#000000", color: COL.text, fontFamily: "'Courier New', monospace", position: "relative", overflow: "hidden" }}
    >
      {/* Phase 2 background stars */}
      {bossPhase === 2 && (
        <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 0 }}>
          {p2BgStars.map((s, i) => (
            <div
              key={`p2star-${i}`}
              className="absolute rounded-full"
              style={{
                left: `${s.x}%`,
                top: `${s.y}%`,
                width: s.size,
                height: s.size,
                backgroundColor: s.color,
                boxShadow: `0 0 ${s.size * 2}px ${s.color}`,
                animation: `p2StarTwinkle ${s.twinkleSpeed}s ease-in-out ${s.twinklePhase}s infinite`,
                opacity: 0.7,
              }}
            />
          ))}
          <style>{`
            @keyframes p2StarTwinkle {
              0%, 100% { opacity: 0.3; transform: scale(0.8); }
              50% { opacity: 1; transform: scale(1.3); }
            }
          `}</style>
        </div>
      )}
      {/* Phase 2 large boss background image */}
      {bossPhase === 2 && (
        <div className="absolute pointer-events-none flex items-center justify-center" style={{
          top: "45%", left: "50%", transform: "translate(-50%, -50%)",
          width: "130%", maxWidth: 1200, zIndex: 0, opacity: 0.90,
          filter: "drop-shadow(0 0 40px #23ac38) drop-shadow(0 0 80px #86cecb44)",
        }}>
          <img src={bossImg2} alt="" draggable={false} className="select-none w-full h-auto" style={{ imageRendering: "auto" }} />
        </div>
      )}
      {/* Phase 2 scanline overlay */}
      {bossPhase === 2 && (
        <div className="absolute inset-0 pointer-events-none" style={{
          zIndex: 2,
          backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.30) 2px, rgba(0,0,0,0.30) 4px)",
          backgroundSize: "100% 4px",
          mixBlendMode: "multiply",
          animation: "scanlineScroll 8s linear infinite",
        }}>
          <style>{`@keyframes scanlineScroll { from { background-position: 0 0; } to { background-position: 0 100px; } }`}</style>
        </div>
      )}
      {/* Top bar */}
      <div className={`${retro.toolbar} flex items-center justify-between w-full`} style={{ position: "relative", zIndex: 1 }}>
        <button onClick={onBack} className="text-[14px] hover:opacity-80 flex items-center gap-2" style={S_ACCENT}>
          ← Back to Arcade
        </button>
        <div className="flex items-center gap-4">
          <span className="text-[14px]" style={{ color: "#FFD700" }}>
            <Trophy size={14} className="inline mr-1" />HI: {highScore}
          </span>
          <button
            onClick={toggleMute}
            className="hover:opacity-80 transition-opacity"
            style={{
              color: isMuted ? "#FF4444" : "#00FF00",
              background: "none",
              border: "1px solid",
              borderColor: isMuted ? "#FF444466" : "#00FF0044",
              borderRadius: 4,
              padding: "3px 6px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontSize: 10,
              fontFamily: "'Courier New', monospace",
              letterSpacing: "0.1em",
            }}
            title={isMuted ? "Unmute music" : "Mute music"}
          >
            {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            <span>{isMuted ? "OFF" : "ON"}</span>
          </button>
          <input
            type="range"
            min={0}
            max={100}
            value={isMuted ? 0 : musicVolume}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              setMusicVolume(v);
              if (v > 0 && isMuted) setIsMuted(false);
              if (v === 0 && !isMuted) setIsMuted(true);
            }}
            title={`Volume: ${isMuted ? 0 : musicVolume}%`}
            style={{
              width: 60,
              height: 14,
              accentColor: "#00FF00",
              cursor: "pointer",
              opacity: 0.8,
            }}
          />
          <button
            onClick={toggleFullscreen}
            className="hover:opacity-80 transition-opacity"
            style={{
              color: "#86cecb",
              background: "none",
              border: "1px solid #86cecb44",
              borderRadius: 4,
              padding: "3px 6px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontSize: 10,
              fontFamily: "'Courier New', monospace",
              letterSpacing: "0.1em",
            }}
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? <Minimize size={14} /> : <Maximize size={14} />}
          </button>
          {cfg.phase2Enabled && bossPhase === 1 && (
            <button
              onClick={() => {
                setBossHp(0);
                setBossHitGlow(true);
                setTimeout(() => setBossHitGlow(false), 600);
                const stars: typeof cinematicStarsRef.current = [];
                for (let i = 0; i < 80; i++) {
                  stars.push({
                    x: Math.random() * 100, y: Math.random() * 100,
                    size: Math.random() * 3 + 1,
                    color: Math.random() > 0.5 ? "#23ac38" : "#86cecb",
                    speed: Math.random() * 0.3 + 0.1,
                    twinkleSpeed: Math.random() * 2 + 1,
                    twinklePhase: Math.random() * Math.PI * 2,
                  });
                }
                cinematicStarsRef.current = stars;
                setCinematicStep(-1);
                setCinematicFade(0);
                setBossVisible(false);
                setPhase("phase2Cinematic");
                requestAnimationFrame(() => setCinematicFade(1));
              }}
              style={{
                background: "#FF00FF22",
                color: "#FF00FF",
                border: "1px solid #FF00FF66",
                fontSize: 10,
                fontFamily: "'Courier New', monospace",
                padding: "3px 8px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 4,
                letterSpacing: "0.1em",
              }}
              title="Skip to Phase 2"
            >
              ⚡ P2
            </button>
          )}
        </div>
      </div>




      <div className="flex-1 flex flex-col items-center justify-center py-6 gap-6 w-full max-w-[700px] px-4" style={{ position: "relative", zIndex: 1 }}>
        <div style={DISPLAY_CONTENTS}>
        {/* Boss display */}
        <div className="w-full flex flex-col items-center gap-3">
          <div className="flex items-center gap-3">
            <div className="text-[24px] tracking-[0.2em]" style={{ color: bossPhase === 2 ? "#FF00FF" : "#FF6A6A" }}>{bossPhase === 2 ? cfg.phase2BossName : cfg.bossName}</div>
            {bossDistracted && (
              <span className="text-[11px] px-2 py-0.5" style={{ color: "#FFD700", background: "rgba(255,215,0,0.15)", border: "1px solid #FFD700", animation: "bossDistracted 0.5s ease-in-out infinite" }}>
                DISTRACTED!
              </span>
            )}
          </div>

          {/* Boss HP */}
          <div className="flex items-center gap-3 w-full max-w-[520px]">
            <span className="text-[14px]" style={{ color: "#888" }}>HP</span>
            <div className="flex-1 h-[22px] relative" style={{ background: COL.bossHpBg, border: `2px solid ${bossPhase === 2 ? "#FF00FF" : "#555"}` }}>
              <div className="h-full transition-all duration-300" style={{ width: `${bossHpPercent}%`, background: bossPhase === 2 ? "#FF00FF" : bossHpPercent > 50 ? COL.bossHp : bossHpPercent > 25 ? "#FFAA00" : "#FF3333" }} />
            </div>
            <span className="text-[12px]" style={{ color: "#888" }}>{bossHp}/{effectiveBossMaxHp}{bossPhase === 2 ? " ★P2" : ""}</span>
          </div>

          {/* Boss sprite — Phase 2 uses background-only image, no floating sprite */}
          {bossPhase !== 2 && (
            <div className="flex items-center justify-center" style={{ width: 200, height: 180 }}>
              {(bossVisible || bossVanishing) && (
                <img src={bossImg} alt="Gnarpy of Doom" draggable={false} className="select-none" style={{ width: 180, height: "auto", imageRendering: "auto", animation: getBossAnimation(), transform: `translate(${bossIdleOffset.x}px, ${bossIdleOffset.y}px)`, transition: "transform 2s ease-in-out" }} />
              )}
              {!bossVisible && !bossVanishing && (
                <div className="text-[12px] tracking-[0.3em]" style={{ color: "#00FF0044" }}>* * *</div>
              )}
            </div>
          )}
        </div>

        {/* Phase 2 Battle Box — rendered instead of canvas during Phase 2 boss attacks */}
        {isInAttack && currentAttackMode === "phase2Stage" && (
          <BossFightPhase2
            key={`p2-attack-${turnCount}-${p2AttackName}`}
            ref={phase2Ref}
            colors={cfg.phase2Colors}
            bossName={cfg.phase2BossName}
            bossMaxHp={cfg.phase2BossHp}
            playerMaxHp={cfg.playerMaxHp}
            startingScore={score}
            onBack={onBack}
            hideDebugControls
            onDebugStateChange={setP2DebugState}
            battleBoxOnly
            onPlayerDamage={handlePhase2Damage}
            onAttackComplete={handlePhase2AttackComplete}
            autoStartAttack={p2AttackName}
            resolveShielded={resolveActive && resolve > 0}
          />
        )}

        {/* Battle Box Wrapper — sized exactly to border box, overflow visible for gnarpys + beams */}
        {!(isInAttack && currentAttackMode === "phase2Stage") && (
        <div
          className="relative"
          style={{
            width: WRAPPER_W,
            height: WRAPPER_H,
            overflow: "visible",
            // Extra margin so gnarpys/saucer outside don't overlap other UI
            margin: `${isInAttack && currentAttackMode === "tractorBeam" ? TB_SAUCER_H + 8 : MINI_IMG_SIZE + 8}px 0`,
          }}
        >
          {/* The actual battle box */}
          <div style={{
            width: "100%",
            height: "100%",
            border: `${BORDER_W}px solid ${isInAttack ? "#00FF00" : COL.boxBorder}`,
            background: COL.boxBg,
            boxShadow: isInAttack ? "0 0 15px rgba(0,255,0,0.3)" : "none",
            transition: "border-color 0.3s, box-shadow 0.3s",
            position: "relative",
            zIndex: 2,
            boxSizing: "border-box",
          }}>
            <canvas ref={canvasRef} width={BOX_W} height={BOX_H} style={{ display: "block" }} />
          </div>

          {/* Tractor Beam saucer — positioned above the box */}
          {isInAttack && currentAttackMode === "tractorBeam" && (
            <div
              ref={tbSaucerElRef}
              className="absolute pointer-events-none"
              style={{
                width: TB_SAUCER_W,
                height: TB_SAUCER_H,
                left: BORDER_W + tbSaucerXRef.current - TB_SAUCER_W / 2,
                top: -(TB_SAUCER_H - 8),
                zIndex: 20,
                filter: `drop-shadow(0 0 12px rgba(0, 255, 0, 0.6))`,
              }}
            >
              <img
                src={saucerImg}
                alt="Gnarpy Saucer"
                draggable={false}
                className="select-none"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  imageRendering: "pixelated",
                }}
              />
            </div>
          )}

          {/* Mini Gnarpy images — outside the box */}
          {isInAttack && miniGnarpysRender
            .filter(mg => mg.state !== "waiting")
            .map(mg => (
              <div
                key={mg.id}
                className="absolute pointer-events-none"
                style={{
                  width: MINI_IMG_SIZE,
                  height: MINI_IMG_SIZE,
                  ...getMiniStyle(mg),
                  animation: getMiniAnim(mg),
                  zIndex: 10,
                }}
              >
                <img
                  src={bossPhase === 2 ? bossImg2 : bossImg}
                  alt="Mini Gnarpy"
                  draggable={false}
                  className="select-none"
                  style={{
                    width: MINI_IMG_SIZE,
                    height: MINI_IMG_SIZE,
                    objectFit: "contain",
                    transform: getMiniRotation(mg.side),
                    imageRendering: "auto",
                  }}
                />
              </div>
            ))
          }

          {/* Beam HTML overlays — fired from gnarpy images across the box */}
          {isInAttack && miniGnarpysRender
            .filter(mg => mg.state === "firing")
            .map(mg => {
              const style = getBeamStyle(mg);
              if (!style) return null;
              const isH = mg.side === "left" || mg.side === "right";
              return (
                <div key={`beam-${mg.id}`} style={style}>
                  {/* Outer glow */}
                  <div style={{
                    position: "absolute",
                    inset: isH ? `-${BEAM_THICKNESS * 0.6}px 0` : `0 -${BEAM_THICKNESS * 0.6}px`,
                    background: isH
                      ? "linear-gradient(to bottom, transparent 0%, rgba(0,255,0,0.15) 30%, rgba(0,255,0,0.25) 50%, rgba(0,255,0,0.15) 70%, transparent 100%)"
                      : "linear-gradient(to right, transparent 0%, rgba(0,255,0,0.15) 30%, rgba(0,255,0,0.25) 50%, rgba(0,255,0,0.15) 70%, transparent 100%)",
                  }} />
                  {/* Main beam */}
                  <div style={{
                    position: "absolute",
                    inset: 0,
                    background: "#00FF00",
                    opacity: 0.7,
                    boxShadow: "0 0 12px #00FF00, 0 0 24px rgba(0,255,0,0.4)",
                  }} />
                  {/* Bright core */}
                  <div style={{
                    position: "absolute",
                    ...(isH
                      ? { top: "50%", left: 0, right: 0, height: 6, marginTop: -3 }
                      : { left: "50%", top: 0, bottom: 0, width: 6, marginLeft: -3 }),
                    background: "#AAFFAA",
                  }} />
                  {/* White center line */}
                  <div style={{
                    position: "absolute",
                    ...(isH
                      ? { top: "50%", left: 0, right: 0, height: 2, marginTop: -1 }
                      : { left: "50%", top: 0, bottom: 0, width: 2, marginLeft: -1 }),
                    background: "#FFFFFF",
                    opacity: 0.9,
                  }} />
                </div>
              );
            })
          }

          {/* Wave 5: Safe zone flash — red safe box + lasers everywhere else */}
          {isInAttack && safeZoneRender.active && (() => {
            const halfSz = SAFEZONE_BOX_SIZE / 2;
            const szLeft = BORDER_W + safeZoneRender.x - halfSz;
            const szTop = BORDER_W + safeZoneRender.y - halfSz;
            return (
              <div style={DISPLAY_CONTENTS}>
                {/* Laser overlay (everything outside safe zone) */}
                {safeZoneRender.lasersOn && (
                  <div className="absolute pointer-events-none" style={{
                    left: BORDER_W, top: BORDER_W, width: BOX_W, height: BOX_H,
                    zIndex: 6, overflow: "hidden",
                    animation: `laserFlash ${SAFEZONE_LASER_DURATION}ms ease-in-out forwards`,
                  }}>
                    {/* Green laser fill with cutout for safe zone using clip-path */}
                    <div style={{
                      position: "absolute", inset: 0,
                      background: "linear-gradient(135deg, rgba(0,255,0,0.85) 0%, rgba(0,200,0,0.9) 50%, rgba(0,255,0,0.85) 100%)",
                      clipPath: `polygon(
                        0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%,
                        ${safeZoneRender.x - halfSz}px ${safeZoneRender.y - halfSz}px,
                        ${safeZoneRender.x - halfSz}px ${safeZoneRender.y + halfSz}px,
                        ${safeZoneRender.x + halfSz}px ${safeZoneRender.y + halfSz}px,
                        ${safeZoneRender.x + halfSz}px ${safeZoneRender.y - halfSz}px,
                        ${safeZoneRender.x - halfSz}px ${safeZoneRender.y - halfSz}px
                      )`,
                      boxShadow: "inset 0 0 60px rgba(0,255,0,0.5)",
                    }} />
                    {/* Scanline overlay */}
                    <div style={{
                      position: "absolute", inset: 0,
                      background: "repeating-linear-gradient(0deg, transparent 0px, transparent 2px, rgba(0,0,0,0.15) 2px, rgba(0,0,0,0.15) 4px)",
                      animation: "laserScanline 0.3s linear infinite",
                      clipPath: `polygon(
                        0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%,
                        ${safeZoneRender.x - halfSz}px ${safeZoneRender.y - halfSz}px,
                        ${safeZoneRender.x - halfSz}px ${safeZoneRender.y + halfSz}px,
                        ${safeZoneRender.x + halfSz}px ${safeZoneRender.y + halfSz}px,
                        ${safeZoneRender.x + halfSz}px ${safeZoneRender.y - halfSz}px,
                        ${safeZoneRender.x - halfSz}px ${safeZoneRender.y - halfSz}px
                      )`,
                    }} />
                    {/* Bright cross beams for visual flair */}
                    {[0, 45, 90, 135].map(angle => (
                      <div key={angle} style={{
                        position: "absolute",
                        left: safeZoneRender.x - 1, top: 0,
                        width: 2, height: BOX_H,
                        background: "rgba(255,255,255,0.3)",
                        transformOrigin: `50% ${safeZoneRender.y}px`,
                        transform: `rotate(${angle}deg)`,
                      }} />
                    ))}
                  </div>
                )}
                {/* Safe zone red box */}
                <div className="absolute pointer-events-none" style={{
                  left: szLeft, top: szTop,
                  width: SAFEZONE_BOX_SIZE, height: SAFEZONE_BOX_SIZE,
                  border: "2px solid #FF0000",
                  background: safeZoneRender.lasersOn ? "rgba(0,0,0,0.95)" : "rgba(255,0,0,0.15)",
                  animation: "safeZonePulse 0.5s ease-in-out infinite",
                  zIndex: 8,
                }}>
                  {/* Corner markers */}
                  {[[0,0],[1,0],[0,1],[1,1]].map(([cx,cy], i) => (
                    <div key={i} style={{
                      position: "absolute",
                      [cy === 0 ? "top" : "bottom"]: -1,
                      [cx === 0 ? "left" : "right"]: -1,
                      width: 6, height: 6,
                      borderTop: cy === 0 ? "2px solid #FF4444" : "none",
                      borderBottom: cy === 1 ? "2px solid #FF4444" : "none",
                      borderLeft: cx === 0 ? "2px solid #FF4444" : "none",
                      borderRight: cx === 1 ? "2px solid #FF4444" : "none",
                    }} />
                  ))}
                  {/* "SAFE" label */}
                  <div style={{
                    position: "absolute", top: "50%", left: "50%",
                    transform: "translate(-50%, -50%)",
                    color: "#FF4444", fontSize: 8, letterSpacing: "0.15em",
                    fontFamily: "'Courier New', monospace",
                    textShadow: "0 0 4px rgba(255,0,0,0.6)",
                  }}>SAFE</div>
                </div>
              </div>
            );
          })()}

          {/* Wave 4: Rotating beam — orbiting mini gnarpy (beam drawn on canvas) */}
          {isInAttack && rotatingBeamRender.active && (() => {
            const a = rotatingBeamRender.angle;
            const half = MINI_IMG_SIZE / 2;
            const cx = BORDER_W + BOX_W / 2;
            const cy = BORDER_W + BOX_H / 2;
            // Direction from center outward (0 = up, clockwise)
            const dirX = Math.sin(a);
            const dirY = -Math.cos(a);

            // Smooth circular orbit: push Gnarpy outward from the exit point along the direction vector
            // Find exit point on box edge (ray from center in direction dirX, dirY)
            const candidates: number[] = [];
            if (dirX > 0.001) candidates.push((BOX_W / 2) / dirX);
            if (dirX < -0.001) candidates.push((-BOX_W / 2) / dirX);
            if (dirY > 0.001) candidates.push((BOX_H / 2) / dirY);
            if (dirY < -0.001) candidates.push((-BOX_H / 2) / dirY);
            const t = Math.min(...candidates.filter(v => v > 0));
            const exitX = cx + dirX * t;
            const exitY = cy + dirY * t;

            // Position Gnarpy continuously along the direction vector, offset outward from exit
            const outOffset = half + GAP + BORDER_W;
            const gcx = exitX + dirX * outOffset;
            const gcy = exitY + dirY * outOffset;
            const gnarpyLeft = gcx - half;
            const gnarpyTop = gcy - half;

            // Smooth sprite rotation based on angle (degrees, 0 = facing down toward box)
            const spriteRotDeg = a * (180 / Math.PI);

            // Compute far exit point (opposite side from Gnarpy)
            const farCandidates: number[] = [];
            if (-dirX > 0.001) farCandidates.push((BOX_W / 2) / (-dirX));
            if (-dirX < -0.001) farCandidates.push((-BOX_W / 2) / (-dirX));
            if (-dirY > 0.001) farCandidates.push((BOX_H / 2) / (-dirY));
            if (-dirY < -0.001) farCandidates.push((-BOX_H / 2) / (-dirY));
            const ft = Math.min(...farCandidates.filter(v => v > 0));
            const farX = cx + (-dirX) * ft;
            const farY = cy + (-dirY) * ft;

            // Beam from Gnarpy center to far exit
            const beamDx = farX - gcx;
            const beamDy = farY - gcy;
            const beamLength = Math.sqrt(beamDx * beamDx + beamDy * beamDy);
            const beamAngleDeg = Math.atan2(beamDy, beamDx) * (180 / Math.PI);

            return (
              <div style={DISPLAY_CONTENTS}>
                {/* Orbiting mini Gnarpy */}
                <div className="absolute pointer-events-none" style={{
                  width: MINI_IMG_SIZE, height: MINI_IMG_SIZE,
                  left: gnarpyLeft, top: gnarpyTop,
                  animation: "miniFiringGlow 0.15s ease-in-out infinite", zIndex: 10,
                }}>
                  <img src={bossPhase === 2 ? bossImg2 : bossImg} alt="Rotating Gnarpy" draggable={false} className="select-none"
                    style={{ width: MINI_IMG_SIZE, height: MINI_IMG_SIZE, objectFit: "contain",
                      transform: `rotate(${spriteRotDeg}deg)`, imageRendering: "auto" }} />
                </div>
                {/* Beam firing from Gnarpy toward opposite side */}
                <div className="pointer-events-none" style={{
                  position: "absolute",
                  left: gcx,
                  top: gcy - BEAM_THICKNESS / 2,
                  width: beamLength,
                  height: BEAM_THICKNESS,
                  transformOrigin: "0% 50%",
                  transform: `rotate(${beamAngleDeg}deg)`,
                  zIndex: 5,
                }}>
                  {/* Outer glow */}
                  <div style={{
                    position: "absolute",
                    inset: `-${BEAM_THICKNESS * 0.6}px 0`,
                    background: "linear-gradient(to bottom, transparent 0%, rgba(0,255,0,0.15) 30%, rgba(0,255,0,0.25) 50%, rgba(0,255,0,0.15) 70%, transparent 100%)",
                  }} />
                  {/* Main beam */}
                  <div style={{
                    position: "absolute", inset: 0, background: "#00FF00", opacity: 0.7,
                    boxShadow: "0 0 12px #00FF00, 0 0 24px rgba(0,255,0,0.4)",
                  }} />
                  {/* Bright core */}
                  <div style={{
                    position: "absolute", top: "50%", left: 0, right: 0, height: 6, marginTop: -3,
                    background: "#AAFFAA",
                  }} />
                  {/* White center line */}
                  <div style={{
                    position: "absolute", top: "50%", left: 0, right: 0, height: 2, marginTop: -1,
                    background: "#FFFFFF", opacity: 0.9,
                  }} />
                </div>
              </div>
            );
          })()}
        </div>
        )}

        {/* Boss attack instruction */}
        {isInAttack && (
          <div className="text-center" style={{ marginTop: -8 }}>
            {currentAttackMode === "phase2Stage" ? (
              <div style={DISPLAY_CONTENTS}>
                <div className="text-[12px] tracking-[0.2em]" style={{ color: "#FF00FF" }}>
                  {p2AttackName === "mgbeam" ? "★ Miku, Gnarpy, Beam!!!! ★" : p2AttackName === "stage" ? "Yeah, I lied. The lasers are actually invisible" : p2AttackName === "empress" ? "★ PRISMATIC ONSLAUGHT ★" : p2AttackName === "frustration" ? "★ THIS IS YOUR FINAL TEST ★" : `★ ${p2AttackName.toUpperCase()} ★`}
                </div>

              </div>
            ) : currentAttackMode === "spaceInvaders" ? (
              <div style={DISPLAY_CONTENTS}>
                <div className="text-[12px] tracking-[0.2em]" style={{ color: "#00FF00" }}>SPACE INVADERS!</div>
                <div className="text-[10px] mt-0.5" style={{ color: "#00FF0055" }}>[A/D or ←/→] Move &nbsp; Auto-Fire ON</div>
              </div>
            ) : currentAttackMode === "bulletStorm" ? (
              <div style={DISPLAY_CONTENTS}>
                <div className="text-[12px] tracking-[0.2em]" style={{ color: "#FFFFFF" }}>BULLET STORM!</div>
                <div className="text-[10px] mt-0.5" style={{ color: "#FFFFFF55" }}>[WASD / Arrow Keys]</div>
              </div>
            ) : currentAttackMode === "tractorBeam" ? (
              <div style={DISPLAY_CONTENTS}>
                <div className="text-[12px] tracking-[0.2em]" style={{ color: "#00FF00" }}>TRACTOR BEAM!</div>
                <div className="text-[10px] mt-0.5" style={{ color: "#00FF0055" }}>[WASD / Arrow Keys] Escape the beam!</div>
              </div>
            ) : (
              <div style={DISPLAY_CONTENTS}>
                <div className="text-[12px] tracking-[0.2em]" style={{ color: "#00FF00" }}>DODGE THE BEAMS!</div>
                <div className="text-[10px] mt-0.5" style={{ color: "#00FF0055" }}>[WASD / Arrow Keys]</div>
              </div>
            )}
          </div>
        )}

        {/* ====== STANDALONE ATTACK BAR (only visible during fightAnim) ====== */}
        {phase === "fightAnim" && (
          <div
            className="w-full max-w-[620px] cursor-pointer select-none"
            onClick={stopFightBar}
            style={{ fontFamily: "'Courier New', monospace", imageRendering: "pixelated" }}
          >
            <div className="flex items-center gap-0 mb-1">
              <span className="text-[10px]" style={{ color: "#00FF00" }}>+</span>
              <div className="flex-1 h-[2px]" style={{ background: "#00FF00" }} />
              <span className="text-[10px] px-2 tracking-[0.4em]" style={{ color: "#FFD700", textShadow: "0 0 6px #FFD700" }}>STRIKE</span>
              <div className="flex-1 h-[2px]" style={{ background: "#00FF00" }} />
              <span className="text-[10px]" style={{ color: "#00FF00" }}>+</span>
            </div>

            <div className="flex justify-between mb-0.5 px-1">
              <span className="text-[9px] tracking-wider" style={{ color: "#FF444466" }}>[-]</span>
              <span className="text-[9px] tracking-wider" style={{ color: "#FFD70066" }}>[~]</span>
              <span className="text-[9px] tracking-[0.2em]" style={{ color: "#00FF00" }}>[!!!]</span>
              <span className="text-[9px] tracking-wider" style={{ color: "#FFD70066" }}>[~]</span>
              <span className="text-[9px] tracking-wider" style={{ color: "#FF444466" }}>[-]</span>
            </div>

            <div
              className="relative w-full"
              style={{
                height: 44,
                border: "3px solid #00FF00",
                background: "#000800",
                boxShadow: !fightBarStopped
                  ? "0 0 8px rgba(0,255,0,0.3), inset 0 0 12px rgba(0,255,0,0.05)"
                  : "0 0 15px rgba(0,255,0,0.5)",
                imageRendering: "pixelated",
              }}
            >
              <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: "linear-gradient(rgba(0,255,0,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,0,0.04) 1px, transparent 1px)", backgroundSize: "4px 4px" }} />

              {Array.from({ length: 20 }, (_, i) => {
                const pct = (i / 20) * 100;
                const distFromMid = Math.abs(pct + 2.5 - 50);
                const isEdge = distFromMid > 35;
                const isSweet = distFromMid < 8;
                return (
                  <div key={i} className="absolute top-[3px]" style={{ left: `${pct}%`, width: "4.8%", height: "calc(100% - 6px)", background: isSweet ? "rgba(0,255,0,0.15)" : isEdge ? "rgba(255,68,68,0.08)" : "rgba(255,215,0,0.04)", borderRight: "1px solid rgba(0,255,0,0.08)" }} />
                );
              })}

              <div className="absolute top-0 h-full" style={{ left: "50%", width: 4, marginLeft: -2, background: "#00FF00", opacity: 0.35 }} />
              <div className="absolute left-0 w-full" style={{ top: "50%", height: 2, marginTop: -1, background: "#00FF00", opacity: 0.1 }} />
              <div className="absolute top-0 h-full" style={{ left: "25%", width: 2, marginLeft: -1, background: "#FFD700", opacity: 0.15 }} />
              <div className="absolute top-0 h-full" style={{ left: "75%", width: 2, marginLeft: -1, background: "#FFD700", opacity: 0.15 }} />

              <div className="absolute top-[2px] left-[2px]" style={{ width: 6, height: 6, background: "#FF4444", opacity: 0.4 }} />
              <div className="absolute top-[2px] right-[2px]" style={{ width: 6, height: 6, background: "#FF4444", opacity: 0.4 }} />
              <div className="absolute bottom-[2px] left-[2px]" style={{ width: 6, height: 6, background: "#FF4444", opacity: 0.4 }} />
              <div className="absolute bottom-[2px] right-[2px]" style={{ width: 6, height: 6, background: "#FF4444", opacity: 0.4 }} />

              <div className="absolute top-0 h-full" style={{ left: `${fightBarPos}%`, width: 8, marginLeft: -4, background: fightSliderColor, boxShadow: `0 0 ${fightBarStopped ? 20 : 8}px ${fightSliderColor}`, imageRendering: "pixelated" }}>
                <div className="absolute" style={{ top: -4, left: -2, width: 12, height: 4, background: "#FFD700" }} />
                <div className="absolute" style={{ bottom: -4, left: -2, width: 12, height: 4, background: "#FFD700" }} />
                <div className="absolute" style={{ top: "50%", left: "50%", width: 4, height: 4, marginTop: -2, marginLeft: -2, background: "#FFFFFF" }} />
              </div>
            </div>

            <div className="flex justify-between px-0 mt-0.5" style={{ height: 8 }}>
              {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((t) => (
                <div key={t} style={{ width: t === 50 ? 3 : 1, height: t === 50 ? 8 : t % 20 === 0 ? 6 : 3, background: t === 50 ? "#00FF00" : "#00FF0044" }} />
              ))}
            </div>

            <div className="text-center mt-1.5" style={{ minHeight: 24 }}>
              {fightBarStopped ? (
                <span className="text-[16px] tracking-[0.3em]" style={{ color: fightSliderColor, textShadow: `0 0 10px ${fightSliderColor}, 0 0 20px ${fightSliderColor}66`, animation: "resultFlash 0.3s ease-out" }}>{fightResultLabel}</span>
              ) : (
                <span className="text-[10px] tracking-[0.2em]" style={{ color: "#FFD70055" }}>[ Z / SPACE / ENTER / CLICK ]</span>
              )}
            </div>

            <div className="flex items-center gap-0 mt-0.5">
              <span className="text-[10px]" style={{ color: "#00FF0044" }}>+</span>
              <div className="flex-1 h-[1px]" style={{ background: "#00FF0033" }} />
              <span className="text-[8px] px-2 tracking-[0.3em]" style={{ color: "#00FF0033" }}>ATK.SYS.v3</span>
              <div className="flex-1 h-[1px]" style={{ background: "#00FF0033" }} />
              <span className="text-[10px]" style={{ color: "#00FF0044" }}>+</span>
            </div>
          </div>
        )}

        {/* Action area / submenu / text display */}
        <div
          className="w-full max-w-[520px] min-h-[120px] p-4 flex flex-col justify-center"
          style={{ border: `2px solid ${COL.boxBorder}`, background: "#000" }}
        >
          {phase === "gameOver" ? (
            <div className="flex flex-col items-center gap-3">
              <div className="text-[22px]" style={{ color: "#FF4444" }}>YOU WERE DEFEATED</div>
              <div className="text-[14px]" style={{ color: "#888" }}>Score: {score}</div>
              <button onClick={onBack} className="text-[14px] px-6 py-2 cursor-pointer" style={{ color: "#4A7BFF", border: "2px solid #4A7BFF", background: "transparent" }}>Return</button>
            </div>
          ) : phase === "victory" ? (
            <div className="flex flex-col items-center gap-3">
              <div className="text-[22px]" style={{ color: "#00FF00" }}>{bossPhase === 2 ? cfg.phase2BossName : cfg.bossName} WAS DEFEATED!</div>
              <div className="text-[14px]" style={{ color: "#FFD700" }}>Final Score: {score}</div>
              <button onClick={onBack} className="text-[14px] px-6 py-2 cursor-pointer" style={{ color: "#4A7BFF", border: "2px solid #4A7BFF", background: "transparent" }}>Return</button>
            </div>
          ) : phase === "frustrationVictory" ? (
            <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {/* Full black fade overlay */}
              <div style={{
                position: "absolute", inset: 0, background: "#000",
                opacity: frustVictoryFade,
                transition: "opacity 3s ease-in",
                zIndex: 10,
              }} />
              {/* Scoreboard fades in after the black screen */}
              <div style={{
                position: "relative", zIndex: 20,
                opacity: frustVictoryFade,
                transition: "opacity 4s ease-in 2.5s",
                textAlign: "center",
              }}>
                <div className="text-[11px] tracking-[0.3em] mb-3" style={{ color: "#FFD70088" }}>
                  ★ YOU SURVIVED ★
                </div>
                <div className="text-[22px] mb-1" style={{
                  color: "#00FF00",
                  textShadow: "0 0 15px #00FF0066, 0 0 30px #00FF0033",
                  animation: "resultFlash 2s ease-in-out infinite alternate",
                }}>
                  {cfg.phase2BossName} HAS BEEN OUTLASTED
                </div>
                <div className="text-[12px] mt-2 mb-1" style={{ color: "#FF00FF88" }}>
                  "I'm surprised you actually beat this ridiculous mess of code."
                </div>
                <div className="text-[16px] mt-3" style={{ color: "#FFD700" }}>
                  Final Score: {score}
                </div>
                <div className="text-[12px] mt-1" style={{ color: "#FFD70066" }}>
                  (includes +2000 Frustration Survival bonus)
                </div>
                {score >= highScore && (
                  <div className="text-[12px] mt-1" style={{ color: "#FF6600", animation: "resultFlash 1s ease-in-out infinite alternate" }}>
                    ★ NEW HIGH SCORE ★
                  </div>
                )}
                <div className="flex gap-3 mt-4 justify-center">
                  <button onClick={onBack} className="text-[14px] px-6 py-2 cursor-pointer" style={{ color: "#4A7BFF", border: "2px solid #4A7BFF", background: "transparent" }}>Return</button>
                </div>
              </div>
            </div>
          ) : phase === "textDisplay" ? (
            <div className="cursor-pointer" onClick={() => { if (!textDone) { setDisplayedChars(displayText.length); setTextDone(true); } else { advanceAfterText(); } }}>
              <div className="text-[16px] leading-[1.6] whitespace-pre-wrap" style={{ color: "#FFF" }}>
                {displayText.slice(0, displayedChars)}
                {!textDone && <span style={{ opacity: 0.5 }}>▌</span>}
              </div>
              {textDone && <div className="text-[10px] mt-2 text-right" style={{ color: "#555" }}>▼ CLICK / Z / ENTER</div>}
            </div>
          ) : phase === "actMenu" ? (
            <div>
              <div className="text-[12px] mb-2" style={{ color: "#FFD700" }}>* ACT — Choose an action:</div>
              {ACT_OPTIONS.map((opt, i) => (
                <button key={opt.key} className="block w-full text-left text-[14px] py-1 px-2 cursor-pointer" style={{ color: selectedAct === i ? "#FFFFFF" : "#888", background: selectedAct === i ? "rgba(255,215,0,0.15)" : "transparent", border: "none", fontFamily: "'Courier New', monospace" }} onMouseEnter={() => setSelectedAct(i)} onClick={() => handleActOption(opt.key)}>
                  {selectedAct === i ? "❤ " : "  "}{opt.name}
                  {opt.key === "throwfood" && <span style={{ color: "#666", marginLeft: 8 }}>(Food: {foodCount})</span>}
                </button>
              ))}
              <div className="text-[10px] mt-2" style={{ color: "#555" }}>[ESC/X] Back</div>
            </div>
          ) : phase === "itemMenu" ? (
            <div>
              <div className="text-[12px] mb-2" style={{ color: "#33FF33" }}>* ITEM — Use an item:</div>
              <button className="block w-full text-left text-[14px] py-1 px-2 cursor-pointer" style={{ color: foodCount > 0 ? "#FFFFFF" : "#555", background: selectedItem === 0 ? "rgba(51,255,51,0.15)" : "transparent", border: "none", fontFamily: "'Courier New', monospace" }} onClick={handleUseFood} disabled={foodCount <= 0}>
                ❤ Food (Heals 50 HP) <span style={{ color: "#888" }}>x{foodCount}</span>
              </button>
              {foodCount <= 0 && <div className="text-[12px] mt-2" style={{ color: "#666" }}>* You don't have any items...</div>}
              <div className="text-[10px] mt-2" style={{ color: "#555" }}>[ESC/X] Back</div>
            </div>
          ) : phase === "fightAnim" ? (
            <div className="text-center">
              <div className="text-[14px]" style={{ color: "#00FF00" }}>★ ATTACK ★</div>
              <div className="text-[11px] mt-1" style={{ color: "#00FF0066" }}>Stop the bar in the center for maximum damage!</div>
            </div>
          ) : phase === "bossAttack" ? (
            <div className="text-center">
              <div className="text-[14px]" style={{ color: bossPhase === 2 ? "#FF00FF" : "#00FF00" }}>★ {bossPhase === 2 ? cfg.phase2BossName : cfg.bossName}'S TURN ★</div>
              <div className="text-[11px] mt-1" style={{ color: "#FF666688" }}>
                {currentAttackMode === "phase2Stage" ? (p2AttackName === "stage" ? "Dodge the stage lasers!" : p2AttackName === "empress" ? "Survive all 3 waves!" : p2AttackName === "frustration" ? "Survive 60 seconds!" : "Don't get crushed!") : currentAttackMode === "spaceInvaders" ? "Destroy both alien waves!" : currentAttackMode === "bulletStorm" ? "Survive the storm!" : currentAttackMode === "tractorBeam" ? "Don't get abducted!" : "Move your SOUL to dodge!"}
              </div>
            </div>
          ) : (
            <div className="flex justify-between gap-3">
              {actionNames.map((name, i) => {
                const isItemBlocked = name === "ITEM" && turnCount > 0 && turnCount % 3 === 0;
                return (
                <button
                  key={name}
                  className="text-[18px] px-4 py-2.5 flex-1 text-center relative overflow-hidden cursor-pointer transition-all"
                  style={{
                    color: actionColors[i],
                    background: selectedAction === i ? `${actionColors[i]}22` : "transparent",
                    border: `2px solid ${actionColors[i]}`,
                    fontFamily: "'Courier New', monospace",
                    opacity: isItemBlocked ? 0.4 : selectedAction === i ? 1 : 0.6,
                    boxShadow: selectedAction === i && !isItemBlocked ? `0 0 10px ${actionColors[i]}44` : "none",
                    pointerEvents: isItemBlocked ? "none" : "auto",
                  }}
                  onClick={() => !isItemBlocked && handleAction(i)}
                  onMouseEnter={() => !isItemBlocked && setSelectedAction(i)}
                >
                  {name}
                  {isItemBlocked && (
                    <span className="absolute inset-0 flex items-center justify-center" style={{ pointerEvents: "none", zIndex: 2 }}>
                      <img src={pawImg} alt="Blocked" style={{ width: 42, height: 42, opacity: 0.92, filter: "drop-shadow(0 0 6px rgba(0,200,0,0.5))", animation: "bossIdle 2s ease-in-out infinite" }} />
                    </span>
                  )}
                  {name === "MERCY" && (
                    <span className="absolute inset-0 flex items-center justify-center" style={{ transform: "rotate(-30deg)", color: "#FF2222", fontSize: "26px", fontFamily: "'Impact', 'Arial Black', sans-serif", letterSpacing: "2px", textShadow: "1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 0 0 6px rgba(255,34,34,0.6)", pointerEvents: "none" }}>
                      Pet
                    </span>
                  )}
                </button>);
              })}
            </div>
          )}
        </div>

        {/* Player HP bar */}
        <div className="flex items-center gap-3 w-full max-w-[520px]">
          <Heart size={20} fill={COL.soul} color={COL.soul} />
          <span className="text-[16px]" style={{ color: COL.text }}>{playerHp} / {cfg.playerMaxHp}</span>
          <div className="flex-1 h-[16px]" style={{ background: "#333", border: "2px solid #555" }}>
            <div className="h-full transition-all duration-300" style={{ width: `${playerHpPercent}%`, background: playerHpPercent > 50 ? COL.playerHp : playerHpPercent > 25 ? "#FF8800" : "#FF2222" }} />
          </div>
          <span className="text-[12px]" style={{ color: "#888" }}>🍕{foodCount}</span>
          <span className="text-[14px]" style={{ color: "#FFD700" }}>SCR: {score}</span>
        </div>
        </div>
      </div>

      {/* ══════ RESOLVE BAR — right side, Phase 2 only ══════ */}
      {bossPhase === 2 && (
        <div
          className="flex flex-col items-center gap-1"
          style={{
            position: "fixed",
            right: 24,
            top: "50%",
            transform: "translateY(-50%)",
            zIndex: 50,
            pointerEvents: "none",
          }}
        >
          {/* Label */}
          <div
            className="text-[10px] tracking-[0.3em]"
            style={{
              color: resolveRefilling ? "#FFEE88" : resolveActive ? "#FFD700" : resolve > 0 ? "#FFD70088" : "#333",
              fontFamily: "'Courier New', monospace",
              writingMode: "vertical-rl",
              textOrientation: "mixed",
              letterSpacing: "0.35em",
              textShadow: resolveRefilling ? "0 0 12px #FFD700, 0 0 24px #FFD70066" : resolveActive ? "0 0 8px #FFD700, 0 0 16px #FFD70044" : "none",
              transition: "color 0.3s, text-shadow 0.3s",
              marginBottom: 6,
            }}
          >
            RESOLVE
          </div>

          {/* Bar container */}
          <div
            style={{
              width: 22,
              height: 200,
              background: "#0a0a0a",
              border: `2px solid ${resolveRefilling ? "#FFD700" : resolveActive ? "#FFD700" : resolve > 0 ? "#FFD70066" : "#222"}`,
              borderRadius: 3,
              position: "relative",
              overflow: "hidden",
              boxShadow: resolveRefilling
                ? "0 0 18px #FFD70088, 0 0 36px #FFD70044, 0 0 60px #FFD70022, inset 0 0 10px #FFD70033"
                : resolveActive
                ? "0 0 12px #FFD70066, 0 0 24px #FFD70022, inset 0 0 8px #FFD70011"
                : "inset 0 0 6px #00000088",
              transition: "border-color 0.15s, box-shadow 0.15s",
            }}
          >
            {/* Scanlines overlay */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,215,0,0.04) 2px, rgba(255,215,0,0.04) 4px)",
                zIndex: 2,
              }}
            />

            {/* Fill — grows from bottom */}
            <div
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                height: `${(resolve / RESOLVE_MAX) * 100}%`,
                background: resolveActive
                  ? "linear-gradient(0deg, #FFD700, #FFD700dd 40%, #FFEE44)"
                  : resolve > 30
                    ? "linear-gradient(0deg, #FFD70099, #FFD70066 60%, #FFD70044)"
                    : resolve > 0
                      ? "linear-gradient(0deg, #FF880099, #FF880066 60%, #FF880044)"
                      : "transparent",
                boxShadow: resolveActive
                  ? "0 0 12px #FFD70088, inset 0 0 6px #FFD700aa"
                  : "none",
                transition: "height 0.1s linear, background 0.3s, box-shadow 0.15s",
                zIndex: 1,
              }}
            />

            {/* Active glow pulse overlay */}
            {resolveActive && (
              <div
                className="absolute inset-0"
                style={{
                  background: "rgba(255,215,0,0.08)",
                  animation: "p2-spot-pulse 0.6s ease-in-out infinite",
                  zIndex: 3,
                }}
              />
            )}

            {/* Refill animation — gold sweep + white flash */}
            {resolveRefilling && (
              <div style={DISPLAY_CONTENTS}>
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background: "linear-gradient(0deg, #FFD700cc 0%, #FFEE88aa 40%, #FFD70066 70%, transparent 100%)",
                    transformOrigin: "bottom center",
                    animation: "p2-resolve-refill 700ms cubic-bezier(0.22, 0.68, 0.35, 1) forwards",
                    zIndex: 4,
                  }}
                />
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background: "rgba(255,255,255,0.5)",
                    animation: "p2-resolve-flash 600ms ease-out 150ms forwards",
                    zIndex: 5,
                  }}
                />
              </div>
            )}
          </div>

          {/* Percentage */}
          <div
            className="text-[10px]"
            style={{
              color: resolveRefilling ? "#FFEE88" : resolveActive ? "#FFD700" : resolve > 0 ? "#FFD70088" : "#444",
              fontFamily: "'Courier New', monospace",
              textShadow: resolveRefilling ? "0 0 10px #FFD700, 0 0 20px #FFD70044" : resolveActive ? "0 0 6px #FFD700" : "none",
              transition: "color 0.3s, text-shadow 0.3s",
              marginTop: 4,
            }}
          >
            {Math.ceil((resolve / RESOLVE_MAX) * 100)}%
          </div>

          {/* Hotkey hint */}
          <div
            className="text-[8px] mt-1"
            style={{
              color: resolve > 0 ? "#FFD70044" : "#222",
              fontFamily: "'Courier New', monospace",
            }}
          >
            [SPACE]
          </div>
        </div>
      )}

      {/* ══════ PHASE 2 CINEMATIC — "Miku, Gnarpy, Beam!!!!" ══════ */}
      {phase === "phase2Cinematic" && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "#000",
            opacity: cinematicFade,
            transition: "opacity 2s ease-in",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
          }}
        >
          {/* Animated stars */}
          {cinematicStarsRef.current.map((star, i) => (
            <div
              key={`cstar-${i}`}
              style={{
                position: "absolute",
                left: `${star.x}%`,
                top: `${star.y}%`,
                width: star.size,
                height: star.size,
                borderRadius: "50%",
                background: star.color,
                boxShadow: `0 0 ${star.size * 3}px ${star.color}, 0 0 ${star.size * 6}px ${star.color}66`,
                animation: `cinematic-twinkle ${star.twinkleSpeed}s ease-in-out infinite`,
                animationDelay: `${star.twinklePhase}s`,
              }}
            />
          ))}

          {/* Drifting larger accent stars */}
          {[...Array(12)].map((_, i) => (
            <div
              key={`cbig-${i}`}
              style={{
                position: "absolute",
                left: `${10 + (i * 7.5) % 80}%`,
                top: `${15 + (i * 13) % 70}%`,
                width: i % 3 === 0 ? 6 : 4,
                height: i % 3 === 0 ? 6 : 4,
                background: i % 2 === 0 ? "#23ac38" : "#86cecb",
                boxShadow: `0 0 12px ${i % 2 === 0 ? "#23ac38" : "#86cecb"}, 0 0 24px ${i % 2 === 0 ? "#23ac38" : "#86cecb"}44`,
                clipPath: "polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)",
                animation: `cinematic-drift ${3 + i * 0.5}s ease-in-out infinite alternate, cinematic-twinkle ${1.5 + i * 0.3}s ease-in-out infinite`,
                animationDelay: `${i * 0.4}s`,
              }}
            />
          ))}

          {/* Text box container — fades in slowly from stars */}
          {cinematicStep >= 0 && (
            <div
              style={{
                position: "relative",
                zIndex: 10,
                maxWidth: 560,
                width: "90%",
                padding: "28px 36px",
                border: "3px solid #fff",
                background: "#000",
                fontFamily: "'Courier New', monospace",
                animation: "cinematic-box-fadein 1.8s ease-out forwards",
              }}
            >
              {/* Box 0 — "..." very slow fade-in */}
              {cinematicStep === 0 && (
                <div
                  className="text-[22px] leading-relaxed"
                  style={{
                    color: "#FFFFFF",
                    opacity: 0,
                    animation: "cinematic-dots-fadein 5s ease-in forwards",
                  }}
                >
                  * ...
                </div>
              )}

              {/* Box 1 */}
              {cinematicStep === 1 && (
                <div
                  className="text-[18px] leading-relaxed"
                  style={{
                    color: "#FFFFFF",
                    animation: "cinematic-text-type 1.5s steps(60, end)",
                  }}
                >
                  * Huh, i've always wondered why people never used their strongest attacks first
                </div>
              )}

              {/* Box 2 — "Miku" in blue */}
              {cinematicStep === 2 && (
                <div
                  className="text-center text-[42px] tracking-[0.3em]"
                  style={{
                    color: "#86cecb",
                    fontFamily: "'Courier New', monospace",
                    fontWeight: "bold",
                    textShadow: "0 0 12px #86cecb88, 0 0 24px #86cecb44",
                    animation: "cinematic-name-appear 1s ease-out",
                  }}
                >
                  Miku
                </div>
              )}

              {/* Box 3 — "Gnarpy" in green */}
              {cinematicStep === 3 && (
                <div
                  className="text-center text-[42px] tracking-[0.3em]"
                  style={{
                    color: "#23ac38",
                    fontFamily: "'Courier New', monospace",
                    fontWeight: "bold",
                    textShadow: "0 0 12px #23ac3888, 0 0 24px #23ac3844",
                    animation: "cinematic-name-appear 1s ease-out",
                  }}
                >
                  Gnarpy
                </div>
              )}

              {/* Box 4 — "BEAM" split green/blue, bold, glowing */}
              {cinematicStep === 4 && (
                <div
                  className="text-center"
                  style={{
                    fontFamily: "'Courier New', monospace",
                    animation: "cinematic-name-appear 0.6s ease-out",
                    position: "relative",
                  }}
                >
                  {/* Glow layer behind — blurred duplicate for smooth glow */}
                  <div aria-hidden style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    filter: "blur(12px)",
                    animation: "cinematic-beam-glow 2s ease-in-out infinite",
                  }}>
                    <span style={{ fontSize: 56, fontWeight: 900, letterSpacing: "0.5em", color: "#23ac38" }}>BE</span>
                    <span style={{ fontSize: 56, fontWeight: 900, letterSpacing: "0.5em", color: "#86cecb" }}>AM</span>
                  </div>
                  {/* Crisp text layer */}
                  <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{
                      fontSize: 56,
                      fontWeight: 900,
                      letterSpacing: "0.5em",
                      color: "#23ac38",
                      textShadow: "0 0 8px #23ac3888",
                    }}>BE</span>
                    <span style={{
                      fontSize: 56,
                      fontWeight: 900,
                      letterSpacing: "0.5em",
                      color: "#86cecb",
                      textShadow: "0 0 8px #86cecb88",
                    }}>AM</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Skip hint */}
          {cinematicStep >= 0 && (
            <div
              className="text-[10px] mt-8"
              style={{
                color: "#ffffff22",
                fontFamily: "'Courier New', monospace",
              }}
            >
              [Z / Enter to continue]
            </div>
          )}
        </div>
      )}

      {/* Cinematic keyframes */}
      <style>{`
        @keyframes cinematic-twinkle {
          0%, 100% { opacity: 0.3; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1.2); }
        }
        @keyframes cinematic-drift {
          0% { transform: translateY(0px) rotate(0deg); }
          100% { transform: translateY(-20px) rotate(15deg); }
        }
        @keyframes cinematic-dots-fadein {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        @keyframes cinematic-box-fadein {
          0% { opacity: 0; transform: scale(0.95) translateY(8px); }
          60% { opacity: 0.7; }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes cinematic-box-appear {
          0% { opacity: 0; transform: scale(0.9); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes cinematic-name-appear {
          0% { opacity: 0; transform: translateY(10px); letter-spacing: 0.6em; }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes cinematic-text-type {
          0% { width: 0; overflow: hidden; white-space: nowrap; }
          100% { width: 100%; }
        }
        @keyframes cinematic-beam-glow {
          0%, 100% { opacity: 0.5; filter: blur(12px); }
          50% { opacity: 1; filter: blur(18px); }
        }
      `}</style>

      {/* Hidden YouTube player container */}
      <div ref={ytContainerRef} style={{
        position: "fixed", top: -9999, left: -9999,
        width: 1, height: 1, overflow: "hidden",
        pointerEvents: "none", opacity: 0,
      }} />
    </div>
  );
}