/* ============================================================================
   ctrlFACK — content script
   ----------------------------------------------------------------------------
   v0.7. Live-page find with:
   • match navigation + counter (Enter / Shift+Enter, ‹ ›, "n / total")
   • whole-page text index → matches can span element boundaries
     (qu<b>ick</b> brown), but never cross a block/paragraph boundary
   • painted via the CSS Custom Highlight API when available (zero DOM
     mutation — fast and framework-safe); falls back to cross-node
     <mark> wrapping on older browsers
   • opened by a content-script hotkey — Ctrl/Cmd+Shift+F (Esc / ✕ to close)
   Search powers:
   • Aa match-case and W whole-word toggles
   • multi-term OR: comma-separated terms, each highlighted in its own colour
   • ~ fuzzy (typo-tolerant, edit-distance word matching)
   • scope: All / Selection / Links / Headings / Code
   • scrollbar match markers (canvas gutter, click a tick to jump)
   • extract emails / phones / URLs, and a ⧉ copy button (values, or matched
     lines for a normal find) + a small persistent search history
   plus the advanced modes: Word Distance, RegExp, Word Size.
   ========================================================================== */

(function () {
"use strict";

if (window.__ctrlfackInjected) return;      // guard against double injection
window.__ctrlfackInjected = true;

var MARK_CLASS   = "ctrlfack-mark";
var ACTIVE_CLASS = "ctrlfack-mark-active";
var MATCH_CAP    = 5000;                     // safety limit on huge pages
var TERM_COLORS  = 6;                        // number of multi-term colours

var SCOPE_ORDER     = ["all", "selection", "links", "headings", "code"];
var SCOPE_LABELS    = { all: "All", selection: "Selection", links: "Links", headings: "Headings", code: "Code" };
var SCOPE_SELECTORS = { links: "a", headings: "h1,h2,h3,h4,h5,h6", code: "code,pre,kbd,samp" };

/* ------------------------------------------------------------------ state */
var matches = [];        // match objects { start, end, ti, text, range | marks }, in document order
var activeIndex = -1;
var lastQuery = null;    // last "Find:" query, to tell "new search" from "next"
var uiOpen = false;
var wordSuggestions = [];

// search-power state
var caseSensitive = false;
var wholeWord = false;
var fuzzy = false;
var stemming = false;
var scope = "all";
var savedSelection = null;   // { range, root } captured when the UI opens
var currentTermsList = [];   // normalised terms of the active find (for colours)

// navigation / productivity state
var markerFracs = [];        // 0..1 doc-height fraction per match (scrollbar ticks)
var lastExtractKind = null;  // "email" | "phone" | "url" while extracting values
var searchHistory = [];      // recent Find queries (most recent first)
var HISTORY_KEY = "ctrlfack_history";
var PINS_KEY = "ctrlfack_pins";
var pinsMap = {};            // { origin: [query, ...] } cached from storage
var sitePins = [];           // pins for this page's origin
var panelOpen = false;       // results panel visibility

/* ============================================================ UI ELEMENTS */

function el(tag, id, cls) {
	var e = document.createElement(tag);
	if (id) e.id = id;
	if (cls) e.className = cls;
	document.documentElement.appendChild(e);
	return e;
}

// primary search input
var input = el("INPUT", "inputSearch");
input.setAttribute("autocomplete", "off");
input.setAttribute("placeholder", "Find:");

var groove = el("DIV", "groove");

// Advanced button + its underline
var advancedButton = el("BUTTON", "advancedButton", "optionBtns");
advancedButton.textContent = "Advanced";
var grAdvBtn = el("DIV", "grooveAdvBtn", "groove");

// Word-distance
var wordDistBtn = el("BUTTON", "wordDistBtn", "optionBtns");
wordDistBtn.textContent = "Word Distance";
var grWordDist = el("DIV", "grWordDist", "groove");
var wordDistInput = el("INPUT", "inputSearch2");
wordDistInput.setAttribute("autocomplete", "off");
wordDistInput.setAttribute("placeholder", "…and:");
var groove2 = el("DIV", "groove2");

// RegExp
var regexBtn = el("BUTTON", "regexBtn", "optionBtns");
regexBtn.textContent = "RegExp";
var grRegex = el("DIV", "grRegex", "groove");

// Other → Word Size / Find Email
var otherBtn = el("BUTTON", "otherBtn", "optionBtns");
otherBtn.textContent = "Other";
var grOther = el("DIV", "grOther", "groove");
var other1 = el("BUTTON", "other1", "optionBtns");
other1.textContent = "Word Size";
var other2 = el("BUTTON", "other2", "optionBtns");
other2.textContent = "Extract Emails";
var other3 = el("BUTTON", "other3", "optionBtns");
other3.textContent = "Extract Phones";
var other4 = el("BUTTON", "other4", "optionBtns");
other4.textContent = "Extract URLs";
var otherExtras = [other1, other2, other3, other4];

// options pill: [Aa] [W] [~] [scope]
var optsBox = el("DIV", "ctrlfackOpts");
function optBtn(label, title) {
	var b = document.createElement("BUTTON");
	b.textContent = label;
	b.title = title;
	b.className = "ctrlfack-opt";
	optsBox.appendChild(b);
	return b;
}
var caseBtn  = optBtn("Aa", "Match case");
var wordBtn  = optBtn("W", "Whole word");
var fuzzyBtn = optBtn("~", "Fuzzy — tolerate typos");
var stemBtn  = optBtn("S", "Stem — match word forms (run → running)");
var scopeBtn = optBtn("All", "Search scope — click to cycle");
scopeBtn.classList.add("ctrlfack-scope");

// navigation pill: ‹  n / total  ›
var navBox = el("DIV", "ctrlfackNav");
var prevBtn = document.createElement("BUTTON");
prevBtn.textContent = "‹";
prevBtn.title = "Previous (Shift+Enter)";
var counterEl = document.createElement("SPAN");
counterEl.id = "ctrlfackCounter";
counterEl.textContent = "0 / 0";
var nextBtn = document.createElement("BUTTON");
nextBtn.textContent = "›";
nextBtn.title = "Next (Enter)";
var copyBtn = document.createElement("BUTTON");
copyBtn.textContent = "⧉";
copyBtn.title = "Copy matches";
copyBtn.className = "ctrlfack-copy";
var pinBtn = document.createElement("BUTTON");
pinBtn.textContent = "📌";
pinBtn.title = "Pin this search for this site";
pinBtn.className = "ctrlfack-pin";
var panelBtn = document.createElement("BUTTON");
panelBtn.textContent = "≡";
panelBtn.title = "Results panel";
navBox.appendChild(prevBtn);
navBox.appendChild(counterEl);
navBox.appendChild(nextBtn);
navBox.appendChild(copyBtn);
navBox.appendChild(pinBtn);
navBox.appendChild(panelBtn);

// scrollbar match markers (canvas gutter on the right edge)
var markersCanvas = el("CANVAS", "ctrlfackMarkers");
markersCanvas.__ctx = markersCanvas.getContext("2d");

// results panel: matched lines with context, stats chips, export buttons
var panelBox = el("DIV", "ctrlfackPanel");
var panelHead = document.createElement("DIV");
panelHead.id = "ctrlfackPanelHead";
var panelTitle = document.createElement("SPAN");
panelTitle.id = "ctrlfackPanelTitle";
panelTitle.textContent = "Results";
var exportJsonBtn = document.createElement("BUTTON");
exportJsonBtn.textContent = "JSON";
exportJsonBtn.title = "Export matches as JSON";
var exportCsvBtn = document.createElement("BUTTON");
exportCsvBtn.textContent = "CSV";
exportCsvBtn.title = "Export matches as CSV";
var exportMdBtn = document.createElement("BUTTON");
exportMdBtn.textContent = "MD";
exportMdBtn.title = "Export matches as Markdown";
var panelCloseBtn = document.createElement("BUTTON");
panelCloseBtn.textContent = "✕";
panelHead.appendChild(panelTitle);
panelHead.appendChild(exportJsonBtn);
panelHead.appendChild(exportCsvBtn);
panelHead.appendChild(exportMdBtn);
panelHead.appendChild(panelCloseBtn);
var panelStats = document.createElement("DIV");
panelStats.id = "ctrlfackPanelStats";
var panelList = document.createElement("DIV");
panelList.id = "ctrlfackPanelList";
panelBox.appendChild(panelHead);
panelBox.appendChild(panelStats);
panelBox.appendChild(panelList);

// "no results" chip
var noResultsBox = el("DIV", "noResultsBox");
noResultsBox.textContent = "No matches";

// always-visible close button (so you never need to remember the shortcut)
var closeBtn = el("BUTTON", "ctrlfackClose");
closeBtn.textContent = "✕";
closeBtn.title = "Close (Esc)";
closeBtn.onclick = function () { closeUI(); };

/* ===================================================== HIGHLIGHT ENGINE */

function escapeRegExp(s) {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseRegexInput(str) {
	var m = str.match(/^\/(.*)\/([a-z]*)$/i);
	var pattern = m ? m[1] : str;
	var flags = m ? m[2] : "";
	if (flags.indexOf("g") === -1) flags += "g";
	return new RegExp(pattern, flags);      // may throw on bad regex — caller guards
}

// comma splits into OR-terms; without a comma the whole string is one term
function currentTerms(query) {
	if (!query) return [];
	if (query.indexOf(",") !== -1)
		return query.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
	query = query.trim();
	return query ? [query] : [];
}

function buildFindRegex(terms) {
	var parts = terms.map(function (t) {
		// spaces in the query match any run of rendered whitespace — except the
		// \n block separators the index inserts, so a phrase can span inline
		// elements but never cross a paragraph/block boundary
		var p = t.split(/\s+/).filter(Boolean).map(escapeRegExp).join("[^\\S\\n]+");
		return wholeWord ? "\\b" + p + "\\b" : p;
	});
	return new RegExp("(" + parts.join("|") + ")", "g" + (caseSensitive ? "" : "i"));
}

function levenshtein(a, b) {
	var m = a.length, n = b.length;
	if (!m) return n;
	if (!n) return m;
	var prev = new Array(n + 1), curr = new Array(n + 1), i, j;
	for (j = 0; j <= n; j++) prev[j] = j;
	for (i = 1; i <= m; i++) {
		curr[0] = i;
		for (j = 1; j <= n; j++) {
			var cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
			curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
		}
		var t = prev; prev = curr; curr = t;
	}
	return prev[n];
}

// A "finder" maps a text string → array of [start, end, termIndex] ranges.
function makeRegexFinder(re, normTerms) {
	return function (text) {
		re.lastIndex = 0;
		var out = [], m;
		while ((m = re.exec(text)) !== null) {
			if (m[0] === "") { re.lastIndex++; continue; }
			var ti = 0;
			if (normTerms) {
				var key = m[0].replace(/\s+/g, " ");      // collapse spanned whitespace
				if (!caseSensitive) key = key.toLowerCase();
				ti = normTerms.indexOf(key); if (ti < 0) ti = 0;
			}
			out.push([m.index, m.index + m[0].length, ti]);
			if (!re.global) break;
			if (out.length + matches.length >= MATCH_CAP) break;
		}
		return out;
	};
}

function makeFuzzyFinder(normTerms) {
	var thr = normTerms.map(function (t) { return t.length <= 4 ? 1 : 2; });
	return function (text) {
		var out = [], re = /[A-Za-z0-9]+/g, m;
		while ((m = re.exec(text)) !== null) {
			var w = m[0], wl = caseSensitive ? w : w.toLowerCase();
			var bestTi = -1, bestD = Infinity;
			for (var k = 0; k < normTerms.length; k++) {
				if (Math.abs(w.length - normTerms[k].length) > thr[k]) continue;
				var d = levenshtein(wl, normTerms[k]);
				if (d <= thr[k] && d < bestD) { bestD = d; bestTi = k; }
			}
			if (bestTi >= 0) {
				out.push([m.index, m.index + w.length, bestTi]);
				if (out.length + matches.length >= MATCH_CAP) break;
			}
		}
		return out;
	};
}

/* ---- diacritic folding: cafe finds café (and vice versa) ---- */
function foldStr(s) {
	return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// Folded twin of the index text + per-char offset map back to the original.
// Pure-ASCII pages take the free identity path (map = null).
function ensureFolded() {
	if (pageIndex.folded) return;
	var t = pageIndex.text;
	if (!/[^\x00-\x7f]/.test(t)) { pageIndex.folded = { text: t, map: null }; return; }
	var out = [], map = [];
	for (var i = 0; i < t.length; i++) {
		var c = t[i], f = c.charCodeAt(0) > 127 ? foldStr(c) : c;
		for (var k = 0; k < f.length; k++) { out.push(f[k]); map.push(i); }
	}
	pageIndex.folded = { text: out.join(""), map: map };
}

// folded-offset finder output → original-text offsets
function mapFolded(ranges) {
	var map = pageIndex.folded.map;
	if (!map || !ranges.length) return ranges;
	return ranges.map(function (r) { return [map[r[0]], map[r[1] - 1] + 1, r[2]]; });
}

/* ---- Porter stemmer: "run" matches running / runs ---- */
function porterStem(w) {
	if (w.length < 3) return w;
	var step2list = { ational: "ate", tional: "tion", enci: "ence", anci: "ance", izer: "ize",
		bli: "ble", alli: "al", entli: "ent", eli: "e", ousli: "ous", ization: "ize",
		ation: "ate", ator: "ate", alism: "al", iveness: "ive", fulness: "ful",
		ousness: "ous", aliti: "al", iviti: "ive", biliti: "ble", logi: "log" };
	var step3list = { icate: "ic", ative: "", alize: "al", iciti: "ic", ical: "ic", ful: "", ness: "" };
	var c = "[^aeiou]", v = "[aeiouy]", C = c + "[^aeiouy]*", V = v + "[aeiou]*";
	var mgr0 = "^(" + C + ")?" + V + C,
	    meq1 = "^(" + C + ")?" + V + C + "(" + V + ")?$",
	    mgr1 = "^(" + C + ")?" + V + C + V + C,
	    s_v  = "^(" + C + ")?" + v;
	var firstch = w.charAt(0);
	if (firstch === "y") w = "Y" + w.slice(1);
	var re = /^(.+?)(ss|i)es$/, re2 = /^(.+?)([^s])s$/, fp;
	if (re.test(w)) w = w.replace(re, "$1$2");
	else if (re2.test(w)) w = w.replace(re2, "$1$2");
	re = /^(.+?)eed$/; re2 = /^(.+?)(ed|ing)$/;
	if (re.test(w)) {
		fp = re.exec(w);
		if (new RegExp(mgr0).test(fp[1])) w = w.slice(0, -1);
	} else if (re2.test(w)) {
		fp = re2.exec(w);
		if (new RegExp(s_v).test(fp[1])) {
			w = fp[1];
			if (/(at|bl|iz)$/.test(w)) w += "e";
			else if (/([^aeiouylsz])\1$/.test(w)) w = w.slice(0, -1);
			else if (new RegExp("^" + C + v + "[^aeiouwxy]$").test(w)) w += "e";
		}
	}
	re = /^(.+?)y$/;
	if (re.test(w)) { fp = re.exec(w); if (new RegExp(s_v).test(fp[1])) w = fp[1] + "i"; }
	re = /^(.+?)(ational|tional|enci|anci|izer|bli|alli|entli|eli|ousli|ization|ation|ator|alism|iveness|fulness|ousness|aliti|iviti|biliti|logi)$/;
	if (re.test(w)) { fp = re.exec(w); if (new RegExp(mgr0).test(fp[1])) w = fp[1] + step2list[fp[2]]; }
	re = /^(.+?)(icate|ative|alize|iciti|ical|ful|ness)$/;
	if (re.test(w)) { fp = re.exec(w); if (new RegExp(mgr0).test(fp[1])) w = fp[1] + step3list[fp[2]]; }
	re = /^(.+?)(al|ance|ence|er|ic|able|ible|ant|ement|ment|ent|ou|ism|ate|iti|ous|ive|ize)$/;
	re2 = /^(.+?)(s|t)(ion)$/;
	if (re.test(w)) { fp = re.exec(w); if (new RegExp(mgr1).test(fp[1])) w = fp[1]; }
	else if (re2.test(w)) { fp = re2.exec(w); if (new RegExp(mgr1).test(fp[1] + fp[2])) w = fp[1] + fp[2]; }
	re = /^(.+?)e$/;
	if (re.test(w)) {
		fp = re.exec(w);
		if (new RegExp(mgr1).test(fp[1]) ||
		    (new RegExp(meq1).test(fp[1]) && !new RegExp("^" + C + v + "[^aeiouwxy]$").test(fp[1])))
			w = fp[1];
	}
	if (/ll$/.test(w) && new RegExp(mgr1).test(w)) w = w.slice(0, -1);
	if (firstch === "y") w = "y" + w.slice(1);
	return w;
}

function makeStemFinder(normTerms) {
	var stems = normTerms.map(function (t) { return porterStem(t.toLowerCase()); });
	return function (text) {
		var out = [], re = /[A-Za-z0-9]+/g, m;
		while ((m = re.exec(text)) !== null) {
			var ti = stems.indexOf(porterStem(m[0].toLowerCase()));
			if (ti >= 0) {
				out.push([m.index, m.index + m[0].length, ti]);
				if (out.length >= MATCH_CAP) break;
			}
		}
		return out;
	};
}

/* ---- extract patterns ---- */
var EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
var URL_RE   = /(?:https?:\/\/|www\.)[^\s<>"')\]]+/gi;

// phone: candidate runs of phone-ish chars, kept only if they hold 7–15 digits
function makePhoneFinder() {
	var cand = /\+?\d[\d().\- ]{5,}\d/g;   // no \s — must not leak across \n block separators
	return function (text) {
		var out = [], m;
		while ((m = cand.exec(text)) !== null) {
			var digits = (m[0].match(/\d/g) || []).length;
			if (digits >= 7 && digits <= 15) {
				out.push([m.index, m.index + m[0].length, 0]);
				if (out.length + matches.length >= MATCH_CAP) break;
			}
		}
		return out;
	};
}

/* ------------- text index: whole-page string ↔ DOM offset map -------------
   All in-scope text is concatenated into one string so matches can span
   element boundaries (qu<b>ick</b> brown). segments[] maps index offsets back
   to text nodes. "\n" separators between blocks stop phrases crossing
   paragraph boundaries. */

var BLOCK_SEL = "p,li,td,th,h1,h2,h3,h4,h5,h6,pre,blockquote,dd,dt,figcaption,caption," +
                "section,article,div,ul,ol,table,tr,header,footer,nav,aside,form,fieldset";

var pageIndex = null;    // { text, segments: [{ node, start, end }] }

// Backend pick: CSS Custom Highlight API when available (paints without any
// DOM mutation — fast, and safe on framework-managed pages); otherwise fall
// back to wrapping <mark>s. __ctrlfackForceMarks is a test hook.
var useHL = typeof Highlight !== "undefined" &&
            typeof CSS !== "undefined" && !!CSS.highlights &&
            !window.__ctrlfackForceMarks;

// Does `range` overlap `node`? (MDN's Range.intersectsNode formula.)
// Stale ranges (after earlier DOM edits) throw → treat as "inside" so the
// cheaper root.contains() gate decides.
function rangeIntersectsNode(range, node) {
	try {
		var nr = node.ownerDocument.createRange();
		try { nr.selectNode(node); } catch (e) { nr.selectNodeContents(node); }
		return range.compareBoundaryPoints(Range.END_TO_START, nr) < 1 &&
		       range.compareBoundaryPoints(Range.START_TO_END, nr) > -1;
	} catch (e) { return true; }
}

function buildIndex() {
	pageIndex = null;
	if (!document.body) return;
	var scopeSel = SCOPE_SELECTORS[scope];

	var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
		acceptNode: function (node) {
			var p = node.parentNode;
			if (!p || p.nodeType !== 1) return NodeFilter.FILTER_REJECT;
			if (p.closest("script,style,noscript,textarea,.autocomplete,mark." + MARK_CLASS))
				return NodeFilter.FILTER_REJECT;
			if (scopeSel && !p.closest(scopeSel)) return NodeFilter.FILTER_REJECT;
			if (scope === "selection") {
				if (!savedSelection || !savedSelection.root || !savedSelection.root.contains(node))
					return NodeFilter.FILTER_REJECT;
				if (!rangeIntersectsNode(savedSelection.range, node)) return NodeFilter.FILTER_REJECT;
			}
			return NodeFilter.FILTER_ACCEPT;
		}
	});

	var parts = [], segments = [], pos = 0, lastBlock = null, node;
	var blocks = [], blockStart = 0;     // block spans, for boolean queries
	var parentInfo = new Map();          // parent element → { block, pre } cache
	while ((node = walker.nextNode())) {
		var parent = node.parentElement;
		var info = parentInfo.get(parent);
		if (!info) {
			info = { block: parent.closest(BLOCK_SEL) || document.body,
			         pre: !!parent.closest("pre") };
			parentInfo.set(parent, info);
		}
		if (segments.length && info.block !== lastBlock) {
			blocks.push([blockStart, pos]);
			parts.push("\n"); pos++;
			blockStart = pos;
		}
		lastBlock = info.block;

		var t = node.nodeValue;
		// outside <pre>, source newlines/tabs render as plain spacing — fold
		// them to spaces 1:1 so offsets still map straight back into the node
		if (!info.pre) t = t.replace(/[\n\r\t]/g, " ");
		segments.push({ node: node, start: pos, end: pos + t.length });
		parts.push(t);
		pos += t.length;
	}
	blocks.push([blockStart, pos]);
	pageIndex = { text: parts.join(""), segments: segments, blocks: blocks };
}

// raw finder output [start, end, termIdx] → match objects mapped onto segments
function buildMatches(raw) {
	var segs = pageIndex.segments;
	if (!segs.length || !raw || !raw.length) return;
	raw.sort(function (a, b) { return a[0] - b[0]; });
	var si = 0, cursor = -1;
	for (var i = 0; i < raw.length && matches.length < MATCH_CAP; i++) {
		var s = raw[i][0], e = raw[i][1], ti = raw[i][2] || 0;
		if (s < cursor || e <= s) continue;                    // overlap / empty
		while (si < segs.length && segs[si].end <= s) si++;
		if (si >= segs.length) break;
		var sSeg = si;
		if (s < segs[sSeg].start) s = segs[sSeg].start;        // began in a separator
		var eSeg = sSeg;
		while (eSeg < segs.length - 1 && segs[eSeg].end < e) eSeg++;
		if (e <= segs[eSeg].start) eSeg--;                     // ended in a separator
		if (eSeg < sSeg) continue;
		var e2 = Math.min(e, segs[eSeg].end);
		if (e2 <= s) continue;
		matches.push({ start: s, end: e2, ti: ti, sSeg: sSeg, eSeg: eSeg,
		               text: pageIndex.text.slice(s, e2) });
		cursor = e2;
	}
}

function makeRange(m) {
	var a = pageIndex.segments[m.sSeg], b = pageIndex.segments[m.eSeg];
	var r = document.createRange();
	r.setStart(a.node, m.start - a.start);
	r.setEnd(b.node, m.end - b.start);
	return r;
}

/* ---- backend A: CSS Custom Highlight API ---- */
var HL_NAMES = ["ctrlfack-t0", "ctrlfack-t1", "ctrlfack-t2",
                "ctrlfack-t3", "ctrlfack-t4", "ctrlfack-t5"];
var termHls = null, activeHl = null;

function hlEnsure() {
	if (termHls) return;
	termHls = HL_NAMES.map(function (name) {
		var h = new Highlight();
		try { h.priority = 1; } catch (e) {}
		CSS.highlights.set(name, h);
		return h;
	});
	activeHl = new Highlight();
	try { activeHl.priority = 2; } catch (e) {}   // active always wins over term colour
	CSS.highlights.set("ctrlfack-active", activeHl);
}

function hlApply() {
	hlEnsure();
	for (var i = 0; i < matches.length; i++) {
		var m = matches[i];
		m.range = makeRange(m);
		termHls[m.ti % TERM_COLORS].add(m.range);
	}
}

/* ---- backend B: <mark> wrapping fallback (cross-node capable) ---- */
function markApply() {
	var segs = pageIndex.segments;
	var perSeg = [];                     // segment idx → [{s, e, mi}] node-local offsets
	for (var mi = 0; mi < matches.length; mi++) {
		var m = matches[mi];
		m.marks = [];
		for (var k = m.sSeg; k <= m.eSeg; k++) {
			var s = Math.max(m.start, segs[k].start) - segs[k].start;
			var e = Math.min(m.end, segs[k].end) - segs[k].start;
			if (e > s) (perSeg[k] = perSeg[k] || []).push({ s: s, e: e, mi: mi });
		}
	}
	var multi = currentTermsList.length > 1;
	for (var k2 = 0; k2 < segs.length; k2++) {
		var ops = perSeg[k2];
		if (!ops) continue;
		var node = segs[k2].node, text = node.nodeValue;
		var frag = document.createDocumentFragment(), cursor = 0;
		for (var i2 = 0; i2 < ops.length; i2++) {
			var op = ops[i2], mm = matches[op.mi];
			if (op.s > cursor) frag.appendChild(document.createTextNode(text.slice(cursor, op.s)));
			var mk = document.createElement("mark");
			mk.className = MARK_CLASS + (multi ? " ctrlfack-t" + (mm.ti % TERM_COLORS) : "");
			mk.textContent = text.slice(op.s, op.e);
			frag.appendChild(mk);
			mm.marks.push(mk);
			cursor = op.e;
		}
		if (cursor < text.length) frag.appendChild(document.createTextNode(text.slice(cursor)));
		node.parentNode.replaceChild(frag, node);
	}
}

function applyHighlights() { if (useHL) hlApply(); else markApply(); }

function clearHighlights() {
	if (useHL) {
		if (termHls) termHls.forEach(function (h) { h.clear(); });
		if (activeHl) activeHl.clear();
	} else {
		var marksEls = document.querySelectorAll("mark." + MARK_CLASS);
		var parents = new Set();
		for (var i = 0; i < marksEls.length; i++) {
			var mk = marksEls[i], p = mk.parentNode;
			if (!p) continue;
			while (mk.firstChild) p.insertBefore(mk.firstChild, mk);
			p.removeChild(mk);
			parents.add(p);
		}
		parents.forEach(function (p) { try { p.normalize(); } catch (e) {} });
	}
	matches = [];
	activeIndex = -1;
}

/* ---- backend-neutral match helpers ---- */
function setActiveMatch(oldIdx, newIdx) {
	if (useHL) {
		if (activeHl) activeHl.clear();
		if (newIdx >= 0 && matches[newIdx]) activeHl.add(matches[newIdx].range);
	} else {
		if (oldIdx >= 0 && matches[oldIdx] && matches[oldIdx].marks)
			matches[oldIdx].marks.forEach(function (mk) { mk.classList.remove(ACTIVE_CLASS); });
		if (newIdx >= 0 && matches[newIdx] && matches[newIdx].marks)
			matches[newIdx].marks.forEach(function (mk) { mk.classList.add(ACTIVE_CLASS); });
	}
}

function matchRect(m) {
	if (m.marks && m.marks.length) return m.marks[0].getBoundingClientRect();
	if (m.range) return m.range.getBoundingClientRect();
	return { top: 0, bottom: 0 };
}

function matchBlock(m) {
	var el = m.marks && m.marks.length ? m.marks[0]
	       : m.range.startContainer.nodeType === 1 ? m.range.startContainer
	       : m.range.startContainer.parentElement;
	return (el && el.closest(BLOCK_SEL)) || el || document.body;
}

function scrollToMatch(m) {
	if (m.marks && m.marks.length) {
		try { m.marks[0].scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" }); }
		catch (e) { m.marks[0].scrollIntoView(); }
		return;
	}
	// ranges can't scrollIntoView: nudge ancestor scrollports first, then
	// centre the exact match rect in the window
	var el = m.range.startContainer;
	el = el.nodeType === 1 ? el : el.parentElement;
	if (el) { try { el.scrollIntoView({ block: "nearest" }); } catch (e2) {} }
	var r = m.range.getBoundingClientRect();
	if (r && (r.top < 0 || r.bottom > window.innerHeight))
		window.scrollBy({ top: r.top - window.innerHeight / 2, behavior: "smooth" });
}

function highlightWith(finder, useFolded) {
	clearHighlights();
	if (!finder || !document.body) return 0;
	buildIndex();
	if (!pageIndex || !pageIndex.text) return 0;
	var raw;
	if (useFolded) {
		ensureFolded();
		raw = mapFolded(finder(pageIndex.folded.text));
	} else {
		raw = finder(pageIndex.text);
	}
	buildMatches(raw);
	applyHighlights();
	return matches.length;
}

// convenience wrapper for the advanced modes (no multi-term colouring)
function highlightRegex(re) {
	currentTermsList = [];
	return highlightWith(makeRegexFinder(re, null));
}

/* ===================================================== NAVIGATION / UI */

function updateCounter() {
	counterEl.textContent = matches.length
		? (Math.max(activeIndex, 0) + 1) + " / " + matches.length
		: "0 / 0";
}

function goTo(i) {
	if (!matches.length) return;
	var old = activeIndex;
	activeIndex = ((i % matches.length) + matches.length) % matches.length;
	setActiveMatch(old, activeIndex);
	scrollToMatch(matches[activeIndex]);
	drawMarkers();
	syncPanelActive();
	updateCounter();
}

function nextMatch() { goTo(activeIndex + 1); }
function prevMatch() { goTo(activeIndex - 1); }

/* ---- scrollbar match markers ---- */
function docHeight() {
	return Math.max(
		document.documentElement.scrollHeight,
		document.body ? document.body.scrollHeight : 0, 1);
}

function computeMarkerFracs() {
	markerFracs = [];
	var h = docHeight();
	for (var i = 0; i < matches.length; i++) {
		var r = matchRect(matches[i]);
		markerFracs.push((r.top + window.scrollY) / h);
	}
}

function drawMarkers() {
	var ctx = markersCanvas.__ctx;
	if (!ctx) return;
	if (!uiOpen || !matches.length) { markersCanvas.style.display = "none"; return; }
	markersCanvas.style.display = "block";

	var dpr = window.devicePixelRatio || 1;
	var cssW = markersCanvas.offsetWidth || 14, cssH = window.innerHeight;
	if (markersCanvas.width !== Math.round(cssW * dpr) || markersCanvas.height !== Math.round(cssH * dpr)) {
		markersCanvas.width = Math.round(cssW * dpr);
		markersCanvas.height = Math.round(cssH * dpr);
	}
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	ctx.clearRect(0, 0, cssW, cssH);

	// current viewport indicator
	var dh = docHeight();
	var vTop = (window.scrollY / dh) * cssH;
	var vH = Math.max((window.innerHeight / dh) * cssH, 3);
	ctx.fillStyle = "rgba(255,255,255,0.16)";
	ctx.fillRect(0, vTop, cssW, vH);

	// one tick per match; the active one stands out
	for (var i = 0; i < markerFracs.length; i++) {
		var y = markerFracs[i] * cssH;
		if (i === activeIndex) {
			ctx.fillStyle = "rgba(245,158,11,0.95)";
			ctx.fillRect(1, y - 1.5, cssW - 2, 3);
		} else {
			ctx.fillStyle = "rgba(16,185,129,0.85)";
			ctx.fillRect(2, y - 0.5, cssW - 4, 2);
		}
	}
}

var markerRedrawPending = false;
function scheduleMarkerRedraw() {
	if (markerRedrawPending) return;
	markerRedrawPending = true;
	requestAnimationFrame(function () { markerRedrawPending = false; drawMarkers(); });
}

markersCanvas.addEventListener("click", function (e) {
	if (!matches.length) return;
	var rect = markersCanvas.getBoundingClientRect();
	var frac = (e.clientY - rect.top) / rect.height;
	var best = 0, bd = Infinity;
	for (var i = 0; i < markerFracs.length; i++) {
		var d = Math.abs(markerFracs[i] - frac);
		if (d < bd) { bd = d; best = i; }
	}
	goTo(best);
});

function showNoResults() { noResultsBox.style.visibility = "visible"; }
function hideNoResults() { noResultsBox.style.visibility = "hidden"; }

// shared post-search behaviour for find / regex / word-size / extract
function afterSearch() {
	if (matches.length) {
		hideNoResults();
		navBox.style.display = "flex";
		computeMarkerFracs();
		goTo(0);
	} else {
		navBox.style.display = "none";
		showNoResults();
		drawMarkers();          // hides the gutter (no matches)
	}
	renderPanel();
	updateCounter();
}

/* ===================================================== COPY / EXTRACT / HISTORY */

function fallbackCopy(text) {
	try {
		var ta = document.createElement("textarea");
		ta.value = text;
		ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;";
		document.documentElement.appendChild(ta);
		ta.select();
		var ok = document.execCommand("copy");
		ta.remove();
		return ok;
	} catch (e) { return false; }
}

function copyText(text) {
	if (navigator.clipboard && navigator.clipboard.writeText) {
		return navigator.clipboard.writeText(text).then(
			function () { return true; },
			function () { return fallbackCopy(text); });
	}
	return Promise.resolve(fallbackCopy(text));
}

// the deduped matched strings themselves (for extract modes)
function getMatchedValues() {
	var seen = Object.create(null), out = [];
	for (var i = 0; i < matches.length; i++) {
		var v = matches[i].text.trim();
		if (v && !seen[v]) { seen[v] = 1; out.push(v); }
	}
	return out;
}

// the deduped block/line of text each match sits in (for "copy matched lines")
function getMatchedLines() {
	var seen = Object.create(null), out = [];
	for (var i = 0; i < matches.length; i++) {
		var block = matchBlock(matches[i]);
		var line = (block ? block.textContent : matches[i].text).replace(/\s+/g, " ").trim();
		if (line && !seen[line]) { seen[line] = 1; out.push(line); }
	}
	return out;
}

function doCopy() {
	if (!matches.length) return;
	var items = lastExtractKind ? getMatchedValues() : getMatchedLines();
	if (!items.length) return;
	copyText(items.join("\n")).then(function (ok) {
		copyBtn.textContent = ok ? "✓" : "✕";
		copyBtn.title = ok ? ("Copied " + items.length + " item(s)") : "Copy failed";
		setTimeout(function () { copyBtn.textContent = "⧉"; copyBtn.title = "Copy matches"; }, 1200);
	});
}

/* ---- persistent search history (chrome.storage.local; no-op if unavailable) ---- */
function storageArea() {
	try {
		if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) return chrome.storage.local;
	} catch (e) {}
	return null;
}
function loadHistory() {
	var area = storageArea();
	if (!area) return;
	try {
		area.get(HISTORY_KEY, function (res) {
			try { if (chrome.runtime && chrome.runtime.lastError) return; } catch (e) {}
			if (res && Array.isArray(res[HISTORY_KEY])) searchHistory = res[HISTORY_KEY];
		});
	} catch (e) {}
}
function recordHistory(q) {
	q = (q || "").trim();
	if (!q) return;
	var idx = searchHistory.indexOf(q);
	if (idx >= 0) searchHistory.splice(idx, 1);
	searchHistory.unshift(q);
	if (searchHistory.length > 12) searchHistory.length = 12;
	var area = storageArea();
	if (area) { try { var o = {}; o[HISTORY_KEY] = searchHistory; area.set(o); } catch (e) {} }
}
loadHistory();

/* ---- pinned searches per site: auto-highlight on every visit ---- */
function loadPins() {
	var area = storageArea();
	if (!area) return;
	try {
		area.get(PINS_KEY, function (res) {
			try { if (chrome.runtime && chrome.runtime.lastError) return; } catch (e) {}
			if (res && res[PINS_KEY] && typeof res[PINS_KEY] === "object") pinsMap = res[PINS_KEY];
			sitePins = pinsMap[location.origin] || [];
			updatePinState();
			if (sitePins.length) setTimeout(autoApplyPins, 400);
		});
	} catch (e) {}
}

function savePins() {
	if (sitePins.length) pinsMap[location.origin] = sitePins;
	else delete pinsMap[location.origin];
	var area = storageArea();
	if (area) { try { var o = {}; o[PINS_KEY] = pinsMap; area.set(o); } catch (e) {} }
}

// quiet apply: paint highlights on page load without opening the UI
function autoApplyPins() {
	if (uiOpen || !sitePins.length || !document.body) return;
	find(sitePins.length === 1 ? sitePins[0] : sitePins.join(", "),
	     { quiet: true, noHistory: true });
}

function updatePinState() {
	var q = (lastQuery || "").trim();
	pinBtn.classList.toggle("on", !!q && sitePins.indexOf(q) >= 0);
}

pinBtn.onclick = function () {
	var q = (lastQuery || input.value || "").trim();
	if (!q) return;
	var i = sitePins.indexOf(q);
	if (i >= 0) sitePins.splice(i, 1);
	else sitePins.push(q);
	savePins();
	updatePinState();
};
loadPins();

/* ---- results panel + match analytics ---- */
var PANEL_CHUNK = 150;
var panelRendered = 0;

function panelContext(m) {
	var t = pageIndex ? pageIndex.text : "";
	var pre = t.slice(Math.max(0, m.start - 60), m.start);
	var post = t.slice(m.end, m.end + 80);
	var nl = pre.lastIndexOf("\n"); if (nl >= 0) pre = pre.slice(nl + 1);
	nl = post.indexOf("\n"); if (nl >= 0) post = post.slice(0, nl);
	return { pre: pre, post: post };
}

function renderPanelStats() {
	panelStats.textContent = "";
	if (!matches.length) return;
	function chip(label, cls) {
		var s = document.createElement("SPAN");
		s.className = "ctrlfack-chip" + (cls ? " " + cls : "");
		s.textContent = label;
		panelStats.appendChild(s);
	}
	chip(matches.length + (matches.length === 1 ? " match" : " matches"));
	// per-term counts (multi-term / boolean searches)
	if (currentTermsList.length > 1) {
		var counts = {};
		matches.forEach(function (m) { counts[m.ti] = (counts[m.ti] || 0) + 1; });
		Object.keys(counts).forEach(function (ti) {
			chip((currentTermsList[ti] || ("term " + ti)) + " · " + counts[ti], "t" + (ti % TERM_COLORS));
		});
	}
	// matched-form variants (fuzzy / stemming / extract show what was caught)
	if (stemming || fuzzy || lastExtractKind) {
		var forms = {};
		matches.forEach(function (m) {
			var k = m.text.toLowerCase();
			forms[k] = (forms[k] || 0) + 1;
		});
		Object.keys(forms)
			.sort(function (a, b) { return forms[b] - forms[a]; })
			.slice(0, 6)
			.forEach(function (k) { chip(k + " ×" + forms[k]); });
	}
}

function panelRow(i) {
	var m = matches[i], ctx = panelContext(m);
	var row = document.createElement("DIV");
	row.className = "ctrlfack-row" + (i === activeIndex ? " active" : "");
	row.setAttribute("data-i", i);
	var pre = document.createElement("SPAN");
	pre.textContent = ctx.pre;
	var mid = document.createElement("SPAN");
	mid.className = "ctrlfack-row-match t" + (m.ti % TERM_COLORS);
	mid.textContent = m.text;
	var post = document.createElement("SPAN");
	post.textContent = ctx.post;
	row.appendChild(pre); row.appendChild(mid); row.appendChild(post);
	return row;
}

function renderPanelChunk() {
	var end = Math.min(matches.length, panelRendered + PANEL_CHUNK);
	var frag = document.createDocumentFragment();
	for (var i = panelRendered; i < end; i++) frag.appendChild(panelRow(i));
	panelList.appendChild(frag);
	panelRendered = end;
}

function renderPanel() {
	if (!panelOpen) return;
	panelTitle.textContent = "Results — " + matches.length;
	renderPanelStats();
	panelList.textContent = "";
	panelRendered = 0;
	renderPanelChunk();
}

function syncPanelActive() {
	if (!panelOpen || activeIndex < 0) return;
	while (activeIndex >= panelRendered && panelRendered < matches.length) renderPanelChunk();
	var prev = panelList.querySelector(".ctrlfack-row.active");
	if (prev) prev.classList.remove("active");
	var cur = panelList.querySelector('.ctrlfack-row[data-i="' + activeIndex + '"]');
	if (cur) {
		cur.classList.add("active");
		if (cur.offsetTop < panelList.scrollTop ||
		    cur.offsetTop + cur.offsetHeight > panelList.scrollTop + panelList.clientHeight)
			panelList.scrollTop = cur.offsetTop - panelList.clientHeight / 2;
	}
}

panelList.addEventListener("scroll", function () {
	if (panelRendered < matches.length &&
	    panelList.scrollTop + panelList.clientHeight > panelList.scrollHeight - 300)
		renderPanelChunk();
});

panelList.addEventListener("click", function (e) {
	var row = e.target && e.target.closest(".ctrlfack-row");
	if (row) goTo(+row.getAttribute("data-i"));
});

function setPanelOpen(open) {
	panelOpen = open;
	panelBox.style.display = open ? "flex" : "none";
	panelBtn.classList.toggle("on", open);
	if (open) renderPanel();
}
panelBtn.onclick = function () { setPanelOpen(!panelOpen); };
panelCloseBtn.onclick = function () { setPanelOpen(false); };

/* ---- export matches (JSON / CSV / Markdown) ---- */
function exportRows() {
	return matches.map(function (m, i) {
		var ctx = panelContext(m);
		return { n: i + 1, term: currentTermsList[m.ti] || "", match: m.text,
		         context: (ctx.pre + m.text + ctx.post).trim() };
	});
}

function csvEsc(s) { return '"' + String(s).replace(/"/g, '""') + '"'; }

function downloadFile(name, mime, content) {
	var blob = new Blob([content], { type: mime });
	var url = URL.createObjectURL(blob);
	var a = document.createElement("a");
	a.href = url;
	a.download = name;
	document.documentElement.appendChild(a);
	a.click();
	a.remove();
	setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
}

function doExport(fmt) {
	if (!matches.length) return;
	var rows = exportRows(), base = "ctrlfack-" + (location.hostname || "page");
	if (fmt === "json") {
		downloadFile(base + ".json", "application/json", JSON.stringify(rows, null, 2));
	} else if (fmt === "csv") {
		downloadFile(base + ".csv", "text/csv",
			"n,term,match,context\n" + rows.map(function (r) {
				return [r.n, csvEsc(r.term), csvEsc(r.match), csvEsc(r.context)].join(",");
			}).join("\n"));
	} else {
		downloadFile(base + ".md", "text/markdown",
			"| # | term | match | context |\n|---|---|---|---|\n" + rows.map(function (r) {
				return "| " + r.n + " | " + r.term + " | " +
				       r.match.replace(/\|/g, "\\|") + " | " +
				       r.context.replace(/\|/g, "\\|") + " |";
			}).join("\n"));
	}
}
exportJsonBtn.onclick = function () { doExport("json"); };
exportCsvBtn.onclick = function () { doExport("csv"); };
exportMdBtn.onclick = function () { doExport("md"); };

/* ============================================= BOOLEAN / PROXIMITY QUERIES
   Engaged when the query contains AND / OR / NOT / NEAR/n (uppercase), a
   -negated word, or a "quoted phrase". Semantics are per block (paragraph):
   AND-ed terms must share a block, -terms must be absent from it, and
   `a NEAR/5 b` keeps only occurrences within 5 words of a partner. */

function isBooleanQuery(q) {
	return /(^|\s)(AND|OR|NOT|NEAR\/\d+)(\s|$)/.test(q) || /"/.test(q) || /(^|\s)-[A-Za-z0-9"]/.test(q);
}

function parseBoolean(q) {
	var alts = [], atoms = [], nears = [], pendingNeg = false, pendingNear = -1, lastPos = -1;
	function flush() {
		if (atoms.length) alts.push({ atoms: atoms, nears: nears });
		atoms = []; nears = []; pendingNeg = false; pendingNear = -1; lastPos = -1;
	}
	var re = /"([^"]*)"|(\S+)/g, m;
	while ((m = re.exec(q)) !== null) {
		var isPhrase = m[1] !== undefined, tok = isPhrase ? m[1] : m[2];
		if (!isPhrase) {
			if (tok === "OR") { flush(); continue; }
			if (tok === "AND") continue;
			if (tok === "NOT") { pendingNeg = true; continue; }
			var nm = tok.match(/^NEAR\/(\d+)$/);
			if (nm) { pendingNear = +nm[1]; continue; }
			if (tok.charAt(0) === "-" && tok.length > 1) {
				pendingNeg = true;
				tok = tok.slice(1).replace(/^"|"$/g, "");
			}
		}
		tok = tok.trim();
		if (!tok) { pendingNeg = false; continue; }
		atoms.push({ text: tok, neg: pendingNeg });
		if (!pendingNeg) {
			if (pendingNear >= 0 && lastPos >= 0)
				nears.push({ a: lastPos, b: atoms.length - 1, n: pendingNear });
			lastPos = atoms.length - 1;
		}
		pendingNeg = false; pendingNear = -1;
	}
	flush();
	return alts;
}

function blockOfOffset(off) {
	var blocks = pageIndex.blocks, lo = 0, hi = blocks.length - 1;
	while (lo < hi) {
		var mid = (lo + hi) >> 1;
		if (blocks[mid][1] < off) lo = mid + 1; else hi = mid;
	}
	return lo;
}

// number of words separating two ranges (0 when adjacent/overlapping)
function wordsBetween(a, b) {
	var lo = Math.min(a[1], b[1]), hi = Math.max(a[0], b[0]);
	if (hi <= lo) return 0;
	return pageIndex.text.slice(lo, hi).split(/\s+/).filter(Boolean).length;
}

function booleanSearch(query, opts) {
	clearHighlights();
	currentTermsList = [];
	if (!document.body) return;
	buildIndex();
	if (!pageIndex || !pageIndex.text) { if (!opts.quiet) afterSearch(); return; }
	ensureFolded();

	var alts = parseBoolean(query);
	// colour by unique positive atom, in order of first appearance
	var colourOf = {}, colourList = [];
	alts.forEach(function (alt) {
		alt.atoms.forEach(function (a) {
			if (!a.neg && colourOf[a.text] === undefined) {
				colourOf[a.text] = colourList.length;
				colourList.push(a.text);
			}
		});
	});
	currentTermsList = colourList.map(function (t) {
		var n = foldStr(t).replace(/\s+/g, " ");
		return caseSensitive ? n : n.toLowerCase();
	});

	// each unique atom is searched once (folded), ranges bucketed per block
	var rangeCache = {};
	function rangesFor(text) {
		if (rangeCache[text]) return rangeCache[text];
		var finder = makeRegexFinder(buildFindRegex([foldStr(text)]), null);
		var raw = mapFolded(finder(pageIndex.folded.text));
		var byBlock = {};
		raw.forEach(function (r) {
			var b = blockOfOffset(r[0]);
			(byBlock[b] = byBlock[b] || []).push(r);
		});
		return (rangeCache[text] = { byBlock: byBlock });
	}

	var chosen = [], seen = {};
	alts.forEach(function (alt) {
		var pos = alt.atoms.filter(function (a) { return !a.neg; });
		var negs = alt.atoms.filter(function (a) { return a.neg; });
		if (!pos.length) return;
		var lists = pos.map(function (a) { return rangesFor(a.text); });

		// candidate blocks: every positive atom present…
		var cand = Object.keys(lists[0].byBlock);
		for (var i = 1; i < lists.length; i++) {
			var bb = lists[i].byBlock;
			cand = cand.filter(function (b) { return bb[b]; });
		}
		// …and no negated atom present
		negs.forEach(function (a) {
			var nb = rangesFor(a.text).byBlock;
			cand = cand.filter(function (b) { return !nb[b]; });
		});

		cand.forEach(function (b) {
			var keep = lists.map(function (l) { return l.byBlock[b].slice(); });
			// NEAR pruning: keep only occurrences that have a close partner
			alt.nears.forEach(function (nr) {
				var ia = -1, ib = -1, cnt = 0;
				alt.atoms.forEach(function (a, k) {
					if (a.neg) return;
					if (k === nr.a) ia = cnt;
					if (k === nr.b) ib = cnt;
					cnt++;
				});
				if (ia < 0 || ib < 0) return;
				var keptA = [], keptB = [];
				keep[ia].forEach(function (ra) {
					keep[ib].forEach(function (rb) {
						if (wordsBetween(ra, rb) <= nr.n) {
							if (keptA.indexOf(ra) < 0) keptA.push(ra);
							if (keptB.indexOf(rb) < 0) keptB.push(rb);
						}
					});
				});
				keep[ia] = keptA; keep[ib] = keptB;
			});
			if (alt.nears.length && keep.some(function (l) { return !l.length; })) return;
			keep.forEach(function (list, i2) {
				var ti = colourOf[pos[i2].text] % TERM_COLORS;
				list.forEach(function (r) {
					var key = r[0] + ":" + r[1];
					if (!seen[key]) { seen[key] = 1; chosen.push([r[0], r[1], ti]); }
				});
			});
		});
	});

	buildMatches(chosen);
	applyHighlights();
	if (!opts.quiet) afterSearch();
}

/* ===================================================== SEARCH MODES */

function find(query, opts) {
	opts = opts || {};
	lastQuery = query;
	lastExtractKind = null;
	if (!opts.noHistory && query && query.trim()) recordHistory(query);

	// boolean / proximity queries take their own evaluation path
	if (isBooleanQuery(query)) {
		booleanSearch(query, opts);
		updatePinState();
		return;
	}

	var terms = currentTerms(query);
	if (!terms.length) {
		clearHighlights();
		currentTermsList = [];
		navBox.style.display = "none";
		hideNoResults();
		drawMarkers();
		updateCounter();
		return;
	}
	// diacritic-folded terms: cafe finds café (and vice versa)
	currentTermsList = terms.map(function (t) {
		var n = foldStr(t).replace(/\s+/g, " ");
		return caseSensitive ? n : n.toLowerCase();
	});
	var finder = stemming ? makeStemFinder(currentTermsList)
	           : fuzzy    ? makeFuzzyFinder(currentTermsList)
	           :            makeRegexFinder(buildFindRegex(terms.map(foldStr)), currentTermsList);
	highlightWith(finder, true);           // search the folded text layer
	if (!opts.quiet) afterSearch();
	updatePinState();
}

// re-run the current Find when a search-power toggle changes
function rerunFind() {
	if (input.getAttribute("placeholder") === "Find:" && input.value) find(input.value);
}

function regexSearch(str) {
	lastExtractKind = null;
	var re;
	try { re = parseRegexInput(str); }
	catch (e) {
		clearHighlights();
		navBox.style.display = "none";
		noResultsBox.textContent = "Invalid regex";
		showNoResults();
		drawMarkers();
		return;
	}
	noResultsBox.textContent = "No matches";
	highlightRegex(re);
	afterSearch();
}

function wordSize(size) {
	lastExtractKind = null;
	var n = parseInt(size, 10);
	if (!n || n < 1) { clearHighlights(); navBox.style.display = "none"; drawMarkers(); return; }
	highlightRegex(new RegExp("\\b\\w{" + n + "}\\b", "g"));
	afterSearch();
}

// extract & highlight emails / phones / URLs (copyable via the ⧉ button)
function extract(kind) {
	lastExtractKind = kind;
	if (kind === "phone") { currentTermsList = []; highlightWith(makePhoneFinder()); }
	else highlightRegex(kind === "url" ? URL_RE : EMAIL_RE);
	afterSearch();
}

function wordDistance(w1, w2) {
	lastExtractKind = null;
	if (!w1 || !w2) return;
	var re = new RegExp("\\b(" + escapeRegExp(w1) + "|" + escapeRegExp(w2) + ")\\b", "gi");
	highlightRegex(re);
	if (!matches.length) { navBox.style.display = "none"; showNoResults(); updateCounter(); return; }
	hideNoResults();

	// find the closest w1/w2 pair by their order in the document
	var a = w1.toLowerCase(), b = w2.toLowerCase();
	var idxA = [], idxB = [];
	matches.forEach(function (m, i) {
		var t = m.text.toLowerCase();
		if (t === a) idxA.push(i);
		else if (t === b) idxB.push(i);
	});
	var best = Infinity, bestStart = 0;
	for (var i = 0; i < idxA.length; i++)
		for (var j = 0; j < idxB.length; j++) {
			var d = Math.abs(idxA[i] - idxB[j]);
			if (d < best) { best = d; bestStart = Math.min(idxA[i], idxB[j]); }
		}
	navBox.style.display = "flex";
	goTo(bestStart);
}

/* ===================================================== OPEN / CLOSE */

function resetAnim(node, name) {
	node.style.animation = "none";
	void node.offsetHeight;                 // force reflow
	node.style.animation = "";
	if (name) node.style.animationName = name;
}

// set the input mode (placeholder) and show options only for plain Find
function setMode(mode) {
	input.setAttribute("placeholder", mode);
	optsBox.style.display = (uiOpen && mode === "Find:") ? "flex" : "none";
}

function captureSelection() {
	savedSelection = null;
	var sel = window.getSelection();
	if (sel && sel.rangeCount && !sel.isCollapsed) {
		var r = sel.getRangeAt(0);
		var root = r.commonAncestorContainer;
		if (root.nodeType !== 1) root = root.parentElement;
		if (root) savedSelection = { range: r.cloneRange(), root: root };
	}
}

function refreshSuggestions() {
	var illegal = ".,/;<>\\:\"()*&^%$#@!-[]";
	var seen = Object.create(null);
	wordSuggestions = [];
	var words = (document.body ? document.body.innerText : "").toLowerCase().split(/\s+/);
	for (var i = 0; i < words.length; i++) {
		var w = words[i];
		if (!w || seen[w]) continue;
		if (illegal.indexOf(w.slice(-1)) !== -1) continue;
		seen[w] = true;
		wordSuggestions.push({ label: w, value: "-" });
	}
}

function hideOptions() {
	[wordDistBtn, grWordDist, regexBtn, grRegex, otherBtn, grOther,
	 wordDistInput, groove2, noResultsBox].forEach(function (n) { n.style.visibility = "hidden"; });
	otherExtras.forEach(function (n) { n.style.visibility = "hidden"; n.setAttribute("hidden", ""); });
	navBox.style.display = "none";
	optsBox.style.display = "none";
	markersCanvas.style.display = "none";
	setPanelOpen(false);
}

function openUI() {
	if (uiOpen) return;
	uiOpen = true;
	captureSelection();          // grab any page selection before focus steals it
	refreshSuggestions();

	if (matches.length && lastQuery) {
		// pinned auto-highlights are already on the page: adopt them
		input.value = lastQuery;
		setMode("Find:");
		afterSearch();
	} else {
		input.value = "";
		lastQuery = null;
		setMode("Find:");
	}

	input.style.visibility = "visible";        resetAnim(input, "appearSearch");
	groove.style.visibility = "visible";       resetAnim(groove, "appearSearch");
	advancedButton.style.visibility = "visible"; resetAnim(advancedButton, "appearSearch");
	grAdvBtn.style.visibility = "visible";     resetAnim(grAdvBtn, "appearSearch");
	closeBtn.style.visibility = "visible";

	input.focus();
	input.select();
}

function closeUI() {
	if (!uiOpen) return;
	uiOpen = false;
	clearHighlights();
	hideOptions();
	closeBtn.style.visibility = "hidden";

	input.style.animationName = "disappearSearch";
	groove.style.animationName = "disappearSearch";
	advancedButton.style.animationName = "disappearSearch";
	grAdvBtn.style.animationName = "disappearSearch";
	setTimeout(function () {
		if (uiOpen) return;
		input.style.visibility = "hidden";
		groove.style.visibility = "hidden";
		advancedButton.style.visibility = "hidden";
		grAdvBtn.style.visibility = "hidden";
	}, 600);
	input.blur();
}

function toggleUI() { uiOpen ? closeUI() : openUI(); }

/* ===================================================== EVENT WIRING */

// Keyboard trigger — handled right here in the content script (no background
// page that can be unloaded when idle), so it stays reliable on Firefox and
// Chrome alike. Default: Ctrl/Cmd + Shift + F.
document.addEventListener("keydown", function (e) {
	if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && e.code === "KeyF") {
		e.preventDefault();
		e.stopPropagation();
		toggleUI();
	}
}, true);

// also toggle on a custom window event (used for testing / page integrations)
window.addEventListener("ctrlfack-toggle", toggleUI);

// global Esc to close
document.addEventListener("keydown", function (e) {
	if (e.key === "Escape" && uiOpen) closeUI();
}, true);

// main input: Enter runs / advances, Shift+Enter goes back
input.addEventListener("keydown", function (e) {
	if (e.key === "Escape") { closeUI(); return; }
	if (e.key !== "Enter") return;
	e.preventDefault();

	var mode = input.getAttribute("placeholder");
	if (mode === "RegExp:") { regexSearch(input.value); return; }
	if (mode === "WD:")     { wordDistance(input.value, wordDistInput.value); return; }
	if (mode === "WS:")     { wordSize(input.value); return; }

	// Find mode: re-run on a new query, otherwise step through matches
	if (input.value !== lastQuery || matches.length === 0) find(input.value);
	else if (e.shiftKey) prevMatch();
	else nextMatch();
});

wordDistInput.addEventListener("keydown", function (e) {
	if (e.key === "Escape") { closeUI(); return; }
	if (e.key === "Enter") { e.preventDefault(); wordDistance(input.value, wordDistInput.value); }
});

prevBtn.onclick = prevMatch;
nextBtn.onclick = nextMatch;
copyBtn.onclick = doCopy;

// keep the scrollbar markers in sync with scrolling / layout changes
window.addEventListener("scroll", scheduleMarkerRedraw, true);
window.addEventListener("resize", function () { computeMarkerFracs(); drawMarkers(); });

/* ---- search-power toggles ---- */
caseBtn.onclick = function () {
	caseSensitive = !caseSensitive;
	caseBtn.classList.toggle("on", caseSensitive);
	rerunFind();
};
wordBtn.onclick = function () {
	wholeWord = !wholeWord;
	wordBtn.classList.toggle("on", wholeWord);
	rerunFind();
};
fuzzyBtn.onclick = function () {
	fuzzy = !fuzzy;
	fuzzyBtn.classList.toggle("on", fuzzy);
	if (fuzzy) {
		wholeWord = false; wordBtn.classList.remove("on");   // whole-word is moot when fuzzy
		stemming = false; stemBtn.classList.remove("on");    // fuzzy and stem are exclusive
	}
	rerunFind();
};
stemBtn.onclick = function () {
	stemming = !stemming;
	stemBtn.classList.toggle("on", stemming);
	if (stemming) { fuzzy = false; fuzzyBtn.classList.remove("on"); }
	rerunFind();
};
scopeBtn.onclick = function () {
	scope = SCOPE_ORDER[(SCOPE_ORDER.indexOf(scope) + 1) % SCOPE_ORDER.length];
	scopeBtn.textContent = SCOPE_LABELS[scope];
	scopeBtn.classList.toggle("on", scope !== "all");
	rerunFind();
};

/* ---- Advanced options reveal (staggered, matches the glass animations) ---- */
advancedButton.onclick = function () {
	wordDistInput.style.visibility = "hidden";
	groove2.style.visibility = "hidden";
	if (wordDistBtn.style.visibility === "visible") {
		[wordDistBtn, grWordDist, regexBtn, grRegex, otherBtn, grOther]
			.concat(otherExtras).forEach(function (n) { n.style.visibility = "hidden"; });
		setMode("Find:");
		return;
	}
	resetAnim(wordDistBtn, "appearFirstOption");
	resetAnim(grWordDist, "appearFirstOption");
	wordDistBtn.style.visibility = "visible";
	grWordDist.style.visibility = "visible";

	setTimeout(function () {
		resetAnim(regexBtn, "dropSecondOption");
		resetAnim(grRegex, "dropSecondOptionGroove");
		regexBtn.style.visibility = "visible";
		grRegex.style.visibility = "visible";
	}, 250);
	setTimeout(function () {
		resetAnim(otherBtn, "dropThirdOption");
		resetAnim(grOther, "dropThirdOptionGroove");
		otherBtn.style.visibility = "visible";
		grOther.style.visibility = "visible";
	}, 500);
};

wordDistBtn.onclick = function () {
	otherExtras.forEach(function (n) { n.style.visibility = "hidden"; });
	input.value = "";
	if (wordDistInput.style.visibility === "visible") {
		wordDistInput.style.visibility = "hidden";
		groove2.style.visibility = "hidden";
		setMode("Find:");
	} else {
		resetAnim(wordDistInput, "appearSecondInput");
		resetAnim(groove2, "appearSecondInput");
		wordDistInput.style.visibility = "visible";
		groove2.style.visibility = "visible";
		wordDistInput.value = "";
		setMode("WD:");
		input.focus();
	}
};

regexBtn.onclick = function () {
	wordDistInput.style.visibility = "hidden";
	groove2.style.visibility = "hidden";
	otherExtras.forEach(function (n) { n.style.visibility = "hidden"; });
	input.value = "";
	setMode(input.getAttribute("placeholder") === "RegExp:" ? "Find:" : "RegExp:");
	input.focus();
};

otherBtn.onclick = function () {
	var show = other1.style.visibility !== "visible";
	otherExtras.forEach(function (n) {
		n.style.visibility = show ? "visible" : "hidden";
		if (show) n.removeAttribute("hidden");
	});
};

other1.onclick = function () {
	setMode("WS:");
	input.value = "";
	input.focus();
};

other2.onclick = function () { extract("email"); };
other3.onclick = function () { extract("phone"); };
other4.onclick = function () { extract("url"); };

/* ===================================================== AUTOCOMPLETE + HISTORY */

if (typeof autocomplete === "function") {
	autocomplete({
		input: input,
		minLength: 0,
		showOnFocus: true,
		fetch: function (text, update) {
			// only in plain Find mode
			if (input.getAttribute("placeholder") !== "Find:") { update([]); return; }
			var t = input.value.toLowerCase();

			// pinned searches for this site (📌) come first
			var pinned = sitePins.filter(function (p) {
				return t === "" || p.toLowerCase().indexOf(t) !== -1;
			}).map(function (p) { return { label: p, value: "📌" }; });

			// recent searches (↻) — everything when empty, else substring matches
			var hist = pinned.concat(searchHistory.filter(function (h) {
				return (t === "" || h.toLowerCase().indexOf(t) !== -1) && sitePins.indexOf(h) < 0;
			}).map(function (h) { return { label: h, value: "↻" }; }));

			// past the comma, boolean query, or empty box: history only
			if (t === "" || input.value.indexOf(",") !== -1 || isBooleanQuery(input.value)) {
				update(hist.slice(0, 8)); return;
			}

			// otherwise blend history with page-word suggestions (no duplicates)
			var seen = Object.create(null);
			hist.forEach(function (h) { seen[h.label.toLowerCase()] = 1; });
			var words = wordSuggestions.filter(function (n) {
				return n.label.indexOf(t) === 0 && !seen[n.label];
			});
			update(hist.concat(words).slice(0, 10));
		},
		render: function (item) {
			var div = document.createElement("div");
			if (item.value === "↻" || item.value === "📌") {
				div.className = "ctrlfack-hist";
				div.textContent = item.value + "  " + item.label;
			} else {
				div.textContent = item.label;
			}
			return div;
		},
		onSelect: function (item) { input.value = item.label; input.focus(); }
	});
}

})();
