;(function (global) {
  'use strict';

  let _state = { uploaded: false, items: [], imageCID: '', metaCID: '', imageBaseUrl: '', metaBaseUrl: '', count: 0 };

  async function uploadFiles(files, metadata, onProgress) {
    const progress = onProgress || (() => {});
    const fileArr  = Array.from(files).sort((a, b) => (parseInt(a.name) || 0) - (parseInt(b.name) || 0));

    if (!fileArr.length) throw new Error('No files selected');
    if (fileArr.some(f => !f.type.startsWith('image/')))
      throw new Error('All files must be images (PNG, JPG, GIF, SVG)');

    progress(5, `Preparing ${fileArr.length} image files…`);

    const form = new FormData();
    form.append('collectionName',   metadata.name        || 'My Collection');
    form.append('collectionSymbol', metadata.symbol      || 'NFT');
    form.append('description',      metadata.description || '');
    form.append('royaltyBps',       String(Math.round((parseFloat(metadata.royalty || '5')) * 100)));
    form.append('creatorAddress',   metadata.creatorAddress || '');

    fileArr.forEach((file, i) => {
      const ext     = file.name.split('.').pop();
      const renamed = new File([file], `${i + 1}.${ext}`, { type: file.type });
      form.append('files', renamed);
    });

    progress(15, 'Uploading to IPFS via NFT.Storage…');

    const res  = await fetch('/.netlify/functions/upload-assets', { method: 'POST', body: form });
    const data = await res.json();

    progress(90, 'Finalising…');

    if (!res.ok || !data.success) throw new Error(data.error || 'Upload failed');

    _state = {
      uploaded    : true,
      items       : data.items,
      imageCID    : data.imageCID,
      metaCID     : data.metaCID,
      imageBaseUrl: data.imageBaseUrl,
      metaBaseUrl : data.metaBaseUrl,
      count       : data.count,
    };

    progress(100, `✅ ${data.count} files uploaded to IPFS`);
    return data;
  }

  function getState()  { return { ..._state }; }
  function resetState(){ _state = { uploaded: false, items: [], imageCID: '', metaCID: '', imageBaseUrl: '', metaBaseUrl: '', count: 0 }; }

  global.CreatorUpload = { uploadFiles, getState, resetState };

}(typeof window !== 'undefined' ? window : globalThis));


// ── Drop-zone initialiser ─────────────────────────────────────
// Wires up the drag-and-drop upload zone in create.html.
(function () {
  function init() {
    const zone  = document.getElementById('nft-files-zone');
    const input = document.getElementById('nft-files-input');
    const bar   = document.getElementById('upload-progress-bar');
    const txt   = document.getElementById('upload-progress-text');
    const thumb = document.getElementById('preview-img-area');

    if (!zone || !input) return;

    zone.addEventListener('dragover',  e => { e.preventDefault(); zone.classList.add('dragging'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragging'));
    zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('dragging'); handle(e.dataTransfer.files); });
    input.addEventListener('change', e => handle(e.target.files));
    zone.addEventListener('click', () => input.click());

    async function handle(files) {
      if (!files?.length) return;

      // Show first image as collection preview
      const first = files[0];
      if (first && thumb) {
        const url = URL.createObjectURL(first);
        thumb.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:cover" alt="preview">`;
      }

      const metadata = {
        name          : document.getElementById('col-name')?.value.trim()   || 'My Collection',
        symbol        : document.getElementById('col-symbol')?.value.trim() || 'NFT',
        description   : document.getElementById('col-desc')?.value          || '',
        royalty       : document.getElementById('col-royalty')?.value       || '5',
        creatorAddress: window.phantom?.solana?.publicKey?.toString()        || '',
      };

      setLoading(true);
      setProgress(0, `Found ${files.length} file(s)…`);

      try {
        await window.CreatorUpload.uploadFiles(files, metadata, (pct, msg) => setProgress(pct, msg));
        const st = window.CreatorUpload.getState();
        setZoneSuccess(st, files.length);
        if (window.showToast) window.showToast(`✅ ${st.count} NFTs uploaded to IPFS!`, 'success', 5000);
      } catch (e) {
        setProgress(100, '❌ ' + e.message);
        if (bar) bar.style.background = '#e74c3c';
        if (window.showToast) window.showToast('❌ Upload failed: ' + e.message, 'error', 8000);
      } finally {
        setLoading(false);
      }
    }

    function setProgress(pct, msg) {
      if (bar) { bar.style.width = pct + '%'; bar.style.background = pct === 100 ? '#2ecc71' : 'var(--primary-gold)'; }
      if (txt) txt.textContent = msg;
    }

    function setLoading(on) { zone.style.pointerEvents = on ? 'none' : 'auto'; zone.style.opacity = on ? '0.7' : '1'; }

    function setZoneSuccess(st, count) {
      const inner = zone.querySelector('.upload-zone-inner');
      if (!inner) return;
      inner.innerHTML = `
        <div class="upload-icon">✅</div>
        <p class="upload-title">${count} images ready</p>
        <p class="upload-hint" style="color:#2ecc71">Uploaded to IPFS — permanent storage</p>
        <p class="upload-hint" style="font-size:.7rem;opacity:.5;margin-top:.25rem">
          CID: ${st.imageCID.slice(0,18)}… &nbsp;·&nbsp;
          <a href="${st.imageBaseUrl}" target="_blank" rel="noopener" style="color:var(--primary-gold)">View ↗</a>
        </p>
        <p class="upload-hint" style="margin-top:.3rem;font-size:.72rem">Click to replace</p>`;
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
}());
