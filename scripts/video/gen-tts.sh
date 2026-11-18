#!/usr/bin/env bash
# Seriesight demo video — per-scene TTS narration via z-ai CLI.
# Voice: jam (natural British narrator). Speed 1.0 for a paced, natural read.
set -u
OUT=/tmp/video/audio
mkdir -p "$OUT"

gen () {
  local file="$1"; shift
  local text="$*"
  if [ -s "$OUT/$file" ]; then echo "skip $file"; return; fi
  echo "→ $file"
  z-ai tts -i "$text" -o "$OUT/$file" --voice jam --speed 1.0 --format wav >/dev/null 2>&1 \
    || z-ai tts -i "$text" -o "$OUT/$file" --voice kazi --speed 1.0 --format wav >/dev/null 2>&1
  [ -s "$OUT/$file" ] && echo "  ok $(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT/$file")s" || echo "  FAILED $file"
}

gen s01.wav "Seriesight. The League of Legends coaching platform that turns tournament history into a series plan."
gen s02.wav "Built in Dubai and priced in dirham, it covers everything a coach needs, from opponent scouting to the practice week, in twelve connected workspaces."
gen s03.wav "Judges get one-click demo access. No forms, no card. The full platform unlocks instantly."
gen s04.wav "The Command Center opens the preparation loop: dataset coverage, priority intelligence, and one-click draft setup."
gen s05.wav "Opponent Intelligence turns pick and ban history into tendencies, with Wilson confidence intervals and evidence behind every number."
gen s06.wav "The Draft Room runs a deterministic Fearless engine across best of one, three and five, with live recommendations on every step."
gen s07.wav "In the Series Lab, one pick in game one visibly reshapes what is possible in game two."
gen s08.wav "The Playbook stores every game plan. Compositions, win conditions, key timings, and a printable pre-match brief."
gen s09.wav "The Player Hub tracks roster form, confidence and availability, with development goals for every starter."
gen s10.wav "VOD Review timestamps the key moments, tags the lesson, and walks the team through the film on review day."
gen s11.wav "And the Practice Planner schedules scrims, drills and veto meetings on Gulf Standard Time, logging every result."
gen s12.wav "Seriesight. Plans from zero dirham, a fourteen-day free trial, and one-click judge access. Walk into ban phase already decided."
echo DONE
