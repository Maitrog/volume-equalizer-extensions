let dragIndex = null;
const canvas = document.getElementById("eq-canvas");
const ctx = canvas.getContext("2d", { alpha: true });
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

const logMin = Math.log10(1);
const logMax = Math.log10(22000);
const pointCount = 5;

function xToFrequency(x, canvasWidth = null) {
  canvasWidth ??= canvas.width - 10;
  const freq = Math.pow(
    10,
    Math.sqrt(x / canvasWidth) * (logMax - logMin) + logMin
  );
  return freq > 24000 ? 24000 : freq;
}

function frequencyToX(freq, canvasWidth = null) {
  freq = freq > 24000 ? 24000 : freq;
  canvasWidth ??= canvas.width - 10;
  const x =
    Math.pow((Math.log10(freq) - logMin) / (logMax - logMin), 2) * canvasWidth;
  return x;
}

function yToDb(y, canvasHeight = null) {
  canvasHeight ??= canvas.height;
  return ((canvasHeight / 2 - y) / (canvasHeight / 2 - 20)) * 25;
}

function dbToGain(db) {
  let gain;
  if (db >= 0) {
    gain = 1 + db / 3;
  } else {
    gain = 1.5 / Math.abs(db);
  }

  return gain;
}

function initPoints() {
  const centerY = canvas.height / 2;
  points = Array.from({ length: pointCount }, (_, i) => {
    const point = {
      x: (canvas.width / (pointCount + 1)) * (i + 1),
      y: centerY,
    };
    return point;
  });
}

function setPoints(filters) {
  points = filters.map((filter) => {
    return { x: filter.x, y: filter.y };
  });
}

function mainResize() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  resizeCanvas();
  drawFilter();
}

async function mainLoad() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  resizeCanvas();
  const id = await getCurrentTabId();
  const result = await chrome.storage.local.get([
    "filters",
    "filters." + id,
    "gain." + id,
    "presetNames",
    "enabled." + id,
    "mute." + id,
    "enableSpectrum",
  ]);
  if (
    result["filters." + id] != null &&
    result["filters." + id] != undefined &&
    result["filters." + id].length != 0
  )
    setPoints(result["filters." + id]);
  else if (
    result["filters"] != null &&
    result["filters"] != undefined &&
    result["filters"].length != 0
  )
    setPoints(result["filters"]);
  else initPoints();

  if (result["gain." + id] != null && result["gain." + id] != undefined)
    document.getElementById("master-volume").value = result["gain." + id];

  drawFilter();

  setEnableBtnText(result["enabled." + id] ?? false);
  setMuteBtnClass(result["mute." + id] ?? false);

  if (result["enableSpectrum"] === true) {
    document.getElementById("enable-spectrum").checked = true;
  }

  if (result.presetNames) {
    result.presetNames.forEach((name) => {
      addPresetToDropdown(name);
    });
  }
}

window.addEventListener("resize", mainResize);
window.addEventListener("load", mainLoad);

canvas.addEventListener("mousedown", (e) => {
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  points.forEach((p, i) => {
    if (Math.hypot(p.x - mx, p.y - my) < pointRadius + 2) {
      dragIndex = i;
      return;
    }
  });
});

window.addEventListener("mouseup", () => {
  dragIndex = null;
});

function addPresetToDropdown(name) {
  var option = document.createElement("div");
  option.textContent = name;
  option.setAttribute("data-value", name);
  option.className = "dropdown-item";
  var closeBtn = document.createElement("span");
  closeBtn.className = "close-btn";
  closeBtn.textContent = "×";
  closeBtn.setAttribute("data-value", name);
  option.appendChild(closeBtn);
  document.getElementById("presets-menu").appendChild(option);
}

function pointsToFilters(points) {
  const filters = points.map((p) => {
    return { freq: xToFrequency(p.x), gain: yToDb(p.y), x: p.x, y: p.y };
  });
  return filters;
}

canvas.addEventListener("mousemove", async (e) => {
  if (dragIndex !== null) {
    const rect = canvas.getBoundingClientRect();
    let mx = e.clientX - rect.left;
    let my = e.clientY - rect.top;
    if (mx > 0) {
      mx = Math.max(0, Math.min(canvas.width, mx));
      my = Math.max(0, Math.min(canvas.height, my));
      points[dragIndex] = { x: mx, y: my };
      mainResize();
      var tabId = await getCurrentTabId();
      var newFilters = pointsToFilters(points);
      chrome.storage.local.set({
        ["filters." + tabId]: newFilters,
        ["filters"]: newFilters,
        ["enabled." + tabId]: true,
      });
    }
  }
});

document.getElementById("change-eq").addEventListener("click", async () => {
  const tabId = await getCurrentTabId();
  chrome.storage.local.get(["enabled." + tabId]).then((result) => {
    chrome.storage.local.set({
      ["enabled." + tabId]: !result["enabled." + tabId],
    });
  });
});

chrome.storage.onChanged.addListener(async (ps) => {
  const tabId = await getCurrentTabId();
  if (tabId == null || tabId == undefined) return;
  if (ps["enabled." + tabId]) setEnableBtnText(ps["enabled." + tabId].newValue);
  if (ps["mute." + tabId]) setMuteBtnClass(ps["mute." + tabId].newValue);
});

document.getElementById("reset").addEventListener("click", async () => {
  document.getElementById("master-volume").value = 0;
  initPoints();
  mainResize();
  pointsToFilters(points);

  const tabId = await getCurrentTabId();
  chrome.storage.local.set({
    ["volume." + tabId]: 1,
    ["gain." + tabId]: 0,
    ["filters." + tabId]: pointsToFilters(points),
  });
});

const slider = document.getElementById("master-volume");
slider.oninput = async () => {
  let volume = dbToGain(slider.value);
  const tabId = await getCurrentTabId();
  chrome.storage.local.set({
    ["volume." + tabId]: volume,
    ["gain." + tabId]: slider.value,
    ["enabled." + tabId]: true,
  });
};

document.getElementById("save-preset").addEventListener("click", async () => {
  const nameInput = document.getElementById("preset-name");
  const name = nameInput.value;

  if (name.length == 0) return;

  let needAdd = true;
  const tabId = await getCurrentTabId();
  chrome.storage.local
    .get(["filters." + tabId, "presets", "presetNames"])
    .then((prefs) => {
      const presets = prefs.presets ?? {};
      const presetNames = prefs.presetNames ?? [];
      presets[name] = prefs["filters." + tabId];
      needAdd = !presetNames.includes(name);
      if (needAdd) presetNames.push(name);
      chrome.storage.local.set({
        presets: presets,
        presetNames: presetNames,
      });
      if (needAdd) addPresetToDropdown(name);
    });

  nameInput.value = "";
});

function setEnableBtnText(enabled) {
  if (!enabled)
    document.getElementById("change-eq").textContent =
      chrome.i18n.getMessage("enable_eq");
  else
    document.getElementById("change-eq").textContent =
      chrome.i18n.getMessage("stop_eq");
}

async function getCurrentTabId() {
  let queryOptions = { active: true, lastFocusedWindow: true };
  let [tab] = await chrome.tabs.query(queryOptions);
  return tab?.id;
}

const dropdown = document.getElementById("presets");
const toggle = document.getElementById("presets-toggle");
const menu = document.getElementById("presets-menu");
toggle.addEventListener("click", () => {
  menu.style.display = menu.style.display === "block" ? "none" : "block";
});
document.addEventListener("click", (e) => {
  if (!dropdown.contains(e.target)) menu.style.display = "none";
});
menu.addEventListener("click", (e) => {
  const choice = e.target.getAttribute("data-value");
  if (choice == "none") {
    toggle.textContent = choice;
    menu.style.display = "none";
    return;
  }

  if (e.target.classList.contains("close-btn")) {
    const item = e.target.parentElement;
    item.remove();
    chrome.storage.local.get(["presets", "presetNames"]).then(async (prefs) => {
      const presets = prefs.presets;
      const presetNames = prefs.presetNames.filter((n) => n != choice);
      delete presets[choice];

      chrome.storage.local.set({
        presets: presets,
        presetNames: presetNames,
      });
    });
  } else if (e.target.classList.contains("dropdown-item")) {
    toggle.textContent = choice;
    chrome.storage.local.get(["presets"]).then(async (prefs) => {
      if (!prefs.presets) return;

      const presets = prefs.presets;
      const tabId = await getCurrentTabId();
      chrome.storage.local.set({
        ["filters." + tabId]: presets[choice],
        ["enabled." + tabId]: true,
      });
      setPoints(presets[choice]);
      mainResize();
    });
    menu.style.display = "none";
  }
});

document.getElementById("volume-mute").addEventListener("click", async () => {
  const tabId = await getCurrentTabId();
  chrome.storage.local.set({ ["enabled." + tabId]: true }).then(() =>
    chrome.storage.local.get(["mute." + tabId]).then((result) => {
      chrome.storage.local.set({
        ["mute." + tabId]: !result["mute." + tabId],
      });
    })
  );
});

function setMuteBtnClass(newValue) {
  var elem = document.getElementById("volume-mute");
  if (newValue) elem.className = "volume-mute-active";
  else elem.className = "volume-mute";
}

const modal = document.getElementById("settings-modal");
const btn = document.getElementById("settings-btn");
const span = document.getElementById("close-settings");

btn.onclick = function () {
  modal.style.display = "block";
};
span.onclick = function () {
  modal.style.display = "none";
};
window.onclick = function (event) {
  if (event.target === modal) {
    modal.style.display = "none";
  }
};

// document.getElementById("experimental-mode").addEventListener("click", () => {
//   window.close();
//   chrome.runtime.sendMessage({ method: "enableExperimentalMode" });
// });
