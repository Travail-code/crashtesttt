/* crash(1 Go) — app.js : interface (réservation automatique de 1 Go à l'ouverture) */
(function () {
  "use strict";

  var core = (typeof globalThis !== "undefined" && globalThis.MemoryLock) || window.MemoryLock;
  var MIB = core.MIB;
  var DEFAULT_MO = 1024; // 1024 Mo = 1 Go = 1 073 741 824 octets
  var GLOBAL = 703.7; // longueur du cercle de jauge (2π × 112)

  /* ---------- état ---------- */

  var chunks = [];          // tampons conservés volontairement (référence globale)
  var targetBytes = 0;
  var running = false;
  var locked = false;
  var heapTimer = null;

  /* ---------- DOM ---------- */

  var $ = function (id) { return document.getElementById(id); };
  var els = {
    dot: $("dot"),
    targetMoText: $("targetMoText"),
    targetBytesText: $("targetBytesText"),
    gaugeValue: $("gaugeValue"),
    gaugeUnit: $("gaugeUnit"),
    gaugeRing: $("gaugeRing"),
    gaugeWrap: $("gaugeWrap"),
    stateChip: $("stateChip"),
    status: $("status"),
    chips: $("chips"),
    btnRun: $("btnRun"),
    btnFree: $("btnFree")
  };

  /* ---------- cible ---------- */

  // « 1024 Mo » s’affiche « 1 Go » (et « 2048 Mo » → « 2 Go ») ; sinon en Mo.
  function moLabel(mo) {
    if (mo >= 1024 && mo % 1024 === 0) return core.formatFr(mo / 1024) + " Go";
    return core.formatFr(mo) + " Mo";
  }

  function readTarget() {
    var mo = DEFAULT_MO;
    try {
      var qs = new URLSearchParams(window.location.search);
      var p = parseInt(qs.get("mo"), 10);
      if (Number.isFinite(p) && p >= 1 && p <= 16384) mo = p;
    } catch (e) { /* pas de query string : valeur par défaut */ }
    targetBytes = mo * MIB;
    els.targetMoText.textContent = moLabel(mo);
    els.targetBytesText.textContent = core.formatFr(targetBytes) + " octets";
  }

  /* ---------- helpers UI ---------- */

  function setChip(stateClass, label) {
    els.stateChip.className = "state-chip " + stateClass;
    els.stateChip.textContent = label;
  }

  function setStatus(text) {
    els.status.textContent = text;
  }

  function chip(label, valueHTML, extraClass) {
    var c = document.createElement("span");
    c.className = "chip";
    c.innerHTML = label + "&nbsp;: <b class=\"" + (extraClass || "") + "\">" + valueHTML + "</b>";
    return c;
  }

  function renderChips() {
    var frag = document.createDocumentFragment();
    var moShown = (targetBytes / MIB).toLocaleString("fr-FR");

    frag.appendChild(chip("Cible", moShown + " Mo"));
    frag.appendChild(chip("Octets", core.formatFr(targetBytes)));
    frag.appendChild(chip("Hex", core.toHex(targetBytes)));

    if (chunks.length > 0) {
      frag.appendChild(chip("Blocs", String(chunks.length)));
      var v = core.sampleVerify(chunks, 512);
      frag.appendChild(chip(
        "Vérification",
        v.ok ? "✓ " + core.formatFr(v.samplesRead) + " échantillons" : "✗ échec",
        v.ok ? "ok" : "warn-c"
      ));
    } else {
      frag.appendChild(chip("Blocs", "—"));
      frag.appendChild(chip("Vérification", "—"));
    }

    if (window.performance && performance.memory && performance.memory.usedJSHeapSize) {
      var heapMo = (performance.memory.usedJSHeapSize / MIB).toFixed(1).replace(".", ",");
      frag.appendChild(chip("Heap mesuré (Chromium)", "≈ " + heapMo + " Mo", "warn-c"));
    } else {
      frag.appendChild(chip("Heap mesuré", "n/a (hors Chromium)"));
    }

    if (navigator.deviceMemory) {
      frag.appendChild(chip("RAM de l’appareil", "≈ " + navigator.deviceMemory + " Go"));
    }

    els.chips.innerHTML = "";
    els.chips.appendChild(frag);
  }

  function setGauge(fraction) {
    var f = Math.max(0, Math.min(1, fraction));
    els.gaugeRing.style.strokeDashoffset = String(GLOBAL * (1 - f));
  }

  function setBigValue(bytes) {
    var mo = bytes / MIB;
    if (mo >= 1024) {
      // Affichage en Go dès qu’on dépasse 1024 Mo.
      els.gaugeValue.textContent = mo % 1024 === 0 ? String(mo / 1024) : (mo / 1024).toFixed(1).replace(".", ",");
      els.gaugeUnit.textContent = "Go";
    } else {
      els.gaugeValue.textContent = mo >= 100 ? String(Math.round(mo)) : mo.toFixed(1).replace(".", ",");
      els.gaugeUnit.textContent = "Mo";
    }
  }

  function tick() {
    // rAF pour la fluidité, avec repli setTimeout (un onglet en arrière-plan
    // suspend rAF : l'armement doit quand même aboutir).
    return new Promise(function (res) {
      var settled = false;
      var finish = function () { if (!settled) { settled = true; res(); } };
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(finish);
      setTimeout(finish, 60);
    });
  }

  /* ---------- actions ---------- */

  function setButtons() {
    els.btnRun.disabled = running;
    els.btnFree.disabled = running || !locked;
    els.btnRun.textContent = locked ? "Relancer la réservation" : "Armer le verrou (" + Math.round(targetBytes / MIB) + " Mo)";
  }

  function release() {
    stopHeapMonitor();
    chunks = [];
    locked = false;
    setChip("released", "LIBÉRÉ");
    if (els.gaugeWrap) els.gaugeWrap.classList.remove("locked-ring");
    setGauge(0);
    setBigValue(0);
    els.dot.className = "dot";
    renderChips();
    setStatus("Mémoire libérée : 0 octet réservé par cet onglet. La page est redevenue légère.");
    setButtons();
    document.title = "crash(1 Go) — mémoire libérée";
  }

  function startHeapMonitor() {
    stopHeapMonitor();
    if (!(window.performance && performance.memory && performance.memory.usedJSHeapSize)) return;
    heapTimer = setInterval(function () {
      if (!locked) return;
      var heapMo = (performance.memory.usedJSHeapSize / MIB).toFixed(1).replace(".", ",");
      var chipsEls = els.chips.querySelectorAll(".chip");
      // met à jour la puce "Heap mesuré" si présente
      for (var i = 0; i < chipsEls.length; i++) {
        var label = chipsEls[i].firstChild && chipsEls[i].firstChild.nodeValue || "";
        if (label.indexOf("Heap mesuré") !== -1) {
          chipsEls[i].innerHTML = "Heap mesuré (Chromium)&nbsp;: <b class=\"warn-c\">≈ " + heapMo + " Mo</b>";
        }
      }
    }, 1000);
  }

  function stopHeapMonitor() {
    if (heapTimer) { clearInterval(heapTimer); heapTimer = null; }
  }

  async function run() {
    if (running) return;
    running = true;
    locked = false;
    setButtons();
    setChip("arming", "ARMEMENT…");
    els.dot.className = "dot armed";
    setStatus("Réservation de " + core.formatFr(targetBytes) + " octets… écriture de chaque octet en mémoire (memset).");
    if (els.gaugeWrap) els.gaugeWrap.classList.remove("locked-ring");
    renderChips();

    try {
      // Allocation par tranches de 64 Mo : la jauge grimpe visuellement.
      chunks = [];
      var done = 0;
      var sliceSize = 64 * MIB;
      while (done < targetBytes) {
        var size = Math.min(sliceSize, targetBytes - done);
        var sliceChunks = core.allocateExactly(size, { chunkSize: size });
        for (var i = 0; i < sliceChunks.length; i++) chunks.push(sliceChunks[i]);
        done += size;
        setGauge(done / targetBytes);
        setBigValue(done);
        await tick();
      }

      var exact = core.totalBytes(chunks) === targetBytes;
      var verify = core.sampleVerify(chunks, 512);

      if (!exact) throw new Error("taille réservée incorrecte");
      if (!verify.ok) throw new Error("échantillons mémoire invalides");

      locked = true;
      running = false;
      if (els.gaugeWrap) els.gaugeWrap.classList.add("locked-ring");
      els.dot.className = "dot locked";
      setGauge(1);
      setBigValue(targetBytes);
      setChip("locked", "VERROUILLÉ");
      setStatus(
        "✓ Verrou armé : exactement " + core.formatFr(targetBytes) + " octets (" +
        moLabel(Math.round(targetBytes / MIB)) + ") sont réservés et écrits par cet onglet. " +
        "La mémoire restera consommée jusqu’à la fermeture de l’onglet ou la libération manuelle."
      );
      document.title = "crash(1 Go) · verrou armé — " + moLabel(Math.round(targetBytes / MIB));
      renderChips();
      startHeapMonitor();
      setButtons();
    } catch (err) {
      chunks = [];
      running = false;
      locked = false;
      els.dot.className = "dot";
      setGauge(0);
      setBigValue(0);
      setChip("failed", "ÉCHEC");
      renderChips();
      setStatus(
        "✗ Impossible de réserver " + moLabel(Math.round(targetBytes / MIB)) + " sur cet appareil (" +
        (err && err.message ? err.message : "erreur d’allocation") + "). " +
        "Essayez une cible plus petite, par exemple ?mo=256 dans l’URL."
      );
      setButtons();
    }
  }

  /* ---------- démarrage ---------- */

  readTarget();
  renderChips();
  setButtons();

  els.btnRun.addEventListener("click", function () {
    if (locked) release();
    run();
  });
  els.btnFree.addEventListener("click", release);

  // Armement automatique dès l'ouverture de la page.
  window.addEventListener("load", function () {
    setTimeout(function () {
      if (!running && !locked) run();
    }, 400);
  });
})();
