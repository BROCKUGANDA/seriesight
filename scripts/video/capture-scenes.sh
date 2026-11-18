#!/usr/bin/env bash
# Seriesight demo video — scene capture via agent-browser (headless Chromium).
# Captures each workspace at 1280x720 after UI settles. Output: /tmp/video/scenes/
set -u
S=/tmp/video/scenes
mkdir -p "$S"
AB="agent-browser"
shot () { $AB screenshot "$S/$1.png" >/dev/null 2>&1 && echo "  ✓ $1"; }
nav () { $AB eval "location.hash='#/$1'; 'ok'" >/dev/null; sleep 1.6; }
settle () { $AB wait --load networkidle >/dev/null 2>&1; sleep "$1"; }

$AB set viewport 1280 720 >/dev/null
$AB open "http://127.0.0.1:3000/#/dashboard" >/dev/null 2>&1
settle 3

# 0. Sign out so we can capture the sign-in gateway
$AB eval "(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.getAttribute('aria-label')==='Account menu'); b&&b.click(); return 'm'})()" >/dev/null
sleep 0.7
$AB eval "(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('Sign out')); b&&b.click(); return 'out'})()" >/dev/null
sleep 1.5

# 1. Landing
$AB eval "location.hash='#/'; 'ok'" >/dev/null; settle 2.5
$AB eval "window.scrollTo(0,0)" >/dev/null; sleep 0.8
shot 01-landing

# 2. Sign-in gateway
$AB eval "location.hash='#/signin'; 'ok'" >/dev/null; settle 2
shot 02-signin

# 3. Judge one-click → dashboard
$AB eval "(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('Enter Judge Demo')); b&&b.click(); return 'in'})()" >/dev/null
settle 5.5   # let the welcome toast expire
shot 03-dashboard

# 4. Opponent Intelligence
nav scouting; settle 1.5; shot 04-scouting

# 5. Draft Room — create session, lock one ban, capture the live board
$AB eval "location.hash='#/draft'; 'ok'" >/dev/null; settle 2
$AB eval "(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('Create draft session')); b&&b.click(); return 'c'})()" >/dev/null
sleep 2
$AB eval "(()=>{const t=[...document.querySelectorAll('button')].find(x=>/available/.test(x.getAttribute('aria-label')||'') && (x.getAttribute('aria-label')||'').includes('Aatrox')); if(t){t.click(); return 'tile'} return 'no-tile'})()" >/dev/null
sleep 1.2
$AB eval "(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('Lock ban')); if(b){b.click(); return 'b'} return 'no-b'})()" >/dev/null
sleep 1.8
shot 05-draft

# 6. Series Lab
nav series-lab; settle 1.8; shot 06-serieslab

# 7. Playbook
nav playbook; settle 1.5; shot 07-playbook

# 8. Player Hub
nav players; settle 1.5; shot 08-players

# 9. VOD Review
nav vod; settle 1.5; shot 09-vod

# 10. Practice Planner
nav practice; settle 1.5; shot 10-practice

# 11. Macro Atlas (bonus analytics scene)
nav macro; settle 1.8; shot 11-macro

# 12. Pricing
nav pricing; settle 1.8
$AB eval "window.scrollTo(0,0)" >/dev/null; sleep 0.8
shot 12-pricing

ls -la "$S"
echo CAPTURE_DONE
