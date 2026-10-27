import { getCard } from "./cards";
import type { BattleState, School, SpellEffect } from "./types";
import type { BattleFx } from "./engine";

/**
 * Мягкие «кинематографичные» SFX на Web Audio:
 * синусы + фильтрованный шум + короткий echo, без square/sawtooth «денди».
 */

const SFX_MUTE_KEY = "orakul-sfx-muted";
const MUSIC_VOL_KEY = "orakul-music-vol";
const SFX_VOL_KEY = "orakul-sfx-vol";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfxMuted = loadFlag(SFX_MUTE_KEY);
/** Музыка: только на сессию (каждый заход — выкл., пока сам не включишь). */
let musicMuted = true;
let musicVolume = loadNum(MUSIC_VOL_KEY, 0.7);
/** По умолчанию звуки наполовину; дальше — что сохранил игрок. */
let sfxVolume = loadNum(SFX_VOL_KEY, 0.5);

try {
  localStorage.removeItem("orakul-music-muted");
  // Один раз подтянуть дефолт 50% (старые сейвы часто были 0.8).
  if (localStorage.getItem("orakul-audio-defaults-v2") !== "1") {
    localStorage.setItem("orakul-audio-defaults-v2", "1");
    localStorage.setItem(SFX_VOL_KEY, "0.5");
    sfxVolume = 0.5;
  }
} catch {
  /* ignore */
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function loadFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function saveFlag(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function loadNum(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return clamp01(Number(raw));
  } catch {
    return fallback;
  }
}

function saveNum(key: string, value: number): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* ignore */
  }
}

function applySfxVolume(): void {
  if (!master) return;
  master.gain.value = sfxMuted ? 0 : 0.55 * sfxVolume;
}

function liveVol(): number {
  return musicMuted ? 0 : musicVolume;
}

function applyMusicVolume(): void {
  const vol = liveVol();
  if (musicMuted) {
    pauseMenuMusicHard();
    pauseBattleMusicHard();
    return;
  }
  // Не трогаем громкость во время кроссфейда — иначе скачок.
  if (musicGen !== 0 && musicFading) return;
  if (battleWanted && battleEl && !battleEl.paused) battleEl.volume = vol;
  else if (menuWanted && menuEl && !menuEl.paused) menuEl.volume = vol;
}

/** Эффекты боя / клики (не музыка). */
export function isSfxMuted(): boolean {
  return sfxMuted;
}

export function setSfxMuted(value: boolean): void {
  sfxMuted = value;
  saveFlag(SFX_MUTE_KEY, value);
  applySfxVolume();
}

export function getSfxVolume(): number {
  return sfxVolume;
}

export function setSfxVolume(value: number): void {
  sfxVolume = clamp01(value);
  saveNum(SFX_VOL_KEY, sfxVolume);
  applySfxVolume();
}

/** Фоновая музыка (меню + бой). */
export function isMusicMuted(): boolean {
  return musicMuted;
}

export function setMusicMuted(value: boolean): void {
  musicMuted = value;
  applyMusicVolume();
  if (value) {
    pauseMenuMusicHard();
    pauseBattleMusicHard();
  } else if (battleWanted) {
    void startBattleMusic();
  } else if (menuWanted) {
    void startMenuMusic();
  }
}

export function getMusicVolume(): number {
  return musicVolume;
}

export function setMusicVolume(value: number): void {
  musicVolume = clamp01(value);
  saveNum(MUSIC_VOL_KEY, musicVolume);
  applyMusicVolume();
}

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    applySfxVolume();
    // Лёгкий «замок» пространства
    const wet = ctx.createGain();
    wet.gain.value = 0.22;
    const delay = ctx.createDelay(0.5);
    delay.delayTime.value = 0.085;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.22;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 2800;
    master.connect(ctx.destination);
    master.connect(wet);
    wet.connect(delay);
    delay.connect(lp);
    lp.connect(feedback);
    feedback.connect(delay);
    lp.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function out(): AudioNode {
  audio();
  return master ?? (ctx as AudioContext).destination;
}

export function unlockSfx(): void {
  audio();
}

/** Кэш decode'd семплов из public/ */
const sampleCache = new Map<string, AudioBuffer | null>();

async function loadSample(url: string): Promise<AudioBuffer | null> {
  if (sampleCache.has(url)) return sampleCache.get(url) ?? null;
  const ac = audio();
  if (!ac) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      sampleCache.set(url, null);
      return null;
    }
    const raw = await res.arrayBuffer();
    const buf = await ac.decodeAudioData(raw.slice(0));
    sampleCache.set(url, buf);
    return buf;
  } catch {
    sampleCache.set(url, null);
    return null;
  }
}

/** Проиграть файл из public (например /sfx/play-card.mp3). */
export function playSample(
  url: string,
  opts?: { gain?: number; playbackRate?: number },
): void {
  if (sfxMuted) return;
  const ac = audio();
  if (!ac || !master) return;
  void loadSample(url).then((buf) => {
    if (!buf || sfxMuted) return;
    const src = ac.createBufferSource();
    src.buffer = buf;
    if (opts?.playbackRate) src.playbackRate.value = opts.playbackRate;
    const g = ac.createGain();
    g.gain.value = opts?.gain ?? 0.7;
    src.connect(g);
    g.connect(out());
    src.start();
  });
}

/** Звук выкладывания карты: public/sfx/карта.wav */
export const SFX_PLAY_CARD_URL = `/sfx/${encodeURIComponent("карта.wav")}`;

/** Звук атаки: public/sfx/атака.wav */
export const SFX_ATTACK_URL = `/sfx/${encodeURIComponent("атака.wav")}`;

/** Магический выстрел (маги / лич / инферно…): public/sfx/метнуть огонь.mp3 */
export const SFX_MAGE_BOLT_URL = `/sfx/${encodeURIComponent("метнуть огонь.mp3")}`;

/** Выстрел из лука/арбалета: public/sfx/стрела.mp3 */
export const SFX_ARROW_URL = `/sfx/${encodeURIComponent("стрела.mp3")}`;

/** Атакующее заклинание во врага: public/sfx/магия атакующая.mp3 */
export const SFX_OFFENSIVE_SPELL_URL = `/sfx/${encodeURIComponent("магия атакующая.mp3")}`;

/** Положительная магия (хил, баф, мана, добор…): public/sfx/магия положительная.mp3 */
export const SFX_POSITIVE_SPELL_URL = `/sfx/${encodeURIComponent("магия положительная.mp3")}`;

/** Крик банши (оглушение): public/sfx/банши.mp3 */
export const SFX_BANSHEE_URL = `/sfx/${encodeURIComponent("банши.mp3")}`;

/** Кто бьёт магией, а не стрелами/клинком. */
const MAGE_BOLT_CARD_IDS = new Set([
  "mage",
  "necro_mage",
  "lich",
  "arbiter",
  "water_spirit",
  "fire_gopnik",
  "inferno",
]);

/** Кто пускает стрелы / болты. */
const ARROW_CARD_IDS = new Set(["elf", "crossbowman", "archer"]);

/** Эффекты «боль / неудобство» врагу или его юнитам. */
const OFFENSIVE_SPELL_EFFECTS = new Set<SpellEffect["type"]>([
  "damage_hero",
  "damage_all_enemies",
  "damage_undead",
  "damage_unit",
  "poison",
  "poison_all",
  "slow_enemy",
  "freeze_enemy",
  "banish_unit",
  "bounce_enemy_hand",
  "discard_enemy_hand",
  "reveal_enemy_hand",
  "break_enemy_spell",
  "break_all_enemy_spells",
  "traitor",
  "marionette",
  "strip_ability",
  "recruit_to_hand",
  "mute_ranged",
  "weaken_foe_damage",
  "fear_protect",
]);

/** Хорошие эффекты на себя / союзников. */
const POSITIVE_SPELL_EFFECTS = new Set<SpellEffect["type"]>([
  "heal_hero",
  "heal_unit",
  "gain_mana",
  "gain_mana_all",
  "draw",
  "extra_draw_turns",
  "buff_permanent",
  "buff_army_attack",
  "shield_ally",
  "cure_poison",
  "cure_poison_all",
  "guardian_bond",
  "last_stand",
  "bunker",
  "sniper_buff",
  "refresh_hand",
  "shuffle_board",
  "skip_combat",
  "wake_ally",
  "wake_all_allies",
]);

/** Победа (мультибой / итог дуэли): public/sfx/победа.mp3 */
export const SFX_WIN_URL = `/sfx/${encodeURIComponent("победа.mp3")}`;

/** Поражение: public/sfx/поражение.wav */
export const SFX_LOSE_URL = `/sfx/${encodeURIComponent("поражение.wav")}`;

/** Фоновая музыка меню: public/sfx/menu.mp3 */
export const SFX_MENU_MUSIC_URL = "/sfx/menu.mp3";

/** Музыка боя: public/sfx/battle.mp3 */
export const SFX_BATTLE_MUSIC_URL = "/sfx/battle.mp3";

/** ---- BGM: меню / бой, loop без хвоста тишины ---- */
let menuWanted = false;
let battleWanted = false;
let menuEl: HTMLAudioElement | null = null;
let battleEl: HTMLAudioElement | null = null;
let musicUnlockHooked = false;
let musicGen = 0;
let musicFading = false;
const loopTrim = new Map<string, { start: number; end: number }>();
const MUSIC_XFADE_MS = 1100;
const MUSIC_OUTRO_MS = 950;

function pauseEl(a: HTMLAudioElement | null): void {
  if (!a) return;
  try {
    a.pause();
  } catch {
    /* ignore */
  }
}

function pauseMenuMusicHard(): void {
  pauseEl(menuEl);
}

function pauseBattleMusicHard(): void {
  pauseEl(battleEl);
}

/** Обрезать тишину в начале/конце, чтобы loop не «дышал». */
async function resolveLoopTrim(
  url: string,
): Promise<{ start: number; end: number } | null> {
  const cached = loopTrim.get(url);
  if (cached) return cached;
  const buf = await loadSample(url);
  if (!buf) return null;
  const data = buf.getChannelData(0);
  const thresh = 0.01;
  let end = data.length - 1;
  while (end > 0 && Math.abs(data[end]) < thresh) end--;
  let start = 0;
  while (start < end && Math.abs(data[start]) < thresh) start++;
  const sr = buf.sampleRate;
  const pad = 0.04;
  const times = {
    start: Math.max(0, start / sr),
    end: Math.max(start / sr + 0.8, end / sr - pad),
  };
  loopTrim.set(url, times);
  return times;
}

function attachSeamlessLoop(a: HTMLAudioElement, url: string): void {
  const jump = () => {
    const trim = loopTrim.get(url);
    if (!trim || !Number.isFinite(a.duration) || a.paused) return;
    if (a.currentTime >= trim.end) {
      a.currentTime = trim.start;
    }
  };
  a.addEventListener("timeupdate", jump);
  a.addEventListener("ended", () => {
    const trim = loopTrim.get(url);
    a.currentTime = trim?.start ?? 0.02;
    void a.play().catch(() => {});
  });
  void resolveLoopTrim(url);
}

function makeBgAudio(id: string, src: string): HTMLAudioElement | null {
  if (typeof document === "undefined") return null;
  const a = document.createElement("audio");
  a.id = id;
  a.src = src;
  a.loop = true;
  a.preload = "auto";
  a.volume = musicMuted ? 0 : musicVolume;
  a.setAttribute("playsinline", "true");
  a.setAttribute("webkit-playsinline", "true");
  a.style.display = "none";
  attachSeamlessLoop(a, src);
  document.body.appendChild(a);
  return a;
}

function getMenuEl(): HTMLAudioElement | null {
  if (!menuEl) menuEl = makeBgAudio("orakul-menu-music", SFX_MENU_MUSIC_URL);
  return menuEl;
}

function getBattleEl(): HTMLAudioElement | null {
  if (!battleEl) battleEl = makeBgAudio("orakul-battle-music", SFX_BATTLE_MUSIC_URL);
  return battleEl;
}

function tryPlayEl(
  a: HTMLAudioElement | null,
  wanted: boolean,
  stop: () => void,
  startVol?: number,
): void {
  if (!wanted || musicMuted || !a) return;
  if (!a.paused && !a.ended) return;
  a.volume = startVol ?? liveVol();
  void a.play().then(() => {
    if (musicMuted || !wanted) stop();
  }).catch(() => {
    /* autoplay — ждём жест */
  });
}

function fadeEl(
  el: HTMLAudioElement,
  from: number,
  to: number,
  ms: number,
  token: number,
): Promise<void> {
  return new Promise((resolve) => {
    const start = clamp01(from);
    const end = clamp01(to);
    const t0 = performance.now();
    try {
      el.volume = start;
    } catch {
      /* ignore */
    }
    const tick = (now: number) => {
      if (token !== musicGen) {
        resolve();
        return;
      }
      const p = ms <= 0 ? 1 : Math.min(1, (now - t0) / ms);
      const eased = p * p * (3 - 2 * p);
      try {
        el.volume = start + (end - start) * eased;
      } catch {
        /* ignore */
      }
      if (p < 1) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });
}

function tryPlayWantedMusic(): void {
  if (musicMuted) return;
  if (battleWanted) tryPlayEl(getBattleEl(), true, pauseBattleMusicHard);
  else if (menuWanted) tryPlayEl(getMenuEl(), true, pauseMenuMusicHard);
}

function ensureMusicUnlockHook(): void {
  if (musicUnlockHooked || typeof window === "undefined") return;
  musicUnlockHooked = true;
  const kick = () => tryPlayWantedMusic();
  window.addEventListener("pointerdown", kick, { capture: true, passive: true });
  window.addEventListener("touchstart", kick, { capture: true, passive: true });
  window.addEventListener("keydown", kick, { capture: true });
  window.addEventListener("click", kick, { capture: true });
}

async function waitCanPlay(a: HTMLAudioElement): Promise<void> {
  if (a.readyState >= 2) return;
  await new Promise<void>((resolve) => {
    const done = () => resolve();
    a.addEventListener("canplay", done, { once: true });
    window.setTimeout(done, 2500);
  });
}

async function crossfadeTo(
  next: "menu" | "battle",
  ms = MUSIC_XFADE_MS,
): Promise<void> {
  const toBattle = next === "battle";
  if (toBattle) {
    if (battleWanted && !menuWanted) {
      ensureMusicUnlockHook();
      tryPlayEl(getBattleEl(), true, pauseBattleMusicHard, battleEl?.volume);
      return;
    }
    menuWanted = false;
    battleWanted = true;
  } else {
    if (menuWanted && !battleWanted) {
      ensureMusicUnlockHook();
      tryPlayEl(getMenuEl(), true, pauseMenuMusicHard, menuEl?.volume);
      return;
    }
    battleWanted = false;
    menuWanted = true;
  }

  ensureMusicUnlockHook();
  if (musicMuted) {
    pauseMenuMusicHard();
    pauseBattleMusicHard();
    return;
  }

  const incoming = toBattle ? getBattleEl() : getMenuEl();
  const outgoing = toBattle ? menuEl : battleEl;
  if (!incoming) return;

  const token = ++musicGen;
  musicFading = true;
  try {
    await waitCanPlay(incoming);
    if (token !== musicGen) return;
    if (incoming.paused) {
      const trim = loopTrim.get(incoming.src.includes("battle") ? SFX_BATTLE_MUSIC_URL : SFX_MENU_MUSIC_URL);
      try {
        incoming.currentTime = trim?.start ?? 0;
      } catch {
        /* ignore */
      }
      incoming.volume = 0;
      try {
        await incoming.play();
      } catch {
        /* жест */
      }
    }
    if (token !== musicGen) return;
    const fromIn = incoming.volume;
    const fromOut = outgoing && !outgoing.paused ? outgoing.volume : 0;
    await Promise.all([
      fadeEl(incoming, fromIn, liveVol(), ms, token),
      outgoing && !outgoing.paused
        ? fadeEl(outgoing, fromOut, 0, ms, token)
        : Promise.resolve(),
    ]);
    if (token !== musicGen) return;
    if (toBattle) pauseMenuMusicHard();
    else pauseBattleMusicHard();
  } finally {
    if (token === musicGen) musicFading = false;
  }
}

/** Включить музыку меню (кроссфейд с боя, если он играл). */
export async function startMenuMusic(): Promise<void> {
  await crossfadeTo("menu");
}

/** Выключить музыку меню (резко — для mute). */
export function stopMenuMusic(): void {
  menuWanted = false;
  pauseMenuMusicHard();
}

/** Музыка боя: плавный вход, меню гаснет. */
export async function startBattleMusic(): Promise<void> {
  await crossfadeTo("battle");
}

export function stopBattleMusic(): void {
  battleWanted = false;
  pauseBattleMusicHard();
}

/** Плавно заглушить бой перед табличкой победы. */
export async function fadeOutBattleMusic(ms = MUSIC_OUTRO_MS): Promise<void> {
  const el = battleEl;
  battleWanted = false;
  if (!el || el.paused) return;
  const token = ++musicGen;
  musicFading = true;
  try {
    await Promise.race([
      fadeEl(el, el.volume, 0, ms, token),
      new Promise<void>((r) => window.setTimeout(r, ms + 120)),
    ]);
    pauseBattleMusicHard();
  } finally {
    if (token === musicGen) musicFading = false;
  }
}

/** Проиграть семпл, если файла нет — вызвать fallback. */
function playSampleOrFallback(
  url: string,
  gain: number,
  fallback: () => void,
): void {
  unlockSfx();
  const cached = sampleCache.get(url);
  if (cached) {
    playSample(url, { gain });
    return;
  }
  if (cached === null) {
    fallback();
    return;
  }
  void loadSample(url).then((buf) => {
    if (buf) playSample(url, { gain });
    else fallback();
  });
}

function envGain(
  g: GainNode,
  t0: number,
  peak: number,
  attack: number,
  hold: number,
  release: number,
): void {
  g.gain.cancelScheduledValues(t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + attack);
  g.gain.setValueAtTime(peak, t0 + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + hold + release);
}

/** Мягкий тон с гармониками (не пила/квадрат). */
function softTone(opts: {
  freq: number;
  dur: number;
  gain?: number;
  delay?: number;
  slideTo?: number;
  attack?: number;
  harmonics?: number[];
}): void {
  if (sfxMuted) return;
  const ac = audio();
  if (!ac || !master) return;
  const t0 = ac.currentTime + (opts.delay ?? 0);
  const peak = opts.gain ?? 0.07;
  const attack = opts.attack ?? 0.025;
  const release = Math.max(0.08, opts.dur * 0.55);
  const hold = Math.max(0.01, opts.dur - attack - release * 0.35);
  const harms = opts.harmonics ?? [1, 0.35, 0.12];

  const mix = ac.createGain();
  envGain(mix, t0, peak, attack, hold, release);
  mix.connect(out());

  harms.forEach((amp, i) => {
    if (amp <= 0) return;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = "sine";
    const f = opts.freq * (i + 1);
    osc.frequency.setValueAtTime(f, t0);
    if (opts.slideTo) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(50, opts.slideTo * (i + 1)),
        t0 + opts.dur,
      );
    }
    g.gain.value = amp;
    osc.connect(g);
    g.connect(mix);
    osc.start(t0);
    osc.stop(t0 + opts.dur + release + 0.05);
  });
}

/** Органичный шум (удар, шорох, огонь) через lowpass. */
function softNoise(opts: {
  dur: number;
  gain?: number;
  freq?: number;
  delay?: number;
  type?: BiquadFilterType;
  q?: number;
}): void {
  if (sfxMuted) return;
  const ac = audio();
  if (!ac || !master) return;
  const t0 = ac.currentTime + (opts.delay ?? 0);
  const n = Math.floor(ac.sampleRate * Math.min(opts.dur + 0.05, 1.2));
  const buf = ac.createBuffer(1, n, ac.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < n; i++) {
    // коричневатый шум — мягче белого
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    data[i] = last * 3.5;
  }
  const src = ac.createBufferSource();
  src.buffer = buf;
  const filter = ac.createBiquadFilter();
  filter.type = opts.type ?? "lowpass";
  filter.frequency.setValueAtTime(opts.freq ?? 900, t0);
  filter.frequency.exponentialRampToValueAtTime(
    Math.max(120, (opts.freq ?? 900) * 0.35),
    t0 + opts.dur,
  );
  filter.Q.value = opts.q ?? 0.6;
  const g = ac.createGain();
  envGain(g, t0, opts.gain ?? 0.05, 0.008, opts.dur * 0.25, opts.dur * 0.7);
  src.connect(filter);
  filter.connect(g);
  g.connect(out());
  src.start(t0);
  src.stop(t0 + opts.dur + 0.08);
}

/** Короткий «вуш» воздуха. */
function whoosh(dur = 0.18, gain = 0.04, freq = 1400): void {
  softNoise({
    dur,
    gain,
    freq,
    type: "bandpass",
    q: 0.7,
  });
}

export function sfxUiClick(): void {
  softTone({ freq: 640, dur: 0.07, gain: 0.03, attack: 0.01, harmonics: [1, 0.2] });
}

/** Выкладывание карты: public/sfx/карта.wav */
export function sfxPlayCard(): void {
  playSampleOrFallback(SFX_PLAY_CARD_URL, 0.75, () => {
    softNoise({
      dur: 0.12,
      gain: 0.055,
      freq: 3200,
      type: "bandpass",
      q: 0.55,
    });
    softNoise({
      dur: 0.18,
      gain: 0.04,
      freq: 1800,
      delay: 0.04,
      type: "bandpass",
      q: 0.8,
    });
    softNoise({
      dur: 0.1,
      gain: 0.028,
      freq: 900,
      delay: 0.08,
      type: "lowpass",
      q: 0.5,
    });
  });
}

/** Удар существа: public/sfx/атака.wav */
export function sfxAttack(): void {
  playSampleOrFallback(SFX_ATTACK_URL, 0.8, () => sfxMelee());
}

/** Магический выстрел: public/sfx/метнуть огонь.mp3 */
export function sfxMageBolt(): void {
  playSampleOrFallback(SFX_MAGE_BOLT_URL, 0.85, () => sfxFire());
}

export function isMageBoltCard(cardId: string | undefined): boolean {
  return !!cardId && MAGE_BOLT_CARD_IDS.has(cardId);
}

/** Стрела / болт: public/sfx/стрела.mp3 */
export function sfxArrow(): void {
  playSampleOrFallback(SFX_ARROW_URL, 0.85, () => sfxRanged());
}

export function isArrowCard(cardId: string | undefined): boolean {
  return !!cardId && ARROW_CARD_IDS.has(cardId);
}

/** Атакующая магия по врагу: public/sfx/магия атакующая.mp3 */
export function sfxOffensiveSpell(): void {
  playSampleOrFallback(SFX_OFFENSIVE_SPELL_URL, 0.85, () => sfxSpellGeneric());
}

export function isOffensiveSpellCard(cardId: string | undefined): boolean {
  if (!cardId) return false;
  const effects = getCard(cardId).spellEffects ?? [];
  return effects.some((e) => OFFENSIVE_SPELL_EFFECTS.has(e.type));
}

/** Положительная магия: public/sfx/магия положительная.mp3 */
export function sfxPositiveSpell(): void {
  playSampleOrFallback(SFX_POSITIVE_SPELL_URL, 0.85, () => sfxHeal());
}

export function isPositiveSpellCard(cardId: string | undefined): boolean {
  if (!cardId) return false;
  const effects = getCard(cardId).spellEffects ?? [];
  return effects.some((e) => POSITIVE_SPELL_EFFECTS.has(e.type));
}

/** Крик банши: public/sfx/банши.mp3 */
export function sfxBanshee(): void {
  playSampleOrFallback(SFX_BANSHEE_URL, 0.9, () => sfxDeath());
}

export function isBansheeScreamFx(fx: BattleFx): boolean {
  return (
    fx.kind === "spell" &&
    !!fx.cardId &&
    getCard(fx.cardId).ability === "banshee_flex"
  );
}

export function sfxMelee(): void {
  softNoise({ dur: 0.09, gain: 0.07, freq: 700, type: "lowpass" });
  softTone({
    freq: 95,
    dur: 0.14,
    gain: 0.08,
    attack: 0.005,
    slideTo: 55,
    harmonics: [1, 0.5, 0.2],
  });
  softTone({
    freq: 220,
    dur: 0.08,
    gain: 0.03,
    delay: 0.02,
    attack: 0.005,
    harmonics: [1],
  });
}

export function sfxRanged(): void {
  whoosh(0.16, 0.045, 1800);
  softTone({
    freq: 720,
    dur: 0.12,
    gain: 0.04,
    attack: 0.01,
    slideTo: 280,
    harmonics: [1, 0.3],
  });
  softNoise({
    dur: 0.06,
    gain: 0.035,
    freq: 1600,
    delay: 0.1,
    type: "bandpass",
  });
}

export function sfxCleave(): void {
  whoosh(0.12, 0.04, 1000);
  softNoise({ dur: 0.1, gain: 0.06, freq: 650 });
  softTone({
    freq: 110,
    dur: 0.16,
    gain: 0.07,
    attack: 0.008,
    slideTo: 70,
    harmonics: [1, 0.45, 0.18],
  });
  softTone({
    freq: 165,
    dur: 0.12,
    gain: 0.04,
    delay: 0.05,
    slideTo: 90,
    harmonics: [1, 0.3],
  });
}

export function sfxAoe(): void {
  softNoise({ dur: 0.28, gain: 0.06, freq: 450, type: "lowpass" });
  softTone({
    freq: 70,
    dur: 0.32,
    gain: 0.07,
    attack: 0.04,
    slideTo: 48,
    harmonics: [1, 0.55, 0.25, 0.1],
  });
  softTone({
    freq: 140,
    dur: 0.22,
    gain: 0.03,
    delay: 0.08,
    harmonics: [1, 0.2],
  });
}

export function sfxFire(): void {
  softNoise({ dur: 0.22, gain: 0.055, freq: 900, type: "bandpass", q: 0.5 });
  softNoise({
    dur: 0.28,
    gain: 0.035,
    freq: 400,
    delay: 0.04,
    type: "lowpass",
  });
  softTone({
    freq: 180,
    dur: 0.24,
    gain: 0.045,
    attack: 0.03,
    slideTo: 260,
    harmonics: [1, 0.35, 0.15],
  });
}

export function sfxPoison(): void {
  softTone({
    freq: 210,
    dur: 0.28,
    gain: 0.04,
    attack: 0.06,
    slideTo: 140,
    harmonics: [1, 0.15, 0.35],
  });
  softTone({
    freq: 310,
    dur: 0.32,
    gain: 0.028,
    delay: 0.07,
    attack: 0.08,
    slideTo: 180,
    harmonics: [1, 0.2],
  });
  softNoise({
    dur: 0.2,
    gain: 0.02,
    freq: 600,
    delay: 0.05,
    type: "bandpass",
    q: 1.2,
  });
}

export function sfxWater(): void {
  softNoise({ dur: 0.2, gain: 0.03, freq: 2000, type: "bandpass", q: 0.4 });
  softTone({
    freq: 420,
    dur: 0.22,
    gain: 0.04,
    attack: 0.05,
    slideTo: 520,
    harmonics: [1, 0.4, 0.15],
  });
  softTone({
    freq: 560,
    dur: 0.26,
    gain: 0.028,
    delay: 0.08,
    attack: 0.06,
    slideTo: 380,
    harmonics: [1, 0.25],
  });
}

export function sfxNature(): void {
  softTone({
    freq: 349,
    dur: 0.18,
    gain: 0.04,
    attack: 0.04,
    harmonics: [1, 0.3, 0.12],
  });
  softTone({
    freq: 440,
    dur: 0.2,
    gain: 0.035,
    delay: 0.07,
    attack: 0.05,
    harmonics: [1, 0.25],
  });
  softTone({
    freq: 523,
    dur: 0.22,
    gain: 0.025,
    delay: 0.14,
    attack: 0.05,
    harmonics: [1, 0.2],
  });
}

export function sfxHeal(): void {
  softTone({
    freq: 392,
    dur: 0.2,
    gain: 0.04,
    attack: 0.05,
    harmonics: [1, 0.35, 0.15],
  });
  softTone({
    freq: 494,
    dur: 0.22,
    gain: 0.035,
    delay: 0.09,
    attack: 0.05,
    harmonics: [1, 0.3],
  });
  softTone({
    freq: 587,
    dur: 0.28,
    gain: 0.03,
    delay: 0.18,
    attack: 0.06,
    harmonics: [1, 0.25, 0.1],
  });
}

export function sfxSpellGeneric(): void {
  whoosh(0.2, 0.035, 1200);
  softTone({
    freq: 280,
    dur: 0.22,
    gain: 0.045,
    attack: 0.05,
    slideTo: 420,
    harmonics: [1, 0.4, 0.15],
  });
}

export function sfxDeath(): void {
  softNoise({ dur: 0.22, gain: 0.045, freq: 380, type: "lowpass" });
  softTone({
    freq: 160,
    dur: 0.32,
    gain: 0.055,
    attack: 0.02,
    slideTo: 70,
    harmonics: [1, 0.45, 0.2],
  });
  softTone({
    freq: 240,
    dur: 0.28,
    gain: 0.025,
    delay: 0.06,
    slideTo: 90,
    harmonics: [1, 0.2],
  });
}

export function sfxHitHero(): void {
  softNoise({ dur: 0.12, gain: 0.06, freq: 550 });
  softTone({
    freq: 100,
    dur: 0.2,
    gain: 0.07,
    attack: 0.008,
    slideTo: 60,
    harmonics: [1, 0.5, 0.22],
  });
}

export function sfxWin(): void {
  playSampleOrFallback(SFX_WIN_URL, 0.85, () => {
    const notes = [392, 494, 587, 784];
    notes.forEach((f, i) => {
      softTone({
        freq: f,
        dur: 0.28,
        gain: 0.04 - i * 0.004,
        delay: i * 0.11,
        attack: 0.04,
        harmonics: [1, 0.35, 0.12],
      });
    });
  });
}

export function sfxLose(): void {
  playSampleOrFallback(SFX_LOSE_URL, 0.85, () => {
    softTone({
      freq: 247,
      dur: 0.35,
      gain: 0.05,
      attack: 0.04,
      slideTo: 147,
      harmonics: [1, 0.4, 0.15],
    });
    softTone({
      freq: 185,
      dur: 0.42,
      gain: 0.035,
      delay: 0.15,
      attack: 0.06,
      slideTo: 110,
      harmonics: [1, 0.3],
    });
  });
}

export function sfxTurn(): void {
  softTone({
    freq: 330,
    dur: 0.12,
    gain: 0.03,
    attack: 0.03,
    harmonics: [1, 0.25],
  });
  softTone({
    freq: 415,
    dur: 0.14,
    gain: 0.028,
    delay: 0.08,
    attack: 0.03,
    harmonics: [1, 0.2],
  });
}

function spellBySchool(school: School, cardId?: string): void {
  const card = cardId ? getCard(cardId) : null;
  const effects = card?.spellEffects ?? [];
  if (effects.some((e) => e.type === "poison")) {
    sfxPoison();
    return;
  }
  if (effects.some((e) => e.type === "heal_hero" || e.type === "heal_unit")) {
    sfxHeal();
    return;
  }
  if (effects.some((e) => e.type === "slow_enemy")) {
    sfxWater();
    return;
  }
  switch (school) {
    case "hell":
      sfxFire();
      break;
    case "death":
      sfxPoison();
      break;
    case "water":
      sfxWater();
      break;
    case "life":
      sfxHeal();
      break;
    case "nature":
      sfxNature();
      break;
    default:
      sfxSpellGeneric();
  }
}

function countCreatures(state: BattleState): number {
  return (
    state.you.slots.filter(Boolean).length +
    state.enemy.slots.filter(Boolean).length
  );
}

export function playActionSfx(fx: BattleFx, _before?: BattleState): void {
  unlockSfx();

  if (fx.kind === "play") {
    sfxPlayCard();
    return;
  }
  if (fx.kind === "heal") {
    sfxHeal();
    return;
  }
  if (fx.kind === "spell") {
    if (isBansheeScreamFx(fx)) {
      sfxBanshee();
      return;
    }
    if (isOffensiveSpellCard(fx.cardId)) {
      sfxOffensiveSpell();
      return;
    }
    if (isPositiveSpellCard(fx.cardId)) {
      sfxPositiveSpell();
      return;
    }
    if (fx.cardId) spellBySchool(getCard(fx.cardId).school, fx.cardId);
    else sfxSpellGeneric();
    return;
  }
  if (fx.kind === "lunge") {
    if (isMageBoltCard(fx.cardId)) sfxMageBolt();
    else if (isArrowCard(fx.cardId)) sfxArrow();
    else sfxAttack();
    if (fx.hitHero) setTimeout(() => sfxHitHero(), 90);
  }
}

export function playResultSfx(before: BattleState, after: BattleState): void {
  unlockSfx();
  if (countCreatures(after) < countCreatures(before)) {
    setTimeout(() => sfxDeath(), 90);
  }
}
