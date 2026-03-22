#!/usr/bin/env bash
#
# browser-cli — Token-efficient browser control for discovery agents.
#
# Wraps the /browser/mcp/* REST endpoints into single-line commands.
# Each command returns minimal, structured output — no HTML dumps,
# no verbose JSON. Designed for agents that need to interact with
# pages and capture traffic in the fewest tool calls possible.
#
# Usage:
#   ./scripts/browser-cli.sh <command> [args...] [--port PORT]
#
# Commands:
#   status                     Check if browser is connected
#   navigate <url>             Navigate to URL, return snapshot
#   snapshot                   Get accessibility tree (interactive elements)
#   screenshot [path]          Save screenshot to path (default /tmp/screenshot.jpg)
#   click <selector>           Click element by text content or CSS selector
#   click-xy <x> <y>          Click at coordinates
#   scroll [pixels]            Scroll down (default 600px)
#   type <text>                Type into focused element
#   key <key>                  Press keyboard key (Enter, Escape, Tab, etc.)
#   traffic                    Show captured traffic (method, url, status, size)
#   traffic-clear              Clear traffic buffer
#   eval <js>                  Evaluate JavaScript in page context
#   gather <url>               Navigate + wait + snapshot + traffic (compound)
#   interact <selector>        Clear traffic, click element, return new traffic
#   paginate <selector> [max]  Click repeatedly, collect POST responses
#
# Examples:
#   ./scripts/browser-cli.sh navigate "https://example.com" --port 3012
#   ./scripts/browser-cli.sh click "Show more"
#   ./scripts/browser-cli.sh paginate "Show more" 10
#   ./scripts/browser-cli.sh gather "https://example.com/page"

set -euo pipefail

PORT="${INTERCEPTOR_PORT:-3001}"
API=""

# Parse --port from any position
ARGS=()
for arg in "$@"; do
  if [[ "$arg" == --port=* ]]; then
    PORT="${arg#--port=}"
  elif [[ "${prev:-}" == "--port" ]]; then
    PORT="$arg"
    prev=""
    continue
  elif [[ "$arg" == "--port" ]]; then
    prev="$arg"
    continue
  else
    ARGS+=("$arg")
  fi
  prev="$arg"
done
API="http://localhost:${PORT}/browser/mcp"

CMD="${ARGS[0]:-help}"

# --- Helper functions ---

api_get() {
  curl -sf "$API$1" 2>/dev/null
}

api_post() {
  curl -sf "$API$1" -X POST -H "Content-Type: application/json" -d "$2" 2>/dev/null
}

# Accessibility snapshot — structured list of interactive elements
# Uses page.evaluate to build a minimal tree
get_snapshot() {
  api_post "/evaluate" '{"script":"(()=>{const els=[];document.querySelectorAll(\"a[href],button,input,select,textarea,[role=button],[data-action],[onclick]\").forEach((el,i)=>{if(!el.offsetParent&&el.tagName!==\"INPUT\")return;const tag=el.tagName.toLowerCase();const text=(el.textContent||\"\").trim().slice(0,80);const type=el.getAttribute(\"type\")||\"\";const name=el.getAttribute(\"name\")||el.getAttribute(\"id\")||\"\";const href=el.getAttribute(\"href\")||\"\";const role=el.getAttribute(\"role\")||\"\";const action=el.getAttribute(\"data-action\")||\"\";els.push({ref:\"e\"+i,tag,text,type,name,href:href.slice(0,100),role,action})});return els})()"}' \
    | python3 -c "
import sys,json
try:
  d=json.load(sys.stdin)
  els=d.get('result',[])
  for e in els:
    parts=[e['ref'],e['tag']]
    if e.get('text'): parts.append('\"'+e['text'][:60]+'\"')
    if e.get('type'): parts.append('type='+e['type'])
    if e.get('name'): parts.append('name='+e['name'])
    if e.get('href'): parts.append('→'+e['href'][:60])
    if e.get('role'): parts.append('role='+e['role'])
    if e.get('action'): parts.append('action='+e['action'])
    print(' '.join(parts))
  print(f'--- {len(els)} interactive elements ---')
except: print('Error parsing snapshot')
" 2>/dev/null
}

# Traffic summary — compact one-line-per-entry format
get_traffic() {
  local endpoint="/traffic"
  if [[ "${1:-}" != "" ]]; then
    endpoint="/traffic?since=$1"
  fi
  api_get "$endpoint" | python3 -c "
import sys,json
try:
  d=json.load(sys.stdin)
  entries=d.get('entries',[])
  for e in entries:
    url=e.get('url','')[:120]
    method=e.get('method','?')
    status=e.get('status','?')
    ct=e.get('responseHeaders',{}).get('content-type','')[:30]
    size=e.get('responseSize',0)
    # Skip tracking/analytics
    skip=['google-analytics','doubleclick','facebook','snapchat','onetrust','cookielaw','sentry','forter','riskified']
    if any(s in url.lower() for s in skip): continue
    sz=f'{size}B' if size<1024 else f'{size//1024}KB'
    print(f'{method:4} {status:3} {sz:>6} {ct:30} {url}')
  print(f'--- {len(entries)} entries ---')
except: print('Error parsing traffic')
" 2>/dev/null
}

# Click by text content or CSS selector
click_element() {
  local selector="$1"
  # Try clicking by evaluating in the page — find by text first, then CSS
  api_post "/evaluate" "{\"script\":\"(()=>{const s='${selector//\'/\\\'}';let el=null;document.querySelectorAll('button,a,[role=button],[data-action]').forEach(e=>{if(e.textContent&&e.textContent.trim().includes(s)&&e.offsetParent)el=el||e});if(!el)el=document.querySelector(s);if(!el)return{error:'Element not found: '+s};el.scrollIntoView({block:'center'});el.click();return{clicked:true,tag:el.tagName,text:(el.textContent||'').trim().slice(0,60)}})()\"}" \
    | python3 -c "
import sys,json
try:
  d=json.load(sys.stdin).get('result',{})
  if 'error' in d: print('ERROR:',d['error'])
  else: print(f'Clicked {d.get(\"tag\",\"?\")}:',d.get('text','')[:60])
except Exception as e: print(f'Error: {e}')
" 2>/dev/null
}

# --- Commands ---

case "$CMD" in
  status)
    api_get "/status" | python3 -c "
import sys,json
d=json.load(sys.stdin)
if d.get('connected'): print(f'Connected: {d.get(\"url\",\"?\")}')
else: print('Not connected')
" 2>/dev/null
    ;;

  navigate)
    url="${ARGS[1]:-}"
    [[ -z "$url" ]] && echo "Usage: browser-cli.sh navigate <url>" && exit 1
    api_post "/navigate" "{\"url\":\"$url\"}" | python3 -c "import sys,json; print('Navigated to:',json.load(sys.stdin).get('url','?'))" 2>/dev/null
    sleep 3
    echo ""
    get_snapshot
    ;;

  snapshot)
    get_snapshot
    ;;

  screenshot)
    path="${ARGS[1]:-/tmp/screenshot.jpg}"
    api_post "/screenshot" '{"quality":60}' | python3 -c "
import sys,json,base64
d=json.load(sys.stdin)
img=base64.b64decode(d['data'])
with open('$path','wb') as f: f.write(img)
print(f'Screenshot saved: $path ({len(img)//1024}KB)')
" 2>/dev/null
    ;;

  click)
    selector="${ARGS[1]:-}"
    [[ -z "$selector" ]] && echo "Usage: browser-cli.sh click <selector>" && exit 1
    click_element "$selector"
    ;;

  click-xy)
    x="${ARGS[1]:-}"
    y="${ARGS[2]:-}"
    [[ -z "$x" || -z "$y" ]] && echo "Usage: browser-cli.sh click-xy <x> <y>" && exit 1
    api_post "/click" "{\"x\":$x,\"y\":$y}" >/dev/null
    echo "Clicked ($x, $y)"
    ;;

  scroll)
    pixels="${ARGS[1]:-600}"
    api_post "/scroll" "{\"x\":512,\"y\":288,\"deltaY\":$pixels}" >/dev/null
    echo "Scrolled ${pixels}px"
    ;;

  type)
    text="${ARGS[1]:-}"
    [[ -z "$text" ]] && echo "Usage: browser-cli.sh type <text>" && exit 1
    api_post "/type" "{\"text\":\"$text\"}" >/dev/null
    echo "Typed: $text"
    ;;

  key)
    key="${ARGS[1]:-}"
    [[ -z "$key" ]] && echo "Usage: browser-cli.sh key <key>" && exit 1
    api_post "/key" "{\"key\":\"$key\"}" >/dev/null
    echo "Pressed: $key"
    ;;

  traffic)
    get_traffic "${ARGS[1]:-}"
    ;;

  traffic-clear)
    api_post "/traffic/clear" '{}' >/dev/null
    echo "Traffic cleared"
    ;;

  eval)
    script="${ARGS[1]:-}"
    [[ -z "$script" ]] && echo "Usage: browser-cli.sh eval <js>" && exit 1
    api_post "/evaluate" "{\"script\":$(python3 -c "import json; print(json.dumps('$script'))")}" \
      | python3 -c "import sys,json; r=json.load(sys.stdin).get('result'); print(json.dumps(r,indent=2) if isinstance(r,(dict,list)) else str(r))" 2>/dev/null
    ;;

  # --- Compound commands ---

  gather)
    url="${ARGS[1]:-}"
    [[ -z "$url" ]] && echo "Usage: browser-cli.sh gather <url>" && exit 1
    # Clear traffic, navigate, wait, return snapshot + traffic
    api_post "/traffic/clear" '{}' >/dev/null
    api_post "/navigate" "{\"url\":\"$url\"}" >/dev/null
    echo "Navigating to: $url"
    sleep 5
    echo ""
    echo "=== Interactive Elements ==="
    get_snapshot
    echo ""
    echo "=== Traffic ==="
    get_traffic
    ;;

  interact)
    selector="${ARGS[1]:-}"
    [[ -z "$selector" ]] && echo "Usage: browser-cli.sh interact <selector>" && exit 1
    # Clear traffic, click, wait, return new traffic
    api_post "/traffic/clear" '{}' >/dev/null
    click_element "$selector"
    sleep 3
    echo ""
    echo "=== New Traffic ==="
    get_traffic
    ;;

  paginate)
    selector="${ARGS[1]:-}"
    max_clicks="${ARGS[2]:-20}"
    [[ -z "$selector" ]] && echo "Usage: browser-cli.sh paginate <selector> [max_clicks]" && exit 1
    echo "Paginating: clicking \"$selector\" up to $max_clicks times"
    api_post "/traffic/clear" '{}' >/dev/null
    clicks=0
    while [[ $clicks -lt $max_clicks ]]; do
      # Try to click the element
      result=$(click_element "$selector" 2>&1)
      if echo "$result" | grep -q "ERROR"; then
        echo "No more \"$selector\" button — done after $clicks clicks."
        break
      fi
      clicks=$((clicks + 1))
      echo "Click #$clicks: $result"
      sleep 2
    done
    echo ""
    echo "=== Captured Traffic ==="
    get_traffic
    ;;

  help|*)
    echo "browser-cli — Token-efficient browser control for discovery agents"
    echo ""
    echo "Usage: ./scripts/browser-cli.sh <command> [args...] [--port PORT]"
    echo ""
    echo "Atomic commands:"
    echo "  status                     Check browser connection"
    echo "  navigate <url>             Navigate + return snapshot"
    echo "  snapshot                   Accessibility tree (interactive elements)"
    echo "  screenshot [path]          Save screenshot"
    echo "  click <text|selector>      Click by text or CSS selector"
    echo "  click-xy <x> <y>          Click at coordinates"
    echo "  scroll [pixels]            Scroll down"
    echo "  type <text>                Type text"
    echo "  key <key>                  Press key"
    echo "  traffic [since]            Show captured traffic"
    echo "  traffic-clear              Clear traffic buffer"
    echo "  eval <js>                  Run JavaScript"
    echo ""
    echo "Compound commands:"
    echo "  gather <url>               Navigate + snapshot + traffic"
    echo "  interact <text|selector>   Click + capture new traffic"
    echo "  paginate <text> [max]      Click repeatedly, collect responses"
    echo ""
    echo "Environment: INTERCEPTOR_PORT (default 3001)"
    ;;
esac
