/* ============================================================================
   ctrlFACK — content script
   ----------------------------------------------------------------------------
   Core design (v0.4):
   1. Match navigation + live counter  (Enter / Shift+Enter, ‹ ›, "n / total")
   2. Highlighting happens on the LIVE page via DOM range wrapping (no more
      cloning innerHTML into a blurred overlay) — the page stays interactive
      and works with dynamic content. Robust across Chrome & Firefox.
   3. Opened via the browser command (see background.js), not Ctrl+Z. Esc closes.
   ========================================================================== */

(function () {
"use strict";

if (window.__ctrlfackInjected) return;      // guard against double injection
window.__ctrlfackInjected = true;

var MARK_CLASS   = "ctrlfack-mark";
var ACTIVE_CLASS = "ctrlfack-mark-active";
var MATCH_CAP    = 5000;                     // safety limit on huge pages

/* ------------------------------------------------------------------ state */
var matches = [];        // array of <mark> elements, in document order
var activeIndex = -1;
var lastQuery = null;    // last "Find:" query, to tell "new search" from "next"
var uiOpen = false;
var wordSuggestions = [];

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
other2.textContent = "Find Email";

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
navBox.appendChild(prevBtn);
navBox.appendChild(counterEl);
navBox.appendChild(nextBtn);

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

function buildRegex(query, caseSensitive, wholeWord) {
	var pat = escapeRegExp(query);
	if (wholeWord) pat = "\\b" + pat + "\\b";
	return new RegExp(pat, "g" + (caseSensitive ? "" : "i"));
}

function parseRegexInput(str) {
	var m = str.match(/^\/(.*)\/([a-z]*)$/i);
	var pattern = m ? m[1] : str;
	var flags = m ? m[2] : "";
	if (flags.indexOf("g") === -1) flags += "g";
	return new RegExp(pattern, flags);      // may throw on bad regex — caller guards
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

function wrapMatches(node, re) {
	var text = node.nodeValue;
	re.lastIndex = 0;
	var ranges = [], m;
	while ((m = re.exec(text)) !== null) {
		if (m[0] === "") { re.lastIndex++; continue; }
		ranges.push([m.index, m.index + m[0].length]);
		if (!re.global) break;
		if (matches.length + ranges.length >= MATCH_CAP) break;
	}
	if (!ranges.length) return;

	var frag = document.createDocumentFragment();
	var cursor = 0;
	for (var i = 0; i < ranges.length; i++) {
		var s = ranges[i][0], e = ranges[i][1];
		if (s > cursor) frag.appendChild(document.createTextNode(text.slice(cursor, s)));
		var mk = document.createElement("mark");
		mk.className = MARK_CLASS;
		mk.textContent = text.slice(s, e);
		frag.appendChild(mk);
		matches.push(mk);
		cursor = e;
	}
	if (cursor < text.length) frag.appendChild(document.createTextNode(text.slice(cursor)));
	node.parentNode.replaceChild(frag, node);
}

function highlightRegex(re) {
	clearHighlights();
	if (!re || !document.body) return 0;

	var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
		acceptNode: function (node) {
			if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
			var p = node.parentNode;
			if (!p || p.nodeType !== 1) return NodeFilter.FILTER_REJECT;
			if (p.closest("script,style,noscript,textarea,.autocomplete,mark." + MARK_CLASS))
				return NodeFilter.FILTER_REJECT;
			return NodeFilter.FILTER_ACCEPT;
		}
	});

	var nodes = [], cur;
	while ((cur = walker.nextNode())) nodes.push(cur);
	for (var i = 0; i < nodes.length; i++) {
		if (matches.length >= MATCH_CAP) break;
		wrapMatches(nodes[i], re);
	}
	return matches.length;
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
	updateCounter();
}

function nextMatch() { goTo(activeIndex + 1); }
function prevMatch() { goTo(activeIndex - 1); }

function showNoResults() { noResultsBox.style.visibility = "visible"; }
function hideNoResults() { noResultsBox.style.visibility = "hidden"; }

// shared post-search behaviour for find / regex / word-size / email
function afterSearch() {
	if (matches.length) {
		hideNoResults();
		navBox.style.display = "flex";
		goTo(0);
	} else {
		navBox.style.display = "none";
		showNoResults();
	}
	updateCounter();
}

/* ===================================================== SEARCH MODES */

function find(query) {
	lastQuery = query;
	if (!query) { clearHighlights(); navBox.style.display = "none"; hideNoResults(); updateCounter(); return; }
	highlightRegex(buildRegex(query, false, false));
	afterSearch();
}

function regexSearch(str) {
	var re;
	try { re = parseRegexInput(str); }
	catch (e) {
		clearHighlights();
		navBox.style.display = "none";
		noResultsBox.textContent = "Invalid regex";
		showNoResults();
		return;
	}
	noResultsBox.textContent = "No matches";
	highlightRegex(re);
	afterSearch();
}

function wordSize(size) {
	var n = parseInt(size, 10);
	if (!n || n < 1) { clearHighlights(); navBox.style.display = "none"; return; }
	highlightRegex(new RegExp("\\b\\w{" + n + "}\\b", "g"));
	afterSearch();
}

function findEmails() {
	highlightRegex(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g);
	afterSearch();
}

function wordDistance(w1, w2) {
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
	[other1, other2].forEach(function (n) { n.style.visibility = "hidden"; n.setAttribute("hidden", ""); });
	navBox.style.display = "none";
}

function openUI() {
	if (uiOpen) return;
	uiOpen = true;
	refreshSuggestions();

	input.setAttribute("placeholder", "Find:");
	input.value = "";
	lastQuery = null;

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

/* ---- Advanced options reveal (staggered, matches the glass animations) ---- */
advancedButton.onclick = function () {
	wordDistInput.style.visibility = "hidden";
	groove2.style.visibility = "hidden";
	if (wordDistBtn.style.visibility === "visible") {
		[wordDistBtn, grWordDist, regexBtn, grRegex, otherBtn, grOther, other1, other2]
			.forEach(function (n) { n.style.visibility = "hidden"; });
		input.setAttribute("placeholder", "Find:");
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
	other1.style.visibility = other2.style.visibility = "hidden";
	input.value = "";
	if (wordDistInput.style.visibility === "visible") {
		wordDistInput.style.visibility = "hidden";
		groove2.style.visibility = "hidden";
		input.setAttribute("placeholder", "Find:");
	} else {
		resetAnim(wordDistInput, "appearSecondInput");
		resetAnim(groove2, "appearSecondInput");
		wordDistInput.style.visibility = "visible";
		groove2.style.visibility = "visible";
		wordDistInput.value = "";
		input.setAttribute("placeholder", "WD:");
		input.focus();
	}
};

regexBtn.onclick = function () {
	wordDistInput.style.visibility = "hidden";
	groove2.style.visibility = "hidden";
	other1.style.visibility = other2.style.visibility = "hidden";
	input.value = "";
	input.setAttribute("placeholder", input.getAttribute("placeholder") === "RegExp:" ? "Find:" : "RegExp:");
	input.focus();
};

otherBtn.onclick = function () {
	var show = other1.style.visibility !== "visible";
	other1.style.visibility = other2.style.visibility = show ? "visible" : "hidden";
	if (show) { other1.removeAttribute("hidden"); other2.removeAttribute("hidden"); }
};

other1.onclick = function () {
	input.setAttribute("placeholder", "WS:");
	input.value = "";
	input.focus();
};

other2.onclick = function () { findEmails(); };

/* ===================================================== AUTOCOMPLETE */

if (typeof autocomplete === "function") {
	autocomplete({
		input: input,
		minLength: 1,
		fetch: function (text, update) {
			var t = input.value.toLowerCase();
			// only suggest for plain find, not regex / word-size modes
			if (input.getAttribute("placeholder") !== "Find:") { update([]); return; }
			update(wordSuggestions.filter(function (n) { return n.label.indexOf(t) === 0; }).slice(0, 8));
		},
		onSelect: function (item) { input.value = item.label; input.focus(); }
	});
}

})();
