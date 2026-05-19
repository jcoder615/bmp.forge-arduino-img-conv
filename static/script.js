// bmp.forge — frontend
const $ = (s) => document.querySelector(s);

const dropZone   = $("#drop");
const fileInput  = $("#file-input");
const browseBtn  = $("#browse-btn");
const queueWrap  = $("#queue-wrap");
const queueList  = $("#queue");
const queueCount = $("#queue-count");
const clearBtn   = $("#clear-btn");
const convertBtn = $("#convert-btn");
const statusEl   = $("#status");

const ALLOWED = /\.(jpe?g|jpe|jfif)$/i;
const MAX_BYTES = 200 * 1024 * 1024; // 200 MB total

let queue = []; // File[]

// ── Helpers ────────────────────────────────────────────────
const fmtSize = (b) => {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(2)} MB`;
};

const setStatus = (msg, cls = "") => {
  statusEl.textContent = msg;
  statusEl.className = "status" + (cls ? " " + cls : "");
};

const render = () => {
  queueList.innerHTML = "";
  queue.forEach((f, i) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <span class="fname">${f.name}</span>
      <span class="fsize">${fmtSize(f.size)}</span>
      <button class="remove" data-i="${i}" title="remove">×</button>
    `;
    queueList.appendChild(li);
  });
  queueCount.textContent = `${queue.length} file${queue.length === 1 ? "" : "s"}`;
  queueWrap.hidden = queue.length === 0;
  convertBtn.disabled = queue.length === 0;
};

const addFiles = (filesLike) => {
  const incoming = Array.from(filesLike);
  let rejected = 0;
  for (const f of incoming) {
    if (!ALLOWED.test(f.name)) { rejected++; continue; }
    // de-dupe by name+size
    if (queue.some((q) => q.name === f.name && q.size === f.size)) continue;
    queue.push(f);
  }
  const totalBytes = queue.reduce((s, f) => s + f.size, 0);
  if (totalBytes > MAX_BYTES) {
    queue = [];
    setStatus("Total exceeds 200 MB limit. Cleared queue.", "err");
  } else if (rejected) {
    setStatus(`Skipped ${rejected} non-JPEG file${rejected === 1 ? "" : "s"}.`, "err");
  } else {
    setStatus("");
  }
  render();
};

// ── Events ─────────────────────────────────────────────────
browseBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  fileInput.click();
});
dropZone.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", (e) => addFiles(e.target.files));

["dragenter", "dragover"].forEach((ev) =>
  dropZone.addEventListener(ev, (e) => {
    e.preventDefault();
    dropZone.classList.add("dragover");
  })
);
["dragleave", "drop"].forEach((ev) =>
  dropZone.addEventListener(ev, (e) => {
    e.preventDefault();
    dropZone.classList.remove("dragover");
  })
);
dropZone.addEventListener("drop", (e) => addFiles(e.dataTransfer.files));

// prevent the browser from opening files dropped outside the zone
["dragover", "drop"].forEach((ev) =>
  window.addEventListener(ev, (e) => e.preventDefault())
);

queueList.addEventListener("click", (e) => {
  const btn = e.target.closest(".remove");
  if (!btn) return;
  queue.splice(parseInt(btn.dataset.i, 10), 1);
  render();
});

clearBtn.addEventListener("click", () => {
  queue = [];
  fileInput.value = "";
  setStatus("");
  render();
});

convertBtn.addEventListener("click", async () => {
  if (queue.length === 0) return;
  convertBtn.disabled = true;
  setStatus(`<span class="spinner"></span> converting ${queue.length} file${queue.length === 1 ? "" : "s"}…`);
  statusEl.innerHTML = `<span class="spinner"></span> converting ${queue.length} file${queue.length === 1 ? "" : "s"}…`;

  const fd = new FormData();
  for (const f of queue) fd.append("files", f, f.name);

  try {
    const res = await fetch("/api/convert", { method: "POST", body: fd });
    if (!res.ok) {
      let msg = `Server error (${res.status})`;
      try { const j = await res.json(); if (j.error) msg = j.error; } catch {}
      throw new Error(msg);
    }
    const blob = await res.blob();
    const cd = res.headers.get("Content-Disposition") || "";
    const m = /filename="?([^"]+)"?/.exec(cd);
    const filename = m ? m[1] : (queue.length === 1 ? "converted.bmp" : "converted_bmps.zip");

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    setStatus(`done · downloaded ${filename}`, "ok");
  } catch (err) {
    setStatus(err.message || "Conversion failed", "err");
  } finally {
    convertBtn.disabled = false;
  }
});

render();
