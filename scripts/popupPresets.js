function addPresetToDropdown(name) {
  const option = document.createElement("div");
  option.textContent = name;
  option.setAttribute("data-value", name);
  option.className = "dropdown-item";

  const closeBtn = document.createElement("span");
  closeBtn.className = "close-btn";
  closeBtn.textContent = "\u00d7";
  closeBtn.setAttribute("data-value", name);
  option.appendChild(closeBtn);

  document.getElementById("presets-menu").appendChild(option);
}

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
    chrome.storage.local
      .get(["presets", "presetNames", "whitelist"])
      .then(async (prefs) => {
        if (isPresetUsedInWhitelist(prefs.whitelist, choice)) {
          alert(chrome.i18n.getMessage("preset_delete_error"));
          return;
        }

        const item = e.target.parentElement;
        item.remove();
        const presets = prefs.presets ?? {};
        const presetNames = (prefs.presetNames ?? []).filter(
          (n) => n != choice
        );
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
      setPoints(presets[choice]);
      const filters = pointsToFilters(points);
      const tabId = await getCurrentTabId();
      const values = {
        ["filters." + tabId]: filters,
        ["filters"]: filters,
      };
      if (!isToolkitWindow) values["enabled." + tabId] = true;
      chrome.storage.local.set(values);
      mainResize();
      refreshToolkitCaptureFilters();
    });
    menu.style.display = "none";
  }
});
