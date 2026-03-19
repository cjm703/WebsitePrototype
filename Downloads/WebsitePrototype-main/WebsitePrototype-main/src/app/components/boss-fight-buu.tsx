import { BossFight } from "./boss-fight";
import type { BossFightConfig } from "./boss-fight";

// ═══════════════════════════════════════════════════════════════════════════
// BUU MODE CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════
// This is a harder variant of the normal boss fight with a second phase.
// Tweak any values here to customize the Buu difficulty.
// Any value not specified will fall back to the normal boss fight defaults.
// ═══════════════════════════════════════════════════════════════════════════

const buuConfig: Partial<BossFightConfig> = {
  // ── Boss Identity ──────────────────────────────────────────────────────
  bossName: "BUU GNARPY",
  bossMaxHp: 200,       // Phase 1 HP (same as normal)
  playerMaxHp: 101,     // Player HP (same as normal)
  startingFood: 1,

  // ── Phase 2 Settings ──────────────────────────────────────────────────
  phase2Enabled: true,
  phase2Placeholder: true,        // Phase 2 is a placeholder for now
  phase2BossHp: 300,              // Boss gets 300 HP in phase 2
  phase2DamageMultiplier: 1.5,    // All boss damage x1.5 in phase 2
  phase2SpeedMultiplier: 1.25,    // Tractor beam pull etc. x1.25 faster in phase 2
  phase2BossName: "Gnarpy Miku",
  phase2TransitionText:
    "* BUU GNARPY's eyes glow with fury!\n* \"You think that was enough?!\"\n* BUU GNARPY transforms into GNARPY MIKU!",
  phase2Colors: { bg: "#23ac38", accent: "#86cecb", text: "#fff100" },

  // ── Attack Damage Overrides (Phase 1 base values) ─────────────────────
  // These get multiplied by phase2DamageMultiplier during phase 2.
  // Uncomment and change any value to override the normal fight defaults.

  // beamDamage: 16,             // Beam Wave (normal beams)
  // rotateBeamDamage: 12,       // Beam Wave (rotating beam)
  // bulletStormDamage: 25,      // Bullet Storm projectile hit
  // bulletStormBeamDamage: 100,  // Bullet Storm final beam
  // tractorBeamDamage: 12,      // Tractor Beam wall crush
  // tractorMissileDamage: 8,    // Tractor Beam homing missiles
  // pawBombDirectDamage: 22,    // Paw bomb direct hit
  // pawBombSplashDamage: 4,     // Paw bomb splash
  // siEnemyBulletDamage: 8,     // Space Invaders enemy bullets
  // siBossBulletDamage: 10,     // Space Invaders boss bullets
  // safezoneDamage: 10,         // Beam Wave safe zone lasers

  // ── Music ─────────────────────────────────────────────────────────────
  // youtubeVideoId: "BPwvV1V1S8Y",  // Change to a different YouTube video ID
};

// ═══════════════════════════════════════════════════════════════════════════

export function BossFightBuu({
  onBack,
  onScoreSave,
}: {
  onBack: () => void;
  onScoreSave?: (score: number) => void;
}) {
  return (
    <BossFight
      onBack={onBack}
      onScoreSave={onScoreSave}
      config={buuConfig}
    />
  );
}