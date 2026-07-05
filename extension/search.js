/* ============================================================================
   ctrlFACK — content script
   ----------------------------------------------------------------------------
   v0.6. Live-page find with:
   • match navigation + counter (Enter / Shift+Enter, ‹ ›, "n / total")
   • highlighting via DOM range wrapping (interactive page, no overlay clone)
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
var matches = [];        // array of <mark> elements, in document order
var activeIndex = -1;
var lastQuery = null;    // last "Find:" query, to tell "new search" from "next"
var uiOpen = false;
var wordSuggestions = [];

// search-power state
var caseSensitive = false;
var wholeWord = false;
var fuzzy = false;
var scope = "all";
var savedSelection = null;   // { range, root } captured when the UI opens
var currentTermsList = [];   // normalised terms of the active find (for colours)

// navigation / productivity state
var markerFracs = [];        // 0..1 doc-height fraction per match (scrollbar ticks)
var lastExtractKind = null;  // "email" | "phone" | "url" while extracting values
var searchHistory = [];      // recent Find queries (most recent first)
var HISTORY_KEY = "ctrlfack_history";

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
navBox.appendChild(prevBtn);
navBox.appendChild(counterEl);
navBox.appendChild(nextBtn);
navBox.appendChild(copyBtn);

// scrollbar match markers (canvas gutter on the right edge)
var markersCanvas = el("CANVAS", "ctrlfackMarkers");
markersCanvas.__ctx = markersCanvas.getContext("2d");

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
	return [query];
}

function buildFindRegex(terms) {
	var parts = terms.map(function (t) {
		var p = escapeRegExp(t);
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
				var key = caseSensitive ? m[0] : m[0].toLowerCase();
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

/* ---- extract patterns ---- */
var EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
var URL_RE   = /(?:https?:\/\/|www\.)[^\s<>"')\]]+/gi;

// phone: candidate runs of phone-ish chars, kept only if they hold 7–15 digits
function makePhoneFinder() {
	var cand = /\+?\d[\d().\-\s]{5,}\d/g;
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

function clearHighlights() {
	var marks = document.querySelectorAll("mark." + MARK_CLASS);
	var parents = new Set();
	for (var i = 0; i < marks.length; i++) {
		var mk = marks[i], p = mk.parentNode;
		if (!p) continue;
		while (mk.firstChild) p.insertBefore(mk.firstChild, mk);
		p.removeChild(mk);
		parents.add(p);
	}
	parents.forEach(function (p) { try { p.normalize(); } catch (e) {} });
	matches = [];
	activeIndex = -1;
}

function wrapRanges(node, ranges, multi) {
	if (!ranges || !ranges.length) return;
	ranges.sort(function (a, b) { return a[0] - b[0]; });
	var text = node.nodeValue, frag = document.createDocumentFragment(), cursor = 0;
	for (var i = 0; i < ranges.length; i++) {
		var s = ranges[i][0], e = ranges[i][1], ti = ranges[i][2] || 0;
		if (s < cursor) continue;             // skip overlaps
		if (s > cursor) frag.appendChild(document.createTextNode(text.slice(cursor, s)));
		var mk = document.createElement("mark");
		mk.className = MARK_CLASS + (multi ? " ctrlfack-t" + (ti % TERM_COLORS) : "");
		mk.textContent = text.slice(s, e);
		frag.appendChild(mk);
		matches.push(mk);
		cursor = e;
		if (matches.length >= MATCH_CAP) break;
	}
	if (cursor < text.length) frag.appendChild(document.createTextNode(text.slice(cursor)));
	node.parentNode.replaceChild(frag, node);
}

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

function highlightWith(finder) {
	clearHighlights();
	if (!finder || !document.body) return 0;
	var scopeSel = SCOPE_SELECTORS[scope];

	var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
		acceptNode: function (node) {
			if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
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

	var nodes = [], cur;
	while ((cur = walker.nextNode())) nodes.push(cur);
	var multi = currentTermsList.length > 1;
	for (var i = 0; i < nodes.length; i++) {
		if (matches.length >= MATCH_CAP) break;
		wrapRanges(nodes[i], finder(nodes[i].nodeValue), multi);
	}
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
	if (activeIndex >= 0 && matches[activeIndex]) matches[activeIndex].classList.remove(ACTIVE_CLASS);
	activeIndex = ((i % matches.length) + matches.length) % matches.length;
	var target = matches[activeIndex];
	target.classList.add(ACTIVE_CLASS);
	try { target.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" }); }
	catch (e) { target.scrollIntoView(); }
	drawMarkers();
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
		var r = matches[i].getBoundingClientRect();
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
		var v = matches[i].textContent.trim();
		if (v && !seen[v]) { seen[v] = 1; out.push(v); }
	}
	return out;
}

// the deduped block/line of text each match sits in (for "copy matched lines")
var BLOCK_SEL = "p,li,td,th,h1,h2,h3,h4,h5,h6,pre,blockquote,dd,dt,figcaption,caption,section,article,div";
function getMatchedLines() {
	var seen = Object.create(null), out = [];
	for (var i = 0; i < matches.length; i++) {
		var block = matches[i].closest(BLOCK_SEL) || matches[i].parentElement;
		var line = (block ? block.textContent : matches[i].textContent).replace(/\s+/g, " ").trim();
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

/* ===================================================== SEARCH MODES */

function find(query) {
	lastQuery = query;
	lastExtractKind = null;
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
	currentTermsList = terms.map(function (t) { return caseSensitive ? t : t.toLowerCase(); });
	recordHistory(query);
	var finder = fuzzy
		? makeFuzzyFinder(currentTermsList)
		: makeRegexFinder(buildFindRegex(terms), currentTermsList);
	highlightWith(finder);
	afterSearch();
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
	matches.forEach(function (mk, i) {
		var t = mk.textContent.toLowerCase();
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
}

function openUI() {
	if (uiOpen) return;
	uiOpen = true;
	captureSelection();          // grab any page selection before focus steals it
	refreshSuggestions();

	input.value = "";
	lastQuery = null;
	setMode("Find:");

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
	if (fuzzy) { wholeWord = false; wordBtn.classList.remove("on"); }  // whole-word is moot when fuzzy
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

			// recent searches (↻) — everything when empty, else substring matches
			var hist = searchHistory.filter(function (h) {
				return t === "" || h.toLowerCase().indexOf(t) !== -1;
			}).map(function (h) { return { label: h, value: "↻" }; });

			// past the comma, or empty box: just show history
			if (t === "" || input.value.indexOf(",") !== -1) { update(hist.slice(0, 8)); return; }

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
			if (item.value === "↻") {
				div.className = "ctrlfack-hist";
				div.textContent = "↻  " + item.label;
			} else {
				div.textContent = item.label;
			}
			return div;
		},
		onSelect: function (item) { input.value = item.label; input.focus(); }
	});
}

})();
