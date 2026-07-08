/* ============================================================================
   ctrlFACK background — Whisper Mode relay
   ----------------------------------------------------------------------------
   Each content script opens a long-lived runtime port to this worker. Ports:
     • need no "tabs"/host permission (we only ever reply on a port the tab
       itself opened), and
     • keep the worker alive while any tab is connected — so Firefox can't
       idle-drop it mid-session, which is what broke the old command approach.
   The worker tracks each tab's on-screen window geometry, detects two windows
   sitting side-by-side on one screen, and relays "peer" messages between a
   paired couple. It never reads page content.
   ========================================================================== */

var ports = {};        // tabId -> Port
var geoms = {};        // tabId -> { x, y, w, h, sl, st, sw, sh, vis }
var pairOf = {};       // tabId -> partner tabId (an active whisper pair)
var partnerOf = {};    // tabId -> { id, side } (current side-by-side candidate)

function send(tabId, msg) {
	var p = ports[tabId];
	if (p) { try { p.postMessage(msg); } catch (e) {} }
}

// Two visible windows on the same screen, horizontally adjacent with enough
// vertical overlap → a side-by-side pair. Returns which one is on the left.
function sideBySide(a, b) {
	if (!a || !b || !a.vis || !b.vis) return null;
	if (Math.abs(a.sl - b.sl) > 2 || Math.abs(a.sw - b.sw) > 2) return null;  // same monitor
	var vOverlap = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
	if (vOverlap < 120) return null;
	var TOL = 90;   // tolerate a small gap or slight overlap between the frames
	if (a.x <= b.x && Math.abs(b.x - (a.x + a.w)) <= TOL) return { left: "A", right: "B" };
	if (b.x <= a.x && Math.abs(a.x - (b.x + b.w)) <= TOL) return { left: "B", right: "A" };
	return null;
}

// Recompute one partner per tab (greedy) and push status to everyone.
function recomputePartners() {
	var ids = Object.keys(ports);
	var partner = {};
	for (var i = 0; i < ids.length; i++) {
		for (var j = i + 1; j < ids.length; j++) {
			var A = ids[i], B = ids[j];
			if (partner[A] || partner[B]) continue;
			var sb = sideBySide(geoms[A], geoms[B]);
			if (!sb) continue;
			var aSide = sb.left === "A" ? "left" : "right";
			partner[A] = { id: B, side: aSide };
			partner[B] = { id: A, side: aSide === "left" ? "right" : "left" };
		}
	}
	partnerOf = partner;

	ids.forEach(function (id) {
		var pr = partner[id];
		send(id, {
			t: "partner",
			present: !!pr,
			side: pr ? pr.side : null,
			color: pr ? (pr.side === "left" ? 0 : 1) : null,
			partnerId: pr ? pr.id : null
		});
		// a whisper pair whose partner vanished or changed is dissolved
		if (pairOf[id] && (!pr || String(pr.id) !== String(pairOf[id]))) endPair(id);
	});
}

function endPair(tabId) {
	var partnerId = pairOf[tabId];
	delete pairOf[tabId];
	send(tabId, { t: "whisper", on: false });
	if (partnerId != null && pairOf[partnerId] != null) {
		delete pairOf[partnerId];
		send(partnerId, { t: "whisper", on: false });
	}
}

chrome.runtime.onConnect.addListener(function (port) {
	if (port.name !== "ctrlfack") return;
	var tabId = port.sender && port.sender.tab && port.sender.tab.id;
	if (tabId == null) return;
	ports[tabId] = port;

	port.onMessage.addListener(function (msg) {
		if (!msg) return;
		if (msg.t === "hello" || msg.t === "geom") {
			geoms[tabId] = msg.geom;
			recomputePartners();
		} else if (msg.t === "whisper") {
			var pr = partnerOf[tabId];
			if (msg.on && pr) {
				pairOf[tabId] = pr.id;
				pairOf[pr.id] = tabId;
				send(pr.id, { t: "whisper", on: true });   // partner joins automatically
				send(tabId, { t: "whisper", on: true });
			} else if (!msg.on) {
				endPair(tabId);
			}
		} else if (msg.t === "peer") {
			var pid = pairOf[tabId];
			if (pid != null) send(pid, { t: "peer", data: msg.data });
		}
	});

	port.onDisconnect.addListener(function () {
		delete ports[tabId];
		delete geoms[tabId];
		if (pairOf[tabId] != null) {
			var pid = pairOf[tabId];
			delete pairOf[tabId];
			if (pid != null && pairOf[pid] != null) { delete pairOf[pid]; send(pid, { t: "whisper", on: false }); }
			send(pid, { t: "partner-gone" });
		}
		recomputePartners();
	});
});
