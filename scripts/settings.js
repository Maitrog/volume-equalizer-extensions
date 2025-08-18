document.getElementById("export-presets").addEventListener("click", () => {
  chrome.storage.local.get(["presets", "presetNames"]).then((result) => {
    var json = JSON.stringify(result);
    saveTextAsFile(json, "eq_toolkit_presets.json");
  });
});

function saveTextAsFile(text, filename = "file.txt") {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });

  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);

  a.click();

  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const input = document.getElementById("import-input");
document.getElementById("import-presets").addEventListener("click", () => {
  input.click();
});

input.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    var presetsInfo = JSON.parse(reader.result);
    chrome.storage.local.get(["presets", "presetNames"]).then((prefs) => {
      const presets = prefs.presets ?? {};
      const presetNames = prefs.presetNames ?? [];
      presetsInfo.presetNames.forEach((name) => {
        const needAdd = !presetNames.includes(name);
        if (needAdd) {
          presetNames.push(name);
          addPresetToDropdown(name);
          presets[name] = presetsInfo.presets[name];
        }
      });
      chrome.storage.local.set({
        presets: presets,
        presetNames: presetNames,
      });
    });
  };
  reader.readAsText(file, "utf-8");
});

document.getElementById("enable-spectrum").addEventListener("change", (e) => {
  const value = e.target.checked;

  chrome.storage.local.set({
    enableSpectrum: value,
  });
});
