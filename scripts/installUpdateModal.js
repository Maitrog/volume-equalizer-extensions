function getPendingInstallUpdateNotice(stored) {
  const notice = stored[INSTALL_UPDATE_NOTICE_KEY];
  if (isToolkitWindow) return null;
  if (!notice || typeof notice !== "object") return null;
  if (!["install", "update"].includes(notice.reason)) return null;
  if (notice.version !== chrome.runtime.getManifest().version) return null;
  return notice;
}

function showInstallUpdateNotice(stored) {
  const notice = getPendingInstallUpdateNotice(stored);
  const modal = document.getElementById("install-update-notice-modal");
  if (!notice || !modal) return;

  modal.style.display = "block";
}

async function closeInstallUpdateNotice() {
  const modal = document.getElementById("install-update-notice-modal");
  if (modal) modal.style.display = "none";
  await chrome.storage.local.remove(INSTALL_UPDATE_NOTICE_KEY);
}

const installUpdateNoticeCloseBtn = document.getElementById(
  "install-update-notice-close"
);

if (installUpdateNoticeCloseBtn) {
  installUpdateNoticeCloseBtn.addEventListener(
    "click",
    closeInstallUpdateNotice
  );
}
