const $ = (id) => document.getElementById(id);
const els = {
  file: $('fileInput'), upload: $('uploadBox'), fileInfo: $('fileInfo'), fileName: $('fileName'), clear: $('clearFile'),
  remove: $('removeBg'), bgStatus: $('bgStatus'), width: $('widthInput'), height: $('heightInput'), unit: $('unitSelect'), lock: $('lockRatio'), swap: $('swapSize'), copies: $('copiesInput'), gap: $('gapInput'),
  paper: $('paper'), grid: $('sheetGrid'), empty: $('emptySheet'), stats: $('sheetStats'), fit: $('fitCount'), actual: $('actualSize'), download: $('downloadBtn'), exportTitle: $('exportTitle'), exportSub: $('exportSub'), toast: $('toast'), theme: $('themeToggle'),
  openCrop: $('openCrop'), cropModal: $('cropModal'), cropViewport: $('cropViewport'), closeCrop: $('closeCrop'), cancelCrop: $('cancelCrop'), applyCrop: $('applyCrop'), resetCrop: $('resetCrop'),
  addToSheet: $('addToSheet'), sheetItems: $('sheetItems'), itemCount: $('itemCount')
};

const A4 = { portrait: [21, 29.7], landscape: [29.7, 21] };
const UNIT_TO_CM = { cm: 1, mm: 0.1, in: 2.54 };
const UNIT_LABEL = { cm: 'cm', mm: 'mm', in: 'in' };
let originalImage = null, originalUrl = '', processedUrl = '', originalRatio = 1, orientation = 'portrait', selectedShape = 'original';
let crop = { zoom: 1, x: 0, y: 0 }, cropDraft = null, modalDrag = null, sheetItems = [];

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function numberValue(input) { return parseFloat(input.value) || 0; }
function unitFactor() { return UNIT_TO_CM[els.unit.value]; }
function cm(input) { return numberValue(input) * unitFactor(); }
function round(value) { return Number(value.toFixed(els.unit.value === 'in' ? 2 : 1)); }
function measure(value) { return `${round(value / unitFactor())} ${UNIT_LABEL[els.unit.value]}`; }
function hasCrop(value = crop) { return value.zoom > 1.001 || Math.abs(value.x) > .1 || Math.abs(value.y) > .1; }
function showToast(message) { els.toast.textContent = message; els.toast.classList.add('show'); setTimeout(() => els.toast.classList.remove('show'), 2300); }

function updateUnitLabels() {
  document.querySelectorAll('.unit-label').forEach((label) => { label.textContent = UNIT_LABEL[els.unit.value]; });
  const step = els.unit.value === 'in' ? '.01' : els.unit.value === 'mm' ? '1' : '.1';
  [els.width, els.height, els.gap].forEach((input) => { input.step = step; });
}
function updateHeight() { if (els.lock.checked && originalImage) els.height.value = round(numberValue(els.width) / originalRatio); }
function updateWidth() { if (els.lock.checked && originalImage) els.width.value = round(numberValue(els.height) * originalRatio); }
function currentLayout() {
  const [sheetW, sheetH] = A4[orientation];
  return { sheetW, sheetH, w: clamp(cm(els.width), .5, 40), h: clamp(cm(els.height), .5, 40), gap: clamp(cm(els.gap), 0, 4) };
}
function workingItem() {
  if (!originalImage) return null;
  const size = currentLayout();
  return { id: 'working', name: els.fileName.textContent || 'New topper', url: processedUrl, ratio: originalRatio, shape: selectedShape, crop: { ...crop }, w: size.w, h: size.h, gap: size.gap, copies: clamp(Math.round(numberValue(els.copies)), 1, 99) };
}
function placements() {
  const [sheetW, sheetH] = A4[orientation], margin = .7;
  const designs = [...sheetItems]; const working = workingItem(); if (working) designs.push(working);
  let x = margin, y = margin, rowHeight = 0, requested = 0; const output = [];
  designs.forEach((item) => {
    for (let i = 0; i < item.copies; i += 1) {
      requested += 1;
      if (x + item.w > sheetW - margin && x > margin) { x = margin; y += rowHeight + item.gap; rowHeight = 0; }
      if (y + item.h > sheetH - margin) continue;
      output.push({ item, x, y, w: item.w, h: item.h }); x += item.w + item.gap; rowHeight = Math.max(rowHeight, item.h);
    }
  });
  return { output, requested, sheetW, sheetH };
}
function applyPreviewCrop(art, item) {
  const targetRatio = item.shape === 'square' ? 1 : item.w / item.h;
  if (item.shape === 'original' && !hasCrop(item.crop)) { art.style.backgroundSize = 'contain'; art.style.backgroundPosition = 'center'; return; }
  let width = 100, height = 100;
  if (item.ratio > targetRatio) width = item.ratio / targetRatio * 100; else height = targetRatio / item.ratio * 100;
  art.style.backgroundSize = `${width * item.crop.zoom}% ${height * item.crop.zoom}%`;
  art.style.backgroundPosition = `${50 + item.crop.x / 2}% ${50 + item.crop.y / 2}%`;
}
function renderItems() {
  els.sheetItems.innerHTML = ''; els.itemCount.textContent = `${sheetItems.length} ${sheetItems.length === 1 ? 'item' : 'items'}`;
  if (!sheetItems.length) { els.sheetItems.innerHTML = '<span class="items-empty">Add a prepared photo to build your sheet.</span>'; return; }
  sheetItems.forEach((item, index) => {
    const row = document.createElement('div'); row.className = 'sheet-item';
    const thumb = document.createElement('span'); thumb.className = 'sheet-item-thumb'; thumb.style.backgroundImage = `url("${item.url}")`;
    const info = document.createElement('span'); info.className = 'sheet-item-info';
    const name = document.createElement('strong'); name.textContent = item.name;
    const detail = document.createElement('small'); detail.textContent = `${measure(item.w)} × ${measure(item.h)} · ${item.copies} copies`;
    const remove = document.createElement('button'); remove.className = 'remove-sheet-item'; remove.type = 'button'; remove.textContent = '×'; remove.title = 'Remove from sheet'; remove.dataset.index = index;
    info.append(name, detail); row.append(thumb, info, remove); els.sheetItems.appendChild(row);
  });
}
function updatePreview() {
  const sheet = placements(); els.grid.innerHTML = ''; els.empty.classList.toggle('hidden', sheet.output.length > 0);
  sheet.output.forEach((placement) => {
    const { item } = placement; const slot = document.createElement('div'); slot.className = 'topper-slot';
    slot.style.left = `${placement.x / sheet.sheetW * 100}%`; slot.style.top = `${placement.y / sheet.sheetH * 100}%`; slot.style.width = `${placement.w / sheet.sheetW * 100}%`; slot.style.height = `${placement.h / sheet.sheetH * 100}%`;
    const art = document.createElement('div'); art.className = 'topper-art'; art.style.backgroundImage = `url("${item.url}")`;
    if (item.shape !== 'original') art.classList.add(`mask-${item.shape}`);
    if (item.shape === 'square') { if (item.w >= item.h) { art.style.width = `${item.h / item.w * 100}%`; art.style.height = '100%'; } else { art.style.width = '100%'; art.style.height = `${item.w / item.h * 100}%`; } }
    applyPreviewCrop(art, item); const cut = document.createElement('span'); cut.className = 'cut-line'; slot.append(art, cut); els.grid.appendChild(slot);
  });
  els.stats.textContent = `${sheet.output.length} of ${sheet.requested} placed · ${sheetItems.length + (originalImage ? 1 : 0)} photos`;
  els.fit.textContent = sheet.output.length; els.actual.textContent = sheet.requested > sheet.output.length ? 'Some copies need another sheet' : 'All requested copies fit';
  els.download.disabled = !sheet.output.length; els.remove.disabled = !originalImage; els.openCrop.disabled = !originalImage; els.addToSheet.disabled = !originalImage;
  els.bgStatus.textContent = els.remove.checked ? 'On — switch off to restore original' : 'Off — keep original photo';
  if (sheet.output.length) { els.exportTitle.textContent = sheet.requested > sheet.output.length ? `${sheet.output.length} of ${sheet.requested} copies fit on this sheet` : `A4 sheet with ${sheet.output.length} toppers ready`; els.exportSub.textContent = `PNG · 300 DPI · ${orientation} · ${sheetItems.length + (originalImage ? 1 : 0)} photo designs`; }
  else { els.exportTitle.textContent = 'Your sheet is ready when you are'; els.exportSub.textContent = 'Upload an image to enable your print file.'; }
  renderItems();
}
function readFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const reader = new FileReader(); reader.onload = (event) => { const image = new Image(); image.onload = () => {
    originalImage = image; originalUrl = event.target.result; processedUrl = originalUrl; originalRatio = image.width / image.height; crop = { zoom: 1, x: 0, y: 0 }; els.remove.checked = false; els.fileName.textContent = file.name; els.fileInfo.classList.remove('hidden'); updateHeight(); updatePreview();
  }; image.src = event.target.result; }; reader.readAsDataURL(file);
}
function removeBackground() {
  const scale = Math.min(1, 1400 / Math.max(originalImage.width, originalImage.height)); const w = Math.round(originalImage.width * scale), h = Math.round(originalImage.height * scale);
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h; const context = canvas.getContext('2d', { willReadFrequently: true }); context.drawImage(originalImage, 0, 0, w, h);
  const data = context.getImageData(0, 0, w, h), pixels = data.data; let r = 0, g = 0, b = 0, count = 0; const edge = Math.max(2, Math.round(Math.min(w, h) * .025));
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) if (x < edge || y < edge || x >= w - edge || y >= h - edge) { const i = (y * w + x) * 4; r += pixels[i]; g += pixels[i + 1]; b += pixels[i + 2]; count += 1; }
  r /= count; g /= count; b /= count;
  for (let i = 0; i < pixels.length; i += 4) { const distance = Math.hypot(pixels[i] - r, pixels[i + 1] - g, pixels[i + 2] - b); const saturation = Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) - Math.min(pixels[i], pixels[i + 1], pixels[i + 2]); let alpha = clamp((distance - 18) / 42, 0, 1); if (distance < 35 && saturation < 20) alpha *= .55; pixels[i + 3] = Math.round(pixels[i + 3] * alpha); }
  context.putImageData(data, 0, 0); processedUrl = canvas.toDataURL('image/png');
}
function toggleBackground() { if (!originalImage) return; if (els.remove.checked) { removeBackground(); showToast('Background removed — switch off to restore it'); } else { processedUrl = originalUrl; showToast('Original background restored'); } updatePreview(); }
function updateCropModal() {
  if (!cropDraft || !originalImage) return; const size = currentLayout(); const ratio = ['circle', 'square'].includes(selectedShape) ? 1 : size.w / size.h;
  let width = 100, height = 100; if (originalRatio > ratio) width = originalRatio / ratio * 100; else height = ratio / originalRatio * 100;
  els.cropViewport.style.aspectRatio = String(ratio); els.cropViewport.style.backgroundImage = `url("${processedUrl}")`; els.cropViewport.style.backgroundSize = `${width * cropDraft.zoom}% ${height * cropDraft.zoom}%`; els.cropViewport.style.backgroundPosition = `${50 + cropDraft.x / 2}% ${50 + cropDraft.y / 2}%`;
}
function openCrop() { if (!originalImage) return; cropDraft = { ...crop }; els.cropModal.hidden = false; updateCropModal(); }
function closeCrop() { els.cropModal.hidden = true; cropDraft = null; modalDrag = null; }
function roundedPath(context, x, y, w, h, radius) { context.moveTo(x + radius, y); context.arcTo(x + w, y, x + w, y + h, radius); context.arcTo(x + w, y + h, x, y + h, radius); context.arcTo(x, y + h, x, y, radius); context.arcTo(x, y, x + w, y, radius); }
function clipShape(context, x, y, w, h, shape) {
  const side = Math.min(w, h), sx = x + (w - side) / 2, sy = y + (h - side) / 2;
  if (shape === 'circle') { context.beginPath(); context.arc(x + w / 2, y + h / 2, side / 2, 0, Math.PI * 2); context.clip(); }
  if (shape === 'oval') { context.beginPath(); context.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); context.clip(); }
  if (shape === 'rounded') { context.beginPath(); roundedPath(context, x, y, w, h, Math.min(w, h) * .16); context.clip(); }
  return shape === 'square' ? { x: sx, y: sy, w: side, h: side } : { x, y, w, h };
}
function drawItem(context, image, x, y, w, h, item) {
  context.save(); const target = clipShape(context, x, y, w, h, item.shape); const cover = item.shape !== 'original' || hasCrop(item.crop); const ratio = image.width / image.height; let drawW, drawH, drawX, drawY;
  if (cover) { const scale = Math.max(target.w / image.width, target.h / image.height) * item.crop.zoom; drawW = image.width * scale; drawH = image.height * scale; drawX = target.x + (target.w - drawW) / 2 - item.crop.x / 100 * Math.abs(target.w - drawW) / 2; drawY = target.y + (target.h - drawH) / 2 - item.crop.y / 100 * Math.abs(target.h - drawH) / 2; }
  else if (ratio > target.w / target.h) { drawW = target.w; drawH = drawW / ratio; drawX = target.x; drawY = target.y + (target.h - drawH) / 2; }
  else { drawH = target.h; drawW = drawH * ratio; drawX = target.x + (target.w - drawW) / 2; drawY = target.y; }
  context.drawImage(image, drawX, drawY, drawW, drawH); context.restore();
}
async function exportSheet() {
  const sheet = placements(); if (!sheet.output.length) return; const ppm = 300 / 2.54; const canvas = document.createElement('canvas'); canvas.width = Math.round(sheet.sheetW * ppm); canvas.height = Math.round(sheet.sheetH * ppm); const context = canvas.getContext('2d'); context.fillStyle = '#fffefa'; context.fillRect(0, 0, canvas.width, canvas.height);
  const images = new Map(); await Promise.all(sheet.output.map((placement) => new Promise((resolve) => { if (images.has(placement.item.url)) { resolve(); return; } const image = new Image(); image.onload = () => { images.set(placement.item.url, image); resolve(); }; image.onerror = resolve; image.src = placement.item.url; })));
  sheet.output.forEach((placement) => { const image = images.get(placement.item.url); if (image) drawItem(context, image, placement.x * ppm, placement.y * ppm, placement.w * ppm, placement.h * ppm, placement.item); });
  const link = document.createElement('a'); link.download = 'cake-topper-multi-a4-sheet.png'; link.href = canvas.toDataURL('image/png'); link.click(); showToast('Your multi-photo print sheet has downloaded');
}
function setTheme(theme) { document.documentElement.dataset.theme = theme; const label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'; els.theme.setAttribute('aria-label', label); els.theme.title = label; try { localStorage.setItem('topper-press-theme', theme); } catch (_) {} }
function addCurrentItem() { const item = workingItem(); if (!item) return; item.id = `${Date.now()}-${Math.random()}`; sheetItems.push(item); originalImage = null; originalUrl = ''; processedUrl = ''; els.file.value = ''; els.remove.checked = false; els.fileInfo.classList.add('hidden'); showToast('Topper added — upload the next photo'); updatePreview(); }

els.file.addEventListener('change', (event) => readFile(event.target.files[0]));
['dragenter', 'dragover'].forEach((name) => els.upload.addEventListener(name, (event) => { event.preventDefault(); els.upload.classList.add('dragging'); }));
['dragleave', 'drop'].forEach((name) => els.upload.addEventListener(name, (event) => { event.preventDefault(); els.upload.classList.remove('dragging'); }));
els.upload.addEventListener('drop', (event) => readFile(event.dataTransfer.files[0]));
els.clear.addEventListener('click', () => { originalImage = null; originalUrl = ''; processedUrl = ''; els.file.value = ''; els.remove.checked = false; els.fileInfo.classList.add('hidden'); closeCrop(); updatePreview(); });
els.remove.addEventListener('change', toggleBackground); els.addToSheet.addEventListener('click', addCurrentItem);
els.sheetItems.addEventListener('click', (event) => { const button = event.target.closest('.remove-sheet-item'); if (!button) return; sheetItems.splice(Number(button.dataset.index), 1); updatePreview(); });
els.unit.dataset.previousFactor = UNIT_TO_CM.cm; els.unit.addEventListener('change', () => { const old = Number(els.unit.dataset.previousFactor), next = unitFactor(); [els.width, els.height, els.gap].forEach((input) => { input.value = round(numberValue(input) * old / next); }); els.unit.dataset.previousFactor = next; updateUnitLabels(); updatePreview(); });
els.width.addEventListener('input', () => { updateHeight(); updatePreview(); }); els.height.addEventListener('input', () => { updateWidth(); updatePreview(); }); [els.copies, els.gap].forEach((input) => input.addEventListener('input', updatePreview));
els.swap.addEventListener('click', () => { [els.width.value, els.height.value] = [els.height.value, els.width.value]; updatePreview(); }); $('minusCopy').onclick = () => { els.copies.value = Math.max(1, Math.round(numberValue(els.copies)) - 1); updatePreview(); }; $('plusCopy').onclick = () => { els.copies.value = Math.min(99, Math.round(numberValue(els.copies)) + 1); updatePreview(); };
document.querySelectorAll('.orientation-btn').forEach((button) => button.onclick = () => { orientation = button.dataset.orientation; document.querySelectorAll('.orientation-btn').forEach((item) => item.classList.toggle('selected', item === button)); els.paper.classList.toggle('landscape', orientation === 'landscape'); updatePreview(); });
document.querySelectorAll('.shape-btn').forEach((button) => button.onclick = () => { selectedShape = button.dataset.shape; document.querySelectorAll('.shape-btn').forEach((item) => item.classList.toggle('selected', item === button)); updatePreview(); });
els.openCrop.addEventListener('click', openCrop); els.closeCrop.addEventListener('click', closeCrop); els.cancelCrop.addEventListener('click', closeCrop); els.resetCrop.addEventListener('click', () => { cropDraft = { zoom: 1, x: 0, y: 0 }; updateCropModal(); }); els.applyCrop.addEventListener('click', () => { crop = { ...cropDraft }; closeCrop(); updatePreview(); showToast('Crop applied'); });
els.cropViewport.addEventListener('pointerdown', (event) => { if (!cropDraft) return; const box = els.cropViewport.getBoundingClientRect(), isResize = Boolean(event.target.closest('[data-handle]')); modalDrag = { id: event.pointerId, type: isResize ? 'resize' : 'move', x: cropDraft.x, y: cropDraft.y, zoom: cropDraft.zoom, clientX: event.clientX, clientY: event.clientY, w: box.width, h: box.height, cx: box.left + box.width / 2, cy: box.top + box.height / 2, distance: Math.hypot(event.clientX - (box.left + box.width / 2), event.clientY - (box.top + box.height / 2)) }; els.cropViewport.classList.add('moving'); els.cropViewport.setPointerCapture?.(event.pointerId); event.preventDefault(); });
els.cropViewport.addEventListener('pointermove', (event) => { if (!modalDrag || event.pointerId !== modalDrag.id) return; if (modalDrag.type === 'move') { cropDraft.x = clamp(modalDrag.x - (event.clientX - modalDrag.clientX) / modalDrag.w * 100, -100, 100); cropDraft.y = clamp(modalDrag.y - (event.clientY - modalDrag.clientY) / modalDrag.h * 100, -100, 100); } else cropDraft.zoom = clamp(modalDrag.zoom * Math.hypot(event.clientX - modalDrag.cx, event.clientY - modalDrag.cy) / Math.max(1, modalDrag.distance), 1, 3); updateCropModal(); });
['pointerup', 'pointercancel'].forEach((name) => els.cropViewport.addEventListener(name, (event) => { if (modalDrag && event.pointerId === modalDrag.id) { modalDrag = null; els.cropViewport.classList.remove('moving'); } }));
els.download.addEventListener('click', exportSheet); els.theme.addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
try { setTheme(localStorage.getItem('topper-press-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')); } catch (_) { setTheme('light'); }
updateUnitLabels(); updatePreview();
