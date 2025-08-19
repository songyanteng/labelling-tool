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
    clearBtn: document.getElementById("clearBtn"),
    saveBtn: document.getElementById("saveBtn"),
    saveNextBtn: document.getElementById("saveNextBtn"),
  };

  const state = {
    ratingsById: /** @type {Record<string, any>} */ ({}),
    raterId: "",
  };

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
  }

  function toggleSubcategory() {
    const category = elements.ratingsForm.category.value || "";
    const needs = /[23]$/.test(category);
    elements.subcategoryGroup.classList.toggle("hidden", !needs);
  }

  function validate(values) {
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

    state.ratingsById[key] = {
      itemIndex: index,
      id: item.id ?? null,
      uid: item.uid ?? null,
      category: values.category,
      valence: values.valence,
      subcategory: values.needsSub ? values.subcategory : null,
      raterId: state.raterId || null,
      timestamp: new Date().toISOString(),
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
      values.category &&
      values.valence &&
      (!values.needsSub || values.subcategory)
    );
    state.ratingsById[key] = {
      itemIndex: index,
      id: item.id ?? null,
      uid: item.uid ?? null,
      category: values.category || null,
      valence: values.valence || null,
      subcategory: values.needsSub ? values.subcategory || null : null,
      flagged: elements.flagCheckbox ? !!elements.flagCheckbox.checked : false,
      isComplete,
      raterId: state.raterId || null,
      timestamp: new Date().toISOString(),
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
    const ratings = Object.values(state.ratingsById);
    const payload = {
      raterId: state.raterId || null,
      createdAt: new Date().toISOString(),
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

  on(elements.raterIdInput, "input", () => {
    state.raterId = elements.raterIdInput.value.trim();
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
  elements.raterIdInput.value = state.raterId || "";
  setDataset([]);
})();
