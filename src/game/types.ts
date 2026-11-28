export type CharacterId = 'adnan' | 'tika' | 'dhira' | 'iyen';

export type StageId =
  | 'living_room'
  | 'dojo'
  | 'park'
  | 'kitchen'
  | 'rooftop'
  | 'library'
  | 'simpang_lima_gumul'
  | 'jembatan_brawijaya';

export type GameMode = 'cpu' | 'training' | 'online_1v1';

export type OnlineRole = 'host' | 'guest';

export type CpuDifficulty = 'easy' | 'normal' | 'hard';

export type GameScreen =
  | 'title'
  | 'mode_select'
  | 'online_lobby'
  | 'char_stage_select'
  | 'playing'
  | 'paused'
  | 'gameover'
  | 'replay';

export type FighterActionState =
  | 'idle'
  | 'walk_fwd'
  | 'walk_back'
  | 'dash'
  | 'backstep'
  | 'crouch'
  | 'jump'
  | 'attack'
  | 'block'
  | 'burnout'
  | 'counter_stance'
  | 'tantrum'
  | 'hitstun'
  | 'knockdown'
  | 'wakeup'
  | 'victory'
  | 'ko';

export type CharacterFsmStatus =
  | 'normal'
  | 'mager'
  | 'omelan'
  | 'counter_stance'
  | 'rewel'
  | 'burnout';

export type AttackHeight = 'high' | 'mid' | 'low';

export type MoveId =
  | 'p1'
  | 'p2'
  | 'p3'
  | 'p4'
  | 'k1'
  | 'k2'
  | 'k3'
  | 'k4'
  | 'crouch_p'
  | 'crouch_k'
  | 'air_p'
  | 'air_k'
  | 'throw'
  | 'sp_neutral'
  | 'sp_up_fwd'
  | 'sp_back'
  | 'sp_down'
  | 'parry_counter'
  | 'counter_slash'
  | 'super';

export type WeaponVisualType =
  | 'none'
  | 'sapu_kelut'
  | 'serbet'
  | 'buku'
  | 'tas'
  | 'kelereng'
  | 'kelereng_pouch'
  | 'belly';

export interface HitboxSpec {
  xOffset: number; // relative to facing direction
  width: number;
  yMin: number; // height from feet (0 = floor)
  yMax: number;
}

export interface MoveSpec {
  id: MoveId;
  name: string;
  startup: number; // seconds
  active: number; // seconds
  recovery: number; // seconds
  damage: number;
  chipDamage: number;
  hitstun: number;
  blockstun: number;
  hitstop: number;
  knockbackX: number;
  knockbackY: number;
  knockdown?: boolean;
  isOverhead?: boolean;
  isReflector?: boolean;
  isCounterStance?: boolean;
  isThrow?: boolean;
  height: AttackHeight;
  hitbox: HitboxSpec;
  lungeVx?: number;
  lungeVy?: number;
  chainNext?: MoveId[];
  weapon: WeaponVisualType;
  projectileType?:
    | 'sapu_spin'
    | 'dust_cloud'
    | 'buku_arc'
    | 'origami_arc'
    | 'buku_stack'
    | 'buku_rain'
    | 'kelereng_burst'
    | 'kelereng_low'
    | 'kelereng_trap'
    | 'kelereng_air'
    | 'kelereng_storm'
    | 'tantrum_wave';
  multiHitCount?: number;
  superGainHit: number;
  superGainWhiff: number;
}

export interface CharacterVisualProfile {
  heightScale: number;
  headRadius: number;
  torsoHeight: number;
  hairStyle: 'bald_side' | 'hijab_adult' | 'hijab_child' | 'toddler_part';
  weaponName: string;
}

export interface CharacterSpec {
  id: CharacterId;
  name: string;
  ageLabel: string;
  archetype: string;
  secretWeapon: string;
  summary: string;
  walkSpeed: number;
  backSpeed: number;
  dashSpeed: number;
  backstepSpeed: number;
  jumpVelocity: number;
  gravity: number;
  maxHp: number;
  hurtboxWidth: number;
  standingHeight: number;
  crouchingHeight: number;
  visual: CharacterVisualProfile;
  specialDescriptions: {
    neutral: string;
    upFwd: string;
    back: string;
    down: string;
    passive: string;
    superMove: string;
  };
  moves: Record<MoveId, MoveSpec>;
}

export interface StageSpec {
  id: StageId;
  name: string;
  subtitle: string;
}

export interface Camera3D {
  x: number;
  y: number;
  z: number;
  shakeTrauma: number;
  shakeOffsetX: number;
  shakeOffsetY: number;
}

export interface DramaticCameraState {
  active: boolean;
  timer: number;
  duration: number;
  cooldown: number;
  targetX: number;
  targetY: number;
  orbitSign: 1 | -1;
  isKo: boolean;
}

export interface InputSnapshot {
  moveX: number; // -1..1
  moveY: number; // -1 (down) .. 1 (up)
  punchHeld: boolean;
  kickHeld: boolean;
  spHeld: boolean;
  blockHeld: boolean;
  superHeld: boolean;
  punchPressed: boolean;
  kickPressed: boolean;
  spPressed: boolean;
  superPressed: boolean;
}

export interface FighterRuntime {
  slot: 1 | 2;
  charId: CharacterId;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  facing: 1 | -1; // 1 = right, -1 = left
  hp: number;
  trailHp: number; // delayed white-hatched trailing bar
  maxHp: number;
  superMeter: number; // 0..100
  guardStamina: number; // 0..100 guard/stamina bar
  burnoutTimer: number;
  idleTime: number; // Ayah Adnan Mode Mager trigger (>= 2.0s)
  magerArmorHits: number; // 1-hit super armor when Mode Mager active
  omelanMeter: number; // 0..100 Ibu Tika Rage/Omelan advantage meter
  parryWindowTimer: number; // Perfect Parry active window on fresh block
  wasBlockHeld: boolean;
  counterActiveTimer: number; // Kak Dhira Pose Centil counter window
  backRiseActive: boolean; // Kak Dhira fast back-roll wakeup
  damageTakenSinceTantrum: number; // Dik Iyen cumulative damage counter for Mode Rewel
  tantrumCooldown: number;
  charFsmStatus: CharacterFsmStatus;
  dashDir: -1 | 0 | 1;
  dashTimer: number;
  lastTapX: -1 | 0 | 1;
  lastTapTimer: number;
  prevMoveX: number;
  coughTimer: number;
  state: FighterActionState;
  stateTimer: number;
  animTime: number;
  walkPhase: number;
  currentMove: MoveSpec | null;
  moveTimer: number;
  moveHitLanded: boolean;
  moveHitsRemaining: number;
  multiHitCooldown: number;
  bufferedMove: MoveId | null;
  bufferTimer: number;
  hitFlashTimer: number;
  invulnTimer: number;
  comboCountReceived: number;
  comboCountDealt: number;
  comboDisplayTimer: number;
  roundsWon: number;
  totalDamageDealt: number;
  maxComboAchieved: number;
  squashX: number;
  squashY: number;
}

export interface Projectile {
  active: boolean;
  ownerSlot: 1 | 2;
  type: NonNullable<MoveSpec['projectileType']>;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  gravity: number;
  radius: number;
  damage: number;
  chipDamage: number;
  hitstun: number;
  hitstop: number;
  knockbackX: number;
  knockbackY: number;
  knockdown: boolean;
  height: AttackHeight;
  bouncesLeft: number;
  life: number;
  maxLife: number;
  spinAngle: number;
  hitsLeft: number;
}

export interface Particle {
  active: boolean;
  ownerSlot: 1 | 2;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
  life: number;
  maxLife: number;
  kind: 'spark' | 'dust' | 'starburst' | 'shockwave' | 'shockwave_ground';
  angle: number;
}

export type RoundPhase = 'intro' | 'fight' | 'ko' | 'timeover' | 'match_end';

export interface MatchState {
  mode: GameMode;
  difficulty: CpuDifficulty;
  stageId: StageId;
  roundNumber: number;
  roundPhase: RoundPhase;
  phaseTimer: number;
  roundTimer: number; // 99 down to 0
  hitstopTimer: number;
  bannerText: string;
  subBannerText: string;
  winnerSlot: 0 | 1 | 2; // 0 = draw
  matchTimeElapsed: number;
  p1: FighterRuntime;
  p2: FighterRuntime;
  camera: Camera3D;
  projectiles: Projectile[];
  particles: Particle[];
  particleCursor: number;
  projectileCursor: number;
  pendingSuperBannerTimer: number;
  pendingSuperName: string;
  timeScale: number;
  dramaticCam: DramaticCameraState;
}
