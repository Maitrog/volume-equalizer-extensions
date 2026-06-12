const addToWhitelistBtn = document.getElementById(
  "add-to-autostart-whitelist-btn"
);
const autostartModal = document.getElementById("autostart-modal");
const autostartCloseBtn = document.getElementById("autostart-modal-close");
const autostartCancelBtn = document.getElementById("autostart-modal-cancel");
const autostartConfirmBtn = document.getElementById("autostart-modal-confirm");
const autostartPreset = document.getElementById("autostart-modal-preset");
const autostartModalError = document.getElementById("autostart-modal-error");
const autostartModalDomainValue = document.getElementById(
  "autostart-modal-domain-value"
);
const autostartModalUrlValue = document.getElementById(
  "autostart-modal-url-value"
);

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  return tab ?? null;
}

function setAutostartSettingsError(element, messageName) {
  if (!element) return;
  element.textContent = messageName ? getLocalizedMessage(messageName) : "";
  element.style.display = messageName ? "block" : "none";
}

function fillPresetSelect(select, presetNames, selectedName = "") {
  if (!select) return;
  select.textContent = "";

  const emptyOption = document.createElement("option");
  emptyOption.value = "";
  emptyOption.textContent = getLocalizedMessage(
    "autostart_settings_select_preset_placeholder"
  );
  select.appendChild(emptyOption);

  (presetNames ?? []).forEach((name) => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    select.appendChild(option);
  });

  select.value = selectedName;
}

async function refreshAutostartSettingsPresetValueSelects() {
  const { presetNames } = await chrome.storage.local.get(["presetNames"]);
  fillPresetSelect(autostartPreset, presetNames ?? []);
  fillPresetSelect(autostartSettingsPresetValue, presetNames ?? []);
}

function formatWhitelistEntry(entry) {
  const typeLabel =
    entry.type === "url"
      ? getLocalizedMessage("autostart_rule_type_url_label")
      : getLocalizedMessage("autostart_rule_type_domain_label");
  return `${typeLabel}: ${entry.value}`;
}

async function saveWhitelistEntry(type, value, presetName, errorElement) {
  const entry = createWhitelistEntry(type, value, presetName);
  if (!entry) {
    setAutostartSettingsError(errorElement, "autostart_validation_error");
    return false;
  }

  const { whitelist } = await chrome.storage.local.get(["whitelist"]);
  const entries = (whitelist ?? []).filter((item) => item.id !== entry.id);
  entries.push(entry);
  await chrome.storage.local.set({ ["whitelist"]: entries });
  setAutostartSettingsError(errorElement, "");
  return true;
}

async function removeWhitelistEntry(id) {
  const { whitelist } = await chrome.storage.local.get(["whitelist"]);
  const entries = (whitelist ?? []).filter((entry) => entry.id !== id);
  await chrome.storage.local.set({ ["whitelist"]: entries });
}

function closeWhitelistModal() {
  autostartModal.style.display = "none";
}

if (addToWhitelistBtn) {
  addToWhitelistBtn.addEventListener("click", async () => {
    if (isToolkitWindow) return;

    const tab = await getActiveTab();
    if (autostartModalDomainValue) {
      autostartModalDomainValue.textContent = getWhitelistDomain(tab?.url);
    }
    if (autostartModalUrlValue) {
      autostartModalUrlValue.textContent = normalizeWhitelistUrl(tab?.url);
    }
    await refreshAutostartSettingsPresetValueSelects();
    setAutostartSettingsError(autostartModalError, "");
    autostartModal.style.display = "block";
  });
}

autostartCloseBtn.addEventListener("click", closeWhitelistModal);
autostartCancelBtn.addEventListener("click", closeWhitelistModal);

autostartModal.addEventListener("click", (event) => {
  if (event.target === autostartModal) closeWhitelistModal();
});

autostartConfirmBtn.addEventListener("click", async () => {
  const tab = await getActiveTab();
  const selectedType = document.querySelector(
    "input[name='autostart-modal-add-type']:checked"
  )?.value;
  const saved = await saveWhitelistEntry(
    selectedType,
    tab?.url,
    autostartPreset.value,
    autostartModalError
  );
  if (saved) closeWhitelistModal();
});

// ********************
// Autostart whitelist setting
// ********************
const autostartSettingsList = document.getElementById(
  "autostart-settings-list"
);
const autostartSettingsTypeValue = document.getElementById(
  "autostart-settings-type"
);
const autostartSettingsUrlValue = document.getElementById(
  "autostart-settings-add-value"
);
const autostartSettingsPresetValue = document.getElementById(
  "autostart-settings-add-preset"
);
const autostartSettingsAddBtn = document.getElementById(
  "autostart-settings-add-btn"
);
const autostartSettingsError = document.getElementById(
  "autostart-settings-error"
);

async function renderWhitelist() {
  if (!autostartSettingsList) return;

  const { whitelist } = await chrome.storage.local.get(["whitelist"]);
  const entries = whitelist ?? [];
  autostartSettingsList.textContent = "";

  if (entries.length === 0) {
    const empty = document.createElement("div");
    empty.className = "whitelist-empty";
    empty.textContent = getLocalizedMessage("autostart_whitelist_empty");
    autostartSettingsList.appendChild(empty);
    return;
  }

  entries.forEach((entry) => {
    const item = document.createElement("div");
    item.className = "whitelist-item";

    const text = document.createElement("div");
    text.className = "whitelist-item-text";

    const value = document.createElement("span");
    value.textContent = formatWhitelistEntry(entry);

    const preset = document.createElement("small");
    preset.textContent = `${getLocalizedMessage(
      "autostart_modal_preset_label"
    )}: ${entry.presetName}`;

    text.append(value, preset);

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "whitelist-delete";
    deleteBtn.textContent = "\u00d7";
    deleteBtn.setAttribute("aria-label", getLocalizedMessage("delete"));
    deleteBtn.addEventListener("click", () => removeWhitelistEntry(entry.id));

    item.append(text, deleteBtn);
    autostartSettingsList.appendChild(item);
  });
}

autostartSettingsAddBtn.addEventListener("click", async () => {
  const saved = await saveWhitelistEntry(
    autostartSettingsTypeValue.value,
    autostartSettingsUrlValue.value,
    autostartSettingsPresetValue.value,
    autostartSettingsError
  );
  if (saved) autostartSettingsUrlValue.value = "";
});

/**
 * Other
 */
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  if (changes.whitelist) renderWhitelist();
  if (changes.presetNames) refreshAutostartSettingsPresetValueSelects();
});

refreshAutostartSettingsPresetValueSelects();
renderWhitelist();
