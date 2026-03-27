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
  bossMaxHp: 200, // Phase 1 HP (same as normal)
  playerMaxHp: 101, // Player HP (same as normal)
  startingFood: 1,

  // ── Phase 2 Settings ──────────────────────────────────────────────────
  phase2Enabled: true,
  phase2Placeholder: false,
  phase2BossHp: 300,
  phase2DamageMultiplier: 1.5,
  phase2SpeedMultiplier: 1.25,
  phase2BossName: "Gnarpy Miku",
  phase2TransitionText:
    '* BUU GNARPY\'s eyes glow with fury!\n* "You think that was enough?!"\n* BUU GNARPY transforms into GNARPY MIKU!',
  phase2Colors: {
    bg: "#23ac38",
    accent: "#86cecb",
    text: "#fff100",
  },

  // ── Attack Damage Overrides (Phase 1 base values) ─────────────────────
  // These get multiplied by phase2DamageMultiplier during phase 2.
  // Uncomment and change any value to override the normal fight defaults.

  // beamDamage: 16,
  // rotateBeamDamage: 12,
  // bulletStormDamage: 25,
  // bulletStormBeamDamage: 100,
  // tractorBeamDamage: 12,
  // tractorMissileDamage: 8,
  // pawBombDirectDamage: 22,
  // pawBombSplashDamage: 4,
  // siEnemyBulletDamage: 8,
  // siBossBulletDamage: 10,
  // safezoneDamage: 10,

  // ── Music ─────────────────────────────────────────────────────────────
  // youtubeVideoId: "BPwvV1V1S8Y",
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
