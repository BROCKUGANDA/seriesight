#!/usr/bin/env python3
"""
Seriesight platform demo — hyperframes video builder.

Pipeline (all local, no external services):
  1. Narration clips (TTS, jam voice) already generated to /tmp/video/audio/*.wav
  2. Scene screenshots already captured to /tmp/video/scenes/*.png
  3. This script:
       a. plans the timeline: every scene length snapped to the 120 BPM bar grid
       b. synthesizes a four-on-the-floor electronic beat with numpy (kick, clap,
          hats, sub bass) sized to the timeline
       c. places narration at scene starts and ducks the beat under speech
       d. renders every frame with Pillow: Ken Burns moves over app captures,
            composed intro/outro cards, captions, progress bar, beat-flash accents
       e. assembles the final H.264 with ffmpeg (frames + mixed audio)
"""
import math
import os
import shutil
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

FPS = 30
W, H = 1280, 720
BPM = 120.0
BEAT = 60.0 / BPM          # 0.5 s
BAR = BEAT * 4             # 2.0 s
SR = 24000                 # narration + bed sample rate
AUDIO_SR = 48000           # final mix rate
SCENES_DIR = "/tmp/video/scenes"
AUDIO_DIR = "/tmp/video/audio"
FRAMES_DIR = "/tmp/video/frames"
OUT_DIR = "/home/z/my-project/download"

VOLT = (198, 255, 62)
MINT = (70, 232, 176)
PLASMA = (157, 123, 255)
MAGENTA = (255, 92, 168)
INK = (10, 10, 14)
SURFACE = (21, 22, 28)
SURFACE2 = (28, 30, 38)
TEXT_MAIN = (245, 247, 251)
TEXT_SUB = (195, 202, 216)
TEXT_MUTED = (141, 150, 169)

FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_REG = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
font_bold = lambda s: ImageFont.truetype(FONT_BOLD, s)
font_reg = lambda s: ImageFont.truetype(FONT_REG, s)

# ------------------------------------------------------------------ timeline
# (key, image file, narration file, caption, kenburns style)
SCENES = [
    ("intro", None, "s01.wav", None, None),
    ("app", "01-landing.png", "s02.wav", "Landing — built in Dubai, UAE", "push"),
    ("app", "02-signin.png", "s03.wav", "Sign-in gateway — judge demo access", "push"),
    ("app", "03-dashboard.png", "s04.wav", "Command Center — preparation overview", "push"),
    ("app", "04-scouting.png", "s05.wav", "Opponent Intelligence — evidence-backed tendencies", "push"),
    ("app", "05-draft.png", "s06.wav", "Draft Room — deterministic Fearless engine", "push"),
    ("app", "06-serieslab.png", "s07.wav", "Series Lab — five-game simulation", "push"),
    ("app", "07-playbook.png", "s08.wav", "Playbook — strategies and pre-match briefs", "push"),
    ("app", "08-players.png", "s09.wav", "Player Hub — roster form and development goals", "push"),
    ("app", "09-vod.png", "s10.wav", "VOD Review — clip tagging and film sessions", "push"),
    ("app", "10-practice.png", "s11.wav", "Practice Planner — scrims, drills, veto meetings", "push"),
    ("app", "11-macro.png", None, "Macro Atlas — objective analytics", "push"),
    ("app", "12-pricing.png", "s12.wav", "Pricing — plans from AED 0 · 14-day trial", "push"),
    ("outro", None, None, None, None),
]


def narr_duration(path: str) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
        capture_output=True, text=True, check=True,
    )
    return float(out.stdout.strip())


def plan_timeline() -> list[dict]:
    plan = []
    for i, (kind, img, narr, caption, kb) in enumerate(SCENES):
        if kind == "intro":
            nd = narr_duration(os.path.join(AUDIO_DIR, narr))
            dur = max(math.ceil((nd + 0.9) / BAR) * BAR, BAR * 3)
        elif kind == "outro":
            dur = BAR * 3  # 6 s musical outro with fade
        elif narr is None:
            dur = BAR * 4  # silent b-roll (Macro Atlas)
        else:
            nd = narr_duration(os.path.join(AUDIO_DIR, narr))
            dur = max(math.ceil((nd + 0.8) / BAR) * BAR, BAR * 3)
        plan.append({"kind": kind, "img": img, "narr": narr, "caption": caption,
                     "kb": kb, "dur": dur, "start": 0.0})
    t = 0.0
    for s in plan:
        s["start"] = t
        t += s["dur"]
    return plan


# ------------------------------------------------------------------ audio
def adsr_envelope(n: int, a: int, d: int, s_level: float, r: int) -> np.ndarray:
    env = np.ones(n, dtype=np.float32) * s_level
    a = min(a, n); d = min(a + d, n); r = min(n, r)
    env[:a] = np.linspace(0, 1, a, endpoint=False)
    env[a:d] = np.linspace(1, s_level, d - a, endpoint=False)
    if r > 0:
        env[-r:] *= np.linspace(1, 0, r)
    return env


def kick(sr: int) -> np.ndarray:
    n = int(0.30 * sr)
    t = np.arange(n) / sr
    f = 42 + 128 * np.exp(-t * 26)
    phase = 2 * np.pi * np.cumsum(f) / sr
    body = np.sin(phase) * np.exp(-t * 11)
    click = np.random.default_rng(7).standard_normal(n) * np.exp(-t * 400) * 0.35
    return ((body + click) * 0.95).astype(np.float32)


def clap(sr: int) -> np.ndarray:
    n = int(0.22 * sr)
    rng = np.random.default_rng(11)
    t = np.arange(n) / sr
    noise = rng.standard_normal(n).astype(np.float32)
    # simple band emphasis via diff (crude highpass) + 3 echoes
    hp = np.diff(noise, prepend=0.0)
    env = np.exp(-t * 24) * (1 + 0.55 * np.exp(-((t - 0.012) ** 2) / 1e-5))
    return (hp * env * 0.8).astype(np.float32)


def hat(sr: int, open_: bool = False) -> np.ndarray:
    n = int((0.16 if open_ else 0.055) * sr)
    rng = np.random.default_rng(23 if open_ else 19)
    t = np.arange(n) / sr
    hp = np.diff(rng.standard_normal(n).astype(np.float32), prepend=0.0)
    return (hp * np.exp(-t * (26 if open_ else 90)) * 0.5).astype(np.float32)


def bass_note(freq: float, dur: float, sr: int) -> np.ndarray:
    n = int(dur * sr)
    t = np.arange(n) / sr
    wave = np.tanh(2.6 * np.sin(2 * np.pi * freq * t) + 0.7 * np.sin(2 * np.pi * freq * 2 * t))
    env = adsr_envelope(n, int(0.006 * sr), int(0.09 * sr), 0.72, int(0.10 * sr))
    return (wave * env * 0.62).astype(np.float32)


def place(buf: np.ndarray, clip: np.ndarray, at: int) -> None:
    end = min(len(buf), at + len(clip))
    if at < len(buf):
        buf[at:end] += clip[: end - at]


def build_beat(total_s: float) -> np.ndarray:
    """Four-on-the-floor at BPM with an F-minor style sub line."""
    sr = SR
    total = int(total_s * sr)
    bed = np.zeros(total, dtype=np.float32)
    kick_s, clap_s, hat_s, hat_o = kick(sr), clap(sr), hat(sr, False), hat(sr, True)
    # bass line: F1-F1-G#1-G#1 | C2-C2-D#2-C2 (bar loop), octave F1 ≈ 43.65 Hz
    bar_notes = [43.65, 43.65, 51.91, 51.91, 65.41, 65.41, 58.27, 65.41]
    n_bars = math.ceil(total_s / BAR)
    for bar in range(n_bars):
        bar_t0 = int(bar * BAR * sr)
        note = bar_notes[bar % len(bar_notes)]
        for b in range(4):
            at = bar_t0 + int(b * BEAT * sr)
            place(bed, kick_s, at)
            place(bed, clap_s, at + int(BEAT * sr)) if b in (1, 3) else None
            place(bed, hat_s, at + int(BEAT * 0.5 * sr))
            place(bed, hat_o, at + int(BEAT * 0.5 * sr)) if b == 3 else None
            place(bed, bass_note(note, BEAT * 1.7, sr), at)
    # gentle limiter
    bed = np.tanh(bed * 0.9)
    return bed * 0.9


def rms_env(sig: np.ndarray, hop_ms: int = 20) -> np.ndarray:
    hop = int(SR * hop_ms / 1000)
    n = len(sig) // hop
    if n == 0:
        return np.zeros(1, dtype=np.float32)
    trimmed = sig[: n * hop].reshape(n, hop)
    return np.sqrt((trimmed ** 2).mean(axis=1) + 1e-12)


def build_audio(plan: list[dict], out_path: str) -> float:
    total_s = sum(s["dur"] for s in plan)
    total = int(math.ceil(total_s * SR))
    bed = build_beat(total_s)[:total]
    narr = np.zeros(total, dtype=np.float32)

    for s in plan:
        if s["narr"]:
            clip = subprocess.run(
                ["ffmpeg", "-v", "error", "-i", os.path.join(AUDIO_DIR, s["narr"]),
                 "-f", "f32le", "-acodec", "pcm_f32le", "-ac", "1", "-ar", str(SR), "-"],
                capture_output=True, check=True).stdout
            x = np.frombuffer(clip, dtype=np.float32)
            at = int((s["start"] + 0.45) * SR)
            place(narr, x / max(1.0, np.abs(x).max() / 0.94), at)

    # Duck the bed under narration: gain 0.22 while speaking → 0.85 in gaps.
    env = rms_env(narr)
    if len(env) > 4:
        env = np.convolve(env, np.ones(8, dtype=np.float32) / 8, mode="same")
        env = np.clip(env / (env.max() + 1e-9), 0, 1)
    up = np.repeat(env, int(SR * 0.02))
    up = np.pad(up, (0, max(0, total - len(up))))[:total]
    gain = 0.22 + 0.63 * (1.0 - up)
    mix = narr + bed * gain

    # final gentle bus compression + normalize
    mix = np.tanh(mix * 1.12)
    mix = mix / max(1e-9, np.abs(mix).max()) * 0.92
    # resample to 48k stereo for the master
    raw = (mix.astype(np.float32).tobytes())
    p = subprocess.run(
        ["ffmpeg", "-v", "error", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "-",
         "-ar", str(AUDIO_SR), "-ac", "2", "-c:a", "pcm_s16le", "-f", "wav", "-"],
        input=raw, capture_output=True, check=True)
    with open(out_path, "wb") as f:
        f.write(p.stdout)
    return total_s


# ------------------------------------------------------------------ visuals
def lerp(a, b, t):
    return a + (b - a) * t


def grad_bar(img: Image.Image, x0, x1, y, h) -> None:
    d = ImageDraw.Draw(img)
    w = max(1, int(x1 - x0))
    for i in range(w):
        t = i / w
        c = (
            int(lerp(VOLT[0], PLASMA[0], t) if t < 1 else PLASMA[0]),
            int(lerp(VOLT[1], PLASMA[1], t)),
            int(lerp(VOLT[2], PLASMA[2], t)),
        )
        d.line([(x0 + i, y), (x0 + i, y + h)], fill=c)


def grid_floor(draw: ImageDraw.ImageDraw, t: float) -> None:
    """Perspective-style horizon grid, drifting slowly."""
    horizon = int(H * 0.62)
    step = 46
    drift = int((t * 14) % step)
    for x in range(-step, W + step, step):
        draw.line([(x + drift, horizon), (x + drift + (x - W // 2) * 0.42, H)], fill=(28, 30, 38), width=1)
    for i in range(1, 8):
        y = horizon + int((i ** 1.55) * 13)
        if y < H:
            draw.line([(0, y), (W, y)], fill=(26, 28, 35), width=1)
    draw.line([(0, horizon), (W, horizon)], fill=(40, 43, 54), width=1)


def five_bars(draw: ImageDraw.ImageDraw, cx, cy, scale, prog, beat_p) -> None:
    """Seriesight mark: five signal bars + aperture ring, rising on the beat."""
    colors = [VOLT, MINT, TEXT_MAIN, PLASMA, MAGENTA]
    heights = [12, 18, 16, 18, 12]
    for i, (c, h0) in enumerate(zip(colors, heights)):
        rise = max(0.0, min(1.0, prog * 1.6 - i * 0.12))
        h = h0 * scale * rise * (1 + 0.06 * beat_p)
        x = cx + (i - 2) * 4.2 * scale
        y0 = cy - (h / 2) + (i - 2) * 1.5 * scale * 0.5
        w = 2.4 * scale
        draw.rounded_rectangle([x - w / 2, y0 - h / 2, x + w / 2, y0 + h / 2], radius=w / 2, fill=c)
    r = 14 * scale
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(70, 76, 94), width=2)


def intro_frame(t: float, t_total: float, beat_phase: float, kick: bool) -> Image.Image:
    img = Image.new("RGB", (W, H), INK)
    d = ImageDraw.Draw(img)
    grid_floor(d, t)
    beat_p = 1.0 - beat_phase  # 1 right at the hit
    # glow behind mark
    glow = Image.new("RGB", (W, H), INK)
    gd = ImageDraw.Draw(glow)
    gd.ellipse([W // 2 - 170, 300 - 150, W // 2 + 170, 300 + 150], fill=(28, 34, 22))
    glow = glow.filter(ImageFilter.GaussianBlur(90))
    img = Image.blend(img, Image.blend(img, glow, 0.55), 0.8)
    d = ImageDraw.Draw(img)
    five_bars(d, W // 2, 300, 5.0, min(1.0, t / 1.1), beat_p)

    # title
    title = "SERIESIGHT"
    f = font_bold(64)
    tr = 14
    tw = sum(d.textlength(c, font=f) for c in title) + tr * (len(title) - 1)
    x = (W - tw) / 2
    for c in title:
        d.text((x, 408), c, font=f, fill=TEXT_MAIN)
        x += d.textlength(c, font=f) + tr
    grad_bar(img, W // 2 - 150, W // 2 + 150, 496, 5)

    d.text((W // 2, 530), "THE SERIES, IN FOCUS.", font=font_reg(26), fill=TEXT_SUB, anchor="mm")
    d.text((W // 2, 580), "PRE-MATCH COACHING INTELLIGENCE · DUBAI, UNITED ARAB EMIRATES",
           font=font_reg(17), fill=TEXT_MUTED, anchor="mm")
    d.text((W // 2, 622), "platform walkthrough — end to end", font=font_reg(15),
           fill=(int(lerp(141, 198, beat_p)), int(lerp(150, 255, beat_p)), int(lerp(169, 62, beat_p))), anchor="mm")
    if kick:
        d.rectangle([0, 0, W, 3], fill=VOLT)
    return img


def outro_frame(t: float, t_total: float, beat_phase: float, kick: bool) -> Image.Image:
    img = Image.new("RGB", (W, H), INK)
    d = ImageDraw.Draw(img)
    grid_floor(d, t)
    beat_p = 1.0 - beat_phase
    fade = min(1.0, t / 0.7)
    five_bars(d, W // 2, 250, 4.4, fade, beat_p)
    f = font_bold(46)
    msg = "WALK INTO BAN PHASE ALREADY DECIDED."
    tw = d.textlength(msg, font=f)
    d.text((W // 2 - tw / 2, 360), msg, font=f, fill=TEXT_MAIN)
    grad_bar(img, W // 2 - 130, W // 2 + 130, 432, 4)
    d.text((W // 2, 480), "Judge demo · one click · full platform", font=font_reg(24), fill=TEXT_SUB, anchor="mm")
    d.text((W // 2, 522), "seriesight.ae — plans from AED 0 · 14-day free trial", font=font_reg(18), fill=TEXT_MUTED, anchor="mm")
    d.text((W // 2, 566), "Built in Dubai, United Arab Emirates", font=font_reg(16),
           fill=(int(198 * fade), int(255 * fade), int(62 * fade)), anchor="mm")
    d.text((W // 2, 640), "VOLT ARENA interface · 3D depth · haptics · ⌘K palette", font=font_reg(14), fill=TEXT_MUTED, anchor="mm")
    if kick:
        d.rectangle([0, H - 3, W, H], fill=VOLT)
    return img


def ken_burns(base: Image.Image, prog: float, style: str) -> Image.Image:
    zoom = lerp(1.02, 1.115, prog)
    base_w, base_h = base.size
    cw = int(base_w / zoom)
    ch = int(base_h / zoom)
    # alternate drift direction by style phase
    dx = (0.5 - abs(0.5 - prog)) * 0.0
    pan_x = (base_w - cw) * lerp(0.30, 0.62, prog)
    pan_y = (base_h - ch) * lerp(0.12, 0.40, prog)
    box = (int(pan_x), int(pan_y), int(pan_x) + cw, int(pan_y) + ch)
    frame = base.crop(box).resize((W, H), Image.LANCZOS)
    return frame


def caption_overlay(img: Image.Image, caption: str, idx: int, total_app: int,
                    global_t: float, total_t: float, beat_phase: float, kick: bool) -> Image.Image:
    d = ImageDraw.Draw(img, "RGBA")
    # top progress bar
    pw = int(W * (global_t / total_t))
    if pw > 0:
        for i in range(pw):
            t = i / W
            c = (int(lerp(VOLT[0], PLASMA[0], t)), int(lerp(VOLT[1], PLASMA[1], t)), int(lerp(VOLT[2], PLASMA[2], t)), 235)
            d.line([(i, 0), (i, 4)], fill=c)
    # caption pill, bottom-left
    f = font_reg(21)
    fi = font_bold(15)
    pad = 16
    tw = d.textlength(caption, font=f)
    box_w = int(tw + pad * 2 + 30)
    box_h = 46
    x0, y0 = 18, H - box_h - 16
    d.rounded_rectangle([x0, y0, x0 + box_w, y0 + box_h], radius=12, fill=(16, 16, 21, 216))
    d.rounded_rectangle([x0, y0, x0 + 6, y0 + box_h], radius=3, fill=(*VOLT, 255))
    d.text((x0 + 20, y0 + box_h // 2), caption, font=f, fill=(*TEXT_MAIN, 255), anchor="lm")
    d.text((x0 + box_w - 14, y0 + box_h // 2), f"{idx:02d}/{total_app:02d}", font=fi, fill=(*TEXT_MUTED, 255), anchor="rm")
    if kick:
        d.rectangle([0, H - 2, W, H], fill=(*VOLT, 120))
    return img


def render_frames(plan: list[dict], total_t: float) -> None:
    shutil.rmtree(FRAMES_DIR, ignore_errors=True)
    os.makedirs(FRAMES_DIR, exist_ok=True)
    total_frames = int(round(total_t * FPS))
    app_index = 0
    APP_TOTAL = sum(1 for s in plan if s["kind"] == "app")
    bases: dict[str, Image.Image] = {}

    for s in plan:
        if s["kind"] == "app" and s["img"]:
            bases[s["img"]] = Image.open(os.path.join(SCENES_DIR, s["img"])).convert("RGB").resize((W, H), Image.LANCZOS)

    n = 0
    for s in plan:
        n_frames = int(round(s["dur"] * FPS))
        for k in range(n_frames):
            t = s["start"] + k / FPS
            beat_phase = (t % BEAT) / BEAT
            kick = (t % BEAT) < (1 / FPS) + 1e-9
            prog = k / max(1, n_frames - 1)
            if s["kind"] == "intro":
                img = intro_frame(t, total_t, beat_phase, kick)
            elif s["kind"] == "outro":
                img = outro_frame(t, total_t, beat_phase, kick)
            else:
                img = ken_burns(bases[s["img"]], prog, s["kb"] or "push")
                if s["narr"] is None:
                    app_index += 0  # silent b-roll keeps numbering clean
                img = caption_overlay(img, s["caption"], app_index + 1, APP_TOTAL,
                                      t, total_t, beat_phase, kick)
                app_index += 1
            img.save(os.path.join(FRAMES_DIR, f"f{n:05d}.jpg"), quality=88, subsampling=1)
            n += 1
        # keep app_index correct across scenes
        if s["kind"] == "app" and s["narr"] is None:
            pass
    print(f"rendered {n} frames")


def main() -> None:
    plan = plan_timeline()
    total_t = sum(s["dur"] for s in plan)
    print(f"timeline: {total_t:.1f}s across {len(plan)} scenes")
    for s in plan:
        print(f"  {s['start']:6.1f}s → {s['start']+s['dur']:6.1f}s  {s['kind']:6s} {s['img'] or '':16s} narr={s['narr']}")
    os.makedirs(OUT_DIR, exist_ok=True)
    wav = "/tmp/video/mix.wav"
    build_audio(plan, wav)
    print("audio mixed")
    render_frames(plan, total_t)
    out = os.path.join(OUT_DIR, "seriesight-platform-demo.mp4")
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error",
         "-framerate", str(FPS), "-i", os.path.join(FRAMES_DIR, "f%05d.jpg"),
         "-i", wav,
         "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
         "-c:a", "aac", "-b:a", "192k",
         "-shortest", "-movflags", "+faststart", out],
        check=True)
    print("written", out)


if __name__ == "__main__":
    main()
