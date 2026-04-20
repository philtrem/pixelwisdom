/* ==========================================================================
   Snappy app preview — interactive mock
   Replicates the real app's search/nav behavior against a fixed dataset:
   - Live filtering as you type
   - fzf-style operators (^prefix, suffix$, 'exact, !exclude)
   - Smart case
   - Whitespace-separated AND atoms
   - ↑/↓ navigation, Enter to "open" (flash), → to scope (dirs)
   - Apps/Preferences/Hidden toggles filter by kind
   - Fuzzy toggle flips strict/loose matching
   ========================================================================== */

// ----- Mock dataset --------------------------------------------------------
// Realistic paths mixing apps, folders, files. Hidden-flag items only show
// when the Hidden toggle is on.
const MOCK = [
  // Applications
  { name: "Finder.app", path: "/System/Library/CoreServices/Finder.app", kind: "application", app: "finder", bundle: "com.apple.finder" },
  { name: "Terminal.app", path: "/System/Applications/Utilities/Terminal.app", kind: "application", app: "terminal", bundle: "com.apple.Terminal" },
  { name: "Safari.app", path: "/Applications/Safari.app", kind: "application", app: "safari", bundle: "com.apple.Safari" },
  { name: "Visual Studio Code.app", path: "/Applications/Visual Studio Code.app", kind: "application", app: "code", bundle: "com.microsoft.VSCode" },
  { name: "Notes.app", path: "/System/Applications/Notes.app", kind: "application", app: "notes", bundle: "com.apple.Notes" },
  { name: "Music.app", path: "/System/Applications/Music.app", kind: "application", app: "music", bundle: "com.apple.Music" },
  { name: "Photos.app", path: "/System/Applications/Photos.app", kind: "application", app: "photos", bundle: "com.apple.Photos" },
  { name: "Mail.app", path: "/System/Applications/Mail.app", kind: "application", app: "mail", bundle: "com.apple.mail" },
  { name: "Calendar.app", path: "/System/Applications/Calendar.app", kind: "application", app: "calendar", bundle: "com.apple.iCal" },
  { name: "Snappy.app", path: "/Applications/Snappy.app", kind: "application", app: "snappy", bundle: "app.snappy" },

  // Preference panes
  { name: "Keyboard.prefPane", path: "/System/Library/PreferencePanes/Keyboard.prefPane", kind: "prefPane", bundle: "com.apple.preference.keyboard" },
  { name: "Displays.prefPane", path: "/System/Library/PreferencePanes/Displays.prefPane", kind: "prefPane", bundle: "com.apple.preference.displays" },
  { name: "Network.prefPane", path: "/System/Library/PreferencePanes/Network.prefPane", kind: "prefPane", bundle: "com.apple.preference.network" },

  // Directories
  { name: "Projects", path: "/Users/phil/Projects", kind: "directory" },
  { name: "project-phoenix", path: "/Users/phil/Work/project-phoenix", kind: "directory" },
  { name: "snappy", path: "/Users/phil/Projects/snappy", kind: "directory" },
  { name: "src", path: "/Users/phil/Projects/snappy/src", kind: "directory" },
  { name: "src-tauri", path: "/Users/phil/Projects/snappy/src-tauri", kind: "directory" },
  { name: "Documents", path: "/Users/phil/Documents", kind: "directory" },
  { name: "Downloads", path: "/Users/phil/Downloads", kind: "directory" },
  { name: "node_modules", path: "/Users/phil/Projects/snappy/node_modules", kind: "directory", noisy: true },
  { name: "Library", path: "/Users/phil/Library", kind: "directory", noisy: true },
  { name: "Archives", path: "/Users/phil/Documents/Archives", kind: "directory" },

  // Files
  { name: "README.md", path: "/Users/phil/Projects/snappy/README.md", kind: "file" },
  { name: "readme.txt", path: "/Users/phil/Work/legacy/readme.txt", kind: "file" },
  { name: "package.json", path: "/Users/phil/Projects/snappy/package.json", kind: "file" },
  { name: "package-lock.json", path: "/Users/phil/Projects/snappy/package-lock.json", kind: "file" },
  { name: "tauri.conf.json", path: "/Users/phil/Projects/snappy/src-tauri/tauri.conf.json", kind: "file" },
  { name: "Cargo.toml", path: "/Users/phil/Projects/snappy/src-tauri/Cargo.toml", kind: "file" },
  { name: "main.rs", path: "/Users/phil/Projects/snappy/src-tauri/src/main.rs", kind: "file" },
  { name: "engine.rs", path: "/Users/phil/Projects/snappy/src-tauri/src/search/engine.rs", kind: "file" },
  { name: "walker.rs", path: "/Users/phil/Projects/snappy/src-tauri/src/indexer/walker.rs", kind: "file" },
  { name: "history.rs", path: "/Users/phil/Projects/snappy/src-tauri/src/search/history.rs", kind: "file" },
  { name: "App.tsx", path: "/Users/phil/Projects/snappy/src/App.tsx", kind: "file" },
  { name: "SearchBar.tsx", path: "/Users/phil/Projects/snappy/src/components/SearchBar.tsx", kind: "file" },
  { name: "ResultList.tsx", path: "/Users/phil/Projects/snappy/src/components/ResultList.tsx", kind: "file" },
  { name: "styles.css", path: "/Users/phil/Projects/snappy/site/styles.css", kind: "file" },
  { name: "invoice-2026-03.pdf", path: "/Users/phil/Documents/Finance/invoice-2026-03.pdf", kind: "file" },
  { name: "invoice-2026-02.pdf", path: "/Users/phil/Documents/Finance/invoice-2026-02.pdf", kind: "file" },
  { name: "report.pdf", path: "/Users/phil/Documents/report.pdf", kind: "file" },
  { name: "scratch.txt", path: "/Users/phil/Documents/scratch.txt", kind: "file" },
  { name: "meeting-notes.md", path: "/Users/phil/Documents/meeting-notes.md", kind: "file" },
  { name: "project-proposal.md", path: "/Users/phil/Documents/project-proposal.md", kind: "file" },
  { name: "bench_walk.rs", path: "/Users/phil/Projects/snappy/src-tauri/examples/bench_walk.rs", kind: "file" },
  { name: "bench_search.rs", path: "/Users/phil/Projects/snappy/src-tauri/examples/bench_search.rs", kind: "file" },
  { name: "test_engine.rs", path: "/Users/phil/Projects/snappy/src-tauri/src/search/test_engine.rs", kind: "file" },

  // Hidden
  { name: ".zshrc", path: "/Users/phil/.zshrc", kind: "file", hidden: true },
  { name: ".gitignore", path: "/Users/phil/Projects/snappy/.gitignore", kind: "file", hidden: true },
  { name: ".config", path: "/Users/phil/.config", kind: "directory", hidden: true },
];

// ----- State ---------------------------------------------------------------
const state = {
  query: "",
  selected: 0,
  fuzzy: true,
  appsOnly: false,
  prefsOnly: false,
  hidden: false,
  grouping: false,
  results: [],
};

// ----- Elements ------------------------------------------------------------
const $input = document.getElementById("appInput");
const $list = document.getElementById("rlList");
const $fuzzyBtn = document.getElementById("fuzzyBtn");
const $toggles = document.querySelectorAll(".tg-pill");
const $slots = document.querySelectorAll(".ql-slot");
const $mod = document.querySelector(".ql-mod");
const $group = document.querySelector(".so-group");
const $dir = document.querySelector(".so-dir");
const $hintDir = document.querySelector(".hn-dir");

// ----- Query parsing -------------------------------------------------------
function parseQuery(q) {
  const atoms = q.split(/\s+/).filter(Boolean);
  return atoms.map((a) => {
    if (a.startsWith("!") && a.length > 1) return { kind: "exclude", text: a.slice(1) };
    if (a.startsWith("'") && a.length > 1) return { kind: "exact", text: a.slice(1) };
    if (a.startsWith("^") && a.length > 1) return { kind: "prefix", text: a.slice(1) };
    if (a.endsWith("$") && a.length > 1) return { kind: "suffix", text: a.slice(0, -1) };
    return { kind: "fuzzy", text: a };
  });
}

// Smart case: case-insensitive unless the atom contains any uppercase
function matchAtom(atom, name, fuzzy) {
  const caseSensitive = /[A-Z]/.test(atom.text);
  const n = caseSensitive ? name : name.toLowerCase();
  const t = caseSensitive ? atom.text : atom.text.toLowerCase();
  switch (atom.kind) {
    case "prefix": return n.startsWith(t);
    case "suffix": return n.endsWith(t);
    case "exact": return n.includes(t);
    case "exclude": return !n.includes(t);
    case "fuzzy":
    default: {
      if (!fuzzy) return n.includes(t);
      // Simple subsequence match for fuzzy (close enough for demo)
      let i = 0;
      for (const ch of n) {
        if (ch === t[i]) i++;
        if (i === t.length) return true;
      }
      return i === t.length;
    }
  }
}

// Rank: lower is better. Tier-inspired: exact > prefix > wb > fuzzy.
function rank(item, query) {
  const n = /[A-Z]/.test(query) ? item.name : item.name.toLowerCase();
  const q = /[A-Z]/.test(query) ? query : query.toLowerCase();
  let tier = 4;
  if (n === q) tier = 0;
  else if (n.startsWith(q)) tier = 1;
  else if (new RegExp(`\\b${escapeRe(q)}`, "i").test(item.name)) tier = 2;
  else if (n.includes(q)) tier = 3;
  const noisy = item.noisy ? 100 : 0;
  const depth = item.path.split("/").length;
  return tier * 1000 + noisy + depth;
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

// ----- Search --------------------------------------------------------------
function search() {
  const q = state.query.trim();
  let pool = MOCK.slice();

  // Kind filters
  if (state.appsOnly && !state.prefsOnly) pool = pool.filter((m) => m.kind === "application");
  else if (state.prefsOnly && !state.appsOnly) pool = pool.filter((m) => m.kind === "prefPane");
  else if (state.appsOnly && state.prefsOnly) pool = pool.filter((m) => m.kind === "application" || m.kind === "prefPane");
  if (!state.hidden) pool = pool.filter((m) => !m.hidden);

  if (q.length === 0) {
    state.results = [];
    render();
    return;
  }

  const atoms = parseQuery(q);
  let filtered = pool.filter((item) => atoms.every((a) => matchAtom(a, item.name, state.fuzzy)));

  // Rank using the last non-exclude atom for tier signal, fallback to full query
  const lead = atoms.filter((a) => a.kind !== "exclude").pop();
  const leadText = lead ? lead.text : q;
  filtered.sort((a, b) => rank(a, leadText) - rank(b, leadText));

  if (state.grouping) {
    filtered.sort((a, b) => {
      if (a.kind === "directory" && b.kind !== "directory") return -1;
      if (a.kind !== "directory" && b.kind === "directory") return 1;
      return 0;
    });
  }

  state.results = filtered.slice(0, 50);
  state.selected = Math.min(state.selected, Math.max(0, state.results.length - 1));
  render();
}

// ----- Render --------------------------------------------------------------
function highlightName(name, query) {
  if (!query) return escapeHtml(name);
  const q = query.trim();
  if (!q) return escapeHtml(name);
  // Prefer the longest literal atom to highlight — skip operator atoms
  const atoms = parseQuery(q).filter((a) => a.kind !== "exclude").map((a) => a.text);
  if (atoms.length === 0) return escapeHtml(name);
  const longest = atoms.sort((a, b) => b.length - a.length)[0];
  const caseSensitive = /[A-Z]/.test(longest);
  const re = new RegExp(`(${escapeRe(longest)})`, caseSensitive ? "" : "i");
  return escapeHtml(name).replace(re, "<mark>$1</mark>");
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const APP_ICON_MAP = {
  finder: "icons/finder.png",
  terminal: "icons/terminal.png",
  safari: "icons/safari.png",
  code: "icons/code.png",
  notes: "icons/notes.png",
  music: "icons/music.png",
  photos: "icons/photos.png",
  mail: "icons/mail.png",
  calendar: "icons/calendar.png",
  snappy: "icons/snappy.png",
};

function iconFor(item) {
  if (item.kind === "application") {
    if (item.app && APP_ICON_MAP[item.app]) {
      return `<div class="rl-icon rl-icon-img"><img src="${APP_ICON_MAP[item.app]}" alt="" draggable="false" /></div>`;
    }
    return `<div class="rl-icon is-app" data-app="${item.app || ""}"><span>${appLetter(item)}</span></div>`;
  }
  if (item.kind === "prefPane") {
    return `<div class="rl-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="12" cy="12" r="3"/></svg></div>`;
  }
  if (item.kind === "directory") {
    return `<div class="rl-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/></svg></div>`;
  }
  return `<div class="rl-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z"/><path d="M14 3v5h5"/></svg></div>`;
}

function appLetter(item) {
  return (item.name[0] || "A").toUpperCase();
}

function render() {
  if (state.results.length === 0) {
    const q = state.query.trim();
    const msg =
      q.length === 0
        ? "Start typing to search"
        : q.length === 1
          ? "Keep typing…"
          : "No matches";
    $list.innerHTML = `<div class="rl-empty">${msg}</div>`;
    updateHints(null);
    return;
  }

  const rows = state.results
    .map((r, i) => {
      const sub = r.bundle && (r.kind === "application" || r.kind === "prefPane") ? r.bundle : r.path;
      return `
        <div class="rl-row ${i === state.selected ? "is-selected" : ""}" data-idx="${i}" role="option" aria-selected="${i === state.selected}">
          ${iconFor(r)}
          <div class="rl-text">
            <div class="rl-name">${highlightName(r.name, state.query)}</div>
            <div class="rl-subtitle">${escapeHtml(sub)}</div>
          </div>
        </div>
      `;
    })
    .join("");
  $list.innerHTML = rows;
  updateHints(state.results[state.selected]);
  scrollSelectedIntoView();
}

function updateHints(current) {
  if ($hintDir) $hintDir.hidden = !(current && current.kind === "directory");
}

function scrollSelectedIntoView() {
  const el = $list.querySelector(".rl-row.is-selected");
  if (!el) return;
  const top = el.offsetTop;
  const bot = top + el.offsetHeight;
  if (top < $list.scrollTop) $list.scrollTop = top;
  else if (bot > $list.scrollTop + $list.clientHeight) $list.scrollTop = bot - $list.clientHeight;
}

// ----- Events --------------------------------------------------------------
$input.addEventListener("input", (e) => {
  state.query = e.target.value;
  state.selected = 0;
  search();
});

// Key events on the input — don't swallow typing keys
$input.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown") {
    e.preventDefault();
    if (state.results.length) {
      state.selected = Math.min(state.selected + 1, state.results.length - 1);
      render();
    }
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    if (state.results.length) {
      state.selected = Math.max(state.selected - 1, 0);
      render();
    }
  } else if (e.key === "Enter") {
    e.preventDefault();
    openSelected();
  } else if (e.key === "Escape") {
    e.preventDefault();
    $input.value = "";
    state.query = "";
    state.selected = 0;
    search();
  }
});

$list.addEventListener("click", (e) => {
  const row = e.target.closest(".rl-row");
  if (!row) return;
  state.selected = Number(row.dataset.idx);
  render();
  openSelected();
});

function openSelected() {
  const r = state.results[state.selected];
  if (!r) return;
  const row = $list.querySelector(".rl-row.is-selected");
  if (row) row.classList.add("is-opening");
  setTimeout(() => {
    // Real app clears the query and hides the window after launching.
    // In the embedded demo we just clear the query (the window can't hide).
    $input.value = "";
    state.query = "";
    state.selected = 0;
    search();
  }, 280);
}

// Toggles
$toggles.forEach((btn) => {
  btn.addEventListener("click", () => {
    const key = btn.dataset.toggle;
    if (key === "apps") state.appsOnly = !state.appsOnly;
    if (key === "prefs") state.prefsOnly = !state.prefsOnly;
    if (key === "hidden") state.hidden = !state.hidden;
    btn.classList.toggle("is-active");
    // keep focus in the input for keyboard flow
    $input.focus();
    state.selected = 0;
    search();
  });
});

// Fuzzy toggle
$fuzzyBtn.addEventListener("click", () => {
  state.fuzzy = !state.fuzzy;
  $fuzzyBtn.classList.toggle("is-active", state.fuzzy);
  $fuzzyBtn.setAttribute("aria-pressed", state.fuzzy ? "true" : "false");
  $input.focus();
  search();
});

// Group folders
$group?.addEventListener("click", () => {
  state.grouping = !state.grouping;
  $group.classList.toggle("is-active", state.grouping);
  search();
});

// Sort direction (visual only)
$dir?.addEventListener("click", () => {
  $dir.classList.toggle("is-asc");
});

// Modifier cycle (visual only)
const MODIFIERS = ["⌥", "⌘", "⌃"];
let modIdx = 0;
$mod?.addEventListener("click", () => {
  modIdx = (modIdx + 1) % MODIFIERS.length;
  $mod.textContent = MODIFIERS[modIdx];
});

// Quick-launch slots — populate icons and animate on click
const SLOT_APPS = {
  0: { app: "finder", name: "Finder", icon: "icons/finder.png" },
  1: { app: "terminal", name: "Terminal", icon: "icons/terminal.png" },
  2: { app: "safari", name: "Safari", icon: "icons/safari.png" },
  3: { app: "code", name: "VS Code", icon: "icons/code.png" },
  4: { app: "notes", name: "Notes", icon: "icons/notes.png" },
};
$slots.forEach((slot) => {
  const slotIdx = Number(slot.dataset.slot);
  const mapped = SLOT_APPS[slotIdx];
  if (mapped) {
    slot.innerHTML = `<img class="app-icon" src="${mapped.icon}" alt="${mapped.name}" draggable="false" />`;
    slot.title = `${mapped.name} · ${MODIFIERS[modIdx]}${slotIdx === 9 ? 0 : slotIdx + 1}`;
  } else {
    slot.title = `Empty slot · ${MODIFIERS[modIdx]}${slotIdx === 9 ? 0 : slotIdx + 1}`;
  }
  slot.addEventListener("click", () => {
    slot.classList.add("is-active");
    setTimeout(() => slot.classList.remove("is-active"), 400);
    // Real app: click opens slot picker (for assign/reassign). Here we
    // just flash as a demo affordance — no search surfacing.
  });
});

// Initial render
render();

// Smooth anchor scrolling (kept from before)
document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener("click", (e) => {
    const id = a.getAttribute("href").slice(1);
    if (!id) return;
    const target = document.getElementById(id);
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  });
});
