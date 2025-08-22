(function () {
  /**
   * Labelling Tool Script
   * - Loads dataset (sample or upload)
   * - Renders one record at a time
   * - Captures ratings: category, valence, conditional subcategory
   * - Autosaves to localStorage and supports JSON export
   * - Keyboard navigation: Left/Right to prev/next with save
   */

  /** @typedef {{ id: number|string, uid?: string, transcription?: string|null, content?: string }} Item */

  /** @type {Item[]} */
  let dataset = [];
  let index = 0;
  const STORAGE_KEY = "labelling_tool_progress_v1";

  const elements = {
    raterIdInput: document.getElementById("raterIdInput"),
    loadSampleBtn: document.getElementById("loadSampleBtn"),
    fileInput: document.getElementById("fileInput"),
    exportBtn: document.getElementById("exportBtn"),
    datasetStatus: document.getElementById("datasetStatus"),
    progressText: document.getElementById("progressText"),
    progressBar: document.getElementById("progressBar"),
    prevBtn: document.getElementById("prevBtn"),
    nextBtn: document.getElementById("nextBtn"),
    positionText: document.getElementById("positionText"),
    jumpInput: document.getElementById("jumpInput"),
    jumpBtn: document.getElementById("jumpBtn"),
    metaId: document.getElementById("metaId"),
    metaUid: document.getElementById("metaUid"),
    contentText: document.getElementById("contentText"),
    transcriptionText: document.getElementById("transcriptionText"),
    ratingsForm: document.getElementById("ratingsForm"),
    subcategoryGroup: document.getElementById("subcategoryGroup"),
    flagCheckbox: document.getElementById("flagCheckbox"),
    tooShortCheckbox: document.getElementById("tooShortCheckbox"),
    promotionalCheckbox: document.getElementById("promotionalCheckbox"),
    engagementCheckbox: document.getElementById("engagementCheckbox"),
    clearBtn: document.getElementById("clearBtn"),
    saveBtn: document.getElementById("saveBtn"),
    saveNextBtn: document.getElementById("saveNextBtn"),
  };

  const state = {
    ratingsById: /** @type {Record<string, any>} */ ({}),
    raterId: "",
  };

  // Return current time as ISO-like string in Australia/Melbourne, e.g. 2025-08-19T14:23:45+10:00 or +11:00 during DST
  function melbourneNowISO() {
    const opts = {
      timeZone: "Australia/Melbourne",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZoneName: "longOffset",
    };
    const parts = new Intl.DateTimeFormat("en-CA", opts).formatToParts(
      new Date()
    );
    /** @type {Record<string,string>} */
    const p = {};
    for (const part of parts) p[part.type] = part.value;
    const offset = (p.timeZoneName || "GMT+10:00").replace("GMT", "");
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${offset}`;
  }

  function propagateRaterIdAcrossRatings() {
    const current = state.raterId || null;
    for (const key of Object.keys(state.ratingsById)) {
      const r = state.ratingsById[key];
      if (r && r.raterId !== current) {
        r.raterId = current;
      }
    }
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        state.ratingsById = parsed.ratingsById || {};
        state.raterId = parsed.raterId || "";
      }
    } catch (_e) {
      /* ignore */
    }
  }
  function saveState() {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ratingsById: state.ratingsById,
        raterId: state.raterId,
      })
    );
  }

  function sanitizeItem(item) {
    // Replace NaN transcription with null/string and ensure fields exist
    const clean = { ...item };
    if (typeof clean.transcription !== "string") {
      // In case of NaN or undefined, set to null
      clean.transcription = null;
    }
    if (typeof clean.content !== "string") clean.content = "";
    return clean;
  }

  function setDataset(items) {
    dataset = (items || []).map(sanitizeItem);
    index = 0;
    elements.datasetStatus.textContent = dataset.length
      ? `Loaded ${dataset.length} items`
      : "No dataset loaded";
    render();
    updateProgress();
    // Initialize background color
    updateBackgroundColor(0);
  }

  function render() {
    const hasData = dataset.length > 0;
    if (elements.prevBtn) elements.prevBtn.disabled = !hasData || index <= 0;
    if (elements.nextBtn)
      elements.nextBtn.disabled = !hasData || index >= dataset.length - 1;
    if (elements.clearBtn) elements.clearBtn.disabled = !hasData;
    if (elements.jumpInput) elements.jumpInput.disabled = !hasData;
    if (elements.jumpBtn) elements.jumpBtn.disabled = !hasData;

    if (!hasData) {
      elements.metaId.textContent = "—";
      elements.metaUid.textContent = "—";
      elements.contentText.textContent = "—";
      elements.transcriptionText.textContent = "—";
      elements.positionText.textContent = "Item 0 of 0";
      clearForm();
      // Reset background to original color when no dataset
      updateBackgroundColor(0);
      return;
    }

    const item = dataset[index];
    elements.metaId.textContent = String(item.id ?? "");
    elements.metaUid.textContent = String(item.uid ?? "");
    elements.contentText.textContent = item.content || "—";
    elements.transcriptionText.textContent = item.transcription
      ? item.transcription
      : "—";
    elements.positionText.textContent = `Item ${index + 1} of ${
      dataset.length
    }`;

    // Load saved rating if exists
    const key = makeKey(item);
    const saved = state.ratingsById[key];
    applyToForm(saved || {});
    if (elements.flagCheckbox)
      elements.flagCheckbox.checked = !!(saved && saved.flagged === true);
    if (elements.tooShortCheckbox)
      elements.tooShortCheckbox.checked = !!(saved && saved.tooShort === true);
    if (elements.promotionalCheckbox)
      elements.promotionalCheckbox.checked = !!(saved && saved.promotional === true);
    if (elements.engagementCheckbox)
      elements.engagementCheckbox.checked = !!(saved && saved.engagement === true);
  }

  function makeKey(item) {
    // Prefer unique id+uid if available
    return `${item.id ?? index}|${item.uid ?? ""}`;
  }

  function getFormValues() {
    const form = elements.ratingsForm;
    const category = form.category.value || "";
    const valence = form.valence.value || "";
    const needsSub = /[23]$/.test(category);
    const subcategory = needsSub ? form.subcategory.value || "" : "";
    return { category, valence, subcategory, needsSub };
  }

  function applyToForm(values) {
    clearForm();
    if (values.category) {
      const el = elements.ratingsForm.querySelector(
        `input[name="category"][value="${CSS.escape(values.category)}"]`
      );
      if (el) el.checked = true;
    }
    if (values.valence) {
      const el = elements.ratingsForm.querySelector(
        `input[name="valence"][value="${CSS.escape(values.valence)}"]`
      );
      if (el) el.checked = true;
    }
    // subcategory visibility toggles based on category
    toggleSubcategory();
    if (values.subcategory) {
      const el = elements.ratingsForm.querySelector(
        `input[name="subcategory"][value="${CSS.escape(values.subcategory)}"]`
      );
      if (el) el.checked = true;
    }
  }

  function clearForm() {
    elements.ratingsForm.reset();
    elements.subcategoryGroup.classList.add("hidden");
    // Reset additional checkboxes
    if (elements.tooShortCheckbox) elements.tooShortCheckbox.checked = false;
    if (elements.promotionalCheckbox) elements.promotionalCheckbox.checked = false;
    if (elements.engagementCheckbox) elements.engagementCheckbox.checked = false;
  }

  function toggleSubcategory() {
    const category = elements.ratingsForm.category.value || "";
    const needs = /[23]$/.test(category);
    elements.subcategoryGroup.classList.toggle("hidden", !needs);
  }

  function validate(values) {
    // If "too short to code" is selected, no other validation is needed
    if (elements.tooShortCheckbox && elements.tooShortCheckbox.checked) {
      return { ok: true };
    }
    
    if (!values.category)
      return { ok: false, message: "Please select a Category." };
    if (!values.valence)
      return { ok: false, message: "Please select a Valence." };
    if (values.needsSub && !values.subcategory)
      return { ok: false, message: "Please select a Subcategory." };
    return { ok: true };
  }

  function saveCurrent() {
    if (!dataset.length) return { ok: false, message: "No dataset" };
    const item = dataset[index];
    const key = makeKey(item);
    const values = getFormValues();
    const v = validate(values);
    if (!v.ok) return v;

    // If "too short to code" is selected, set other fields to null
    const isTooShort = elements.tooShortCheckbox && elements.tooShortCheckbox.checked;
    
    state.ratingsById[key] = {
      itemIndex: index,
      id: item.id ?? null,
      uid: item.uid ?? null,
      category: isTooShort ? null : values.category,
      valence: isTooShort ? null : values.valence,
      subcategory: isTooShort ? null : (values.needsSub ? values.subcategory : null),
      flagged: elements.flagCheckbox ? !!elements.flagCheckbox.checked : false,
      tooShort: elements.tooShortCheckbox ? !!elements.tooShortCheckbox.checked : false,
      promotional: elements.promotionalCheckbox ? !!elements.promotionalCheckbox.checked : false,
      engagement: elements.engagementCheckbox ? !!elements.engagementCheckbox.checked : false,
      raterId: state.raterId || null,
      timestamp: melbourneNowISO(),
    };
    saveState();
    updateProgress();
    return { ok: true };
  }

  function savePartialProgress() {
    if (!dataset.length) return;
    const item = dataset[index];
    const key = makeKey(item);
    const values = getFormValues();
    const isComplete = !!(
      (values.category &&
      values.valence &&
      (!values.needsSub || values.subcategory)) ||
      (elements.tooShortCheckbox && elements.tooShortCheckbox.checked)
    );
    // If "too short to code" is selected, set other fields to null
    const isTooShort = elements.tooShortCheckbox && elements.tooShortCheckbox.checked;
    
    state.ratingsById[key] = {
      itemIndex: index,
      id: item.id ?? null,
      uid: item.uid ?? null,
      category: isTooShort ? null : (values.category || null),
      valence: isTooShort ? null : (values.valence || null),
      subcategory: isTooShort ? null : (values.needsSub ? values.subcategory || null : null),
      flagged: elements.flagCheckbox ? !!elements.flagCheckbox.checked : false,
      tooShort: elements.tooShortCheckbox ? !!elements.tooShortCheckbox.checked : false,
      promotional: elements.promotionalCheckbox ? !!elements.promotionalCheckbox.checked : false,
      engagement: elements.engagementCheckbox ? !!elements.engagementCheckbox.checked : false,
      isComplete,
      raterId: state.raterId || null,
      timestamp: melbourneNowISO(),
    };
    saveState();
    updateProgress();
  }

  function updateProgress() {
    const total = dataset.length;
    let done = 0;
    for (let i = 0; i < dataset.length; i++) {
      const key = makeKey(dataset[i]);
      const r = state.ratingsById[key];
      if (r && r.isComplete) done++;
    }
    const pct = total ? Math.round((done / total) * 100) : 0;
    elements.progressText.textContent = `${done}/${total} labelled`;
    elements.progressBar.style.width = `${pct}%`;
    
    // Update background color based on progress
    updateBackgroundColor(pct);
  }

  function updateBackgroundColor(progressPercent) {
    // Start with the original dark background (#0f1216)
    const baseColor = [15, 18, 22]; // RGB values for #0f1216
    
    // Pink color to blend towards
    const pinkColor = [171, 0, 120];
    
    // Calculate how much pink to blend in (0 = no pink, 1 = full pink)
    const pinkIntensity = progressPercent / 100;
    
    // Blend the colors
    const blendedColor = baseColor.map((base, i) => {
      return Math.round(base + (pinkColor[i] - base) * pinkIntensity);
    });
    
    // Apply the blended color to the body background
    document.body.style.background = `rgb(${blendedColor[0]}, ${blendedColor[1]}, ${blendedColor[2]})`;
    
    // Also update the CSS custom property for consistency
    document.documentElement.style.setProperty('--bg', `rgb(${blendedColor[0]}, ${blendedColor[1]}, ${blendedColor[2]})`);
  }

  // Safe event binding helper (no-op if element missing)
  function on(el, event, handler) {
    if (el && el.addEventListener) {
      el.addEventListener(event, handler);
    }
  }

  // Navigation
  function go(delta) {
    if (!dataset.length) return;
    const next = Math.min(Math.max(index + delta, 0), dataset.length - 1);
    if (next === index) return;
    index = next;
    render();
  }

  // Export
  function exportJson() {
    // Ensure all ratings carry the current raterId
    const ratings = Object.values(state.ratingsById).map((r) => ({
      ...r,
      raterId: state.raterId || r.raterId || null,
    }));
    const payload = {
      raterId: state.raterId || null,
      createdAt: melbourneNowISO(),
      datasetSize: dataset.length,
      ratings,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ratings_${state.raterId || "anon"}_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // Event bindings
  on(elements.loadSampleBtn, "click", async () => {
    try {
      const res = await fetch("sample_twenty.json");
      const text = await res.text();
      // Replace bareword NaN with null to make valid JSON
      const fixed = text.replace(/\bNaN\b/g, "null");
      const json = JSON.parse(fixed);
      if (!Array.isArray(json)) throw new Error("JSON must be an array");
      setDataset(json);
    } catch (e) {
      alert(
        "Failed to load sample_twenty.json. If running from file:// some browsers block fetch; use a local server.\n\n" +
          e
      );
    }
  });

  on(elements.fileInput, "change", async (ev) => {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    const text = await file.text();
    try {
      const fixed = text.replace(/\bNaN\b/g, "null");
      const json = JSON.parse(fixed);
      if (!Array.isArray(json)) throw new Error("JSON must be an array");
      setDataset(json);
    } catch (e) {
      alert("Invalid JSON: " + e);
    }
  });

  on(elements.exportBtn, "click", exportJson);

  on(elements.prevBtn, "click", () => {
    // save partial before navigating
    savePartialProgress();
    go(-1);
  });
  on(elements.nextBtn, "click", () => {
    // Save partial and advance regardless of completion
    savePartialProgress();
    go(1);
  });
  on(elements.clearBtn, "click", () => {
    clearForm();
    savePartialProgress();
  });
  on(elements.jumpBtn, "click", () => {
    const val = parseInt(elements.jumpInput.value, 10);
    if (!Number.isFinite(val)) return;
    const target = val - 1;
    if (target >= 0 && target < dataset.length) {
      savePartialProgress();
      index = target;
      render();
    } else {
      alert(`Please enter a number between 1 and ${dataset.length}.`);
    }
  });

  on(elements.ratingsForm, "change", (e) => {
    if (e.target && e.target.name === "category") {
      toggleSubcategory();
    }
    // Always autosave partial selections to localStorage
    savePartialProgress();
  });

  on(elements.flagCheckbox, "change", () => {
    savePartialProgress();
  });

  on(elements.tooShortCheckbox, "change", () => {
    // If "too short to code" is selected, clear other form fields
    if (elements.tooShortCheckbox.checked) {
      elements.ratingsForm.reset();
      elements.subcategoryGroup.classList.add("hidden");
    }
    savePartialProgress();
  });

  on(elements.promotionalCheckbox, "change", () => {
    savePartialProgress();
  });

  on(elements.engagementCheckbox, "change", () => {
    savePartialProgress();
  });

  on(elements.raterIdInput, "input", () => {
    state.raterId = elements.raterIdInput.value.trim();
    // Backfill/update raterId on all saved ratings so exports are consistent
    propagateRaterIdAcrossRatings();
    saveState();
  });

  // Keyboard shortcuts
  window.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      savePartialProgress();
      go(-1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      savePartialProgress();
      go(1);
    }
  });

  // Init
  loadState();
  // Backfill raterId into any existing ratings that may have been saved without it
  propagateRaterIdAcrossRatings();
  saveState();
  elements.raterIdInput.value = state.raterId || "";
  setDataset([]);
})();
