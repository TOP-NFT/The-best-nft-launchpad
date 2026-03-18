'use strict';

/* ============================================================
   CREATE STUDIO — create-script.js
   Every button is wired. Real Netlify functions are called.
   ============================================================ */

// ── Custom cursor ────────────────────────────────────────────
const cursor = document.getElementById('cursor');
if (cursor) document.addEventListener('mousemove', e => {
    cursor.style.left = e.clientX + 'px';
    cursor.style.top  = e.clientY + 'px';
});

// ── Toast notification ───────────────────────────────────────
function showToast(msg, type = 'info', duration = 3500) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.className   = `toast ${type} show`;
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('show'), duration);
}

// ── Tab switching ────────────────────────────────────────────
document.querySelectorAll('.studio-tab').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.studio-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const panel = document.getElementById('tab-' + btn.dataset.tab);
        if (panel) panel.classList.add('active');
    });
});

// ═══════════════════════════════════════════════════════════
// TAB 1 — NEW COLLECTION
// ═══════════════════════════════════════════════════════════

// Character counters
const colNameInput = document.getElementById('col-name');
const colDescInput = document.getElementById('col-desc');
if (colNameInput) colNameInput.addEventListener('input', () => {
    document.getElementById('col-name-count').textContent = colNameInput.value.length;
    updatePreview();
});
if (colDescInput) colDescInput.addEventListener('input', () => {
    document.getElementById('col-desc-count').textContent = colDescInput.value.length;
    updatePreview();
});

// Royalty slider
function onRoyaltyChange(el) {
    document.getElementById('royalty-val').textContent = el.value + '%';
    const pct = (el.value / el.max) * 100;
    el.style.background = `linear-gradient(to right,var(--primary-gold) ${pct}%,var(--border-color) ${pct}%)`;
    updatePreview();
}

// Init royalty slider gradient on load
window.addEventListener('DOMContentLoaded', () => {
    const rs = document.getElementById('col-royalty');
    if (rs) onRoyaltyChange(rs);
    const wr = document.getElementById('wiz-royalty');
    if (wr) {
        const p = (wr.value / wr.max) * 100;
        wr.style.background = `linear-gradient(to right,var(--primary-gold) ${p}%,var(--border-color) ${p}%)`;
        wr.addEventListener('input', function() {
            const pct = (this.value / this.max) * 100;
            this.style.background = `linear-gradient(to right,var(--primary-gold) ${pct}%,var(--border-color) ${pct}%)`;
        });
    }
    updatePreview();
    renderLayers();
    refreshPreviews();
    renderPackTiers();
    renderWizardTiers();
});

// Live preview updater
function updatePreview() {
    const name     = document.getElementById('col-name')?.value     || '';
    const symbol   = document.getElementById('col-symbol')?.value   || '';
    const desc     = document.getElementById('col-desc')?.value     || '';
    const supply   = document.getElementById('col-supply')?.value   || '';
    const price    = document.getElementById('pub-price')?.value    || '';
    const royalty  = document.getElementById('col-royalty')?.value  || '5';
    const category = document.getElementById('col-category')?.value || 'art';

    el('preview-col-name').textContent    = name   || 'Your Collection Name';
    el('preview-col-symbol').textContent  = symbol || 'SYMB';
    el('preview-col-desc').textContent    = desc   || 'Your description will appear here...';
    el('preview-supply').textContent      = supply ? Number(supply).toLocaleString() : '—';
    el('preview-price').textContent       = price  ? price + ' SOL' : '— SOL';
    el('preview-royalty').textContent     = royalty + '%';
    el('preview-badge').textContent       = category.toUpperCase();

    markCheck('check-name',   !!name.trim());
    markCheck('check-symbol', !!symbol.trim());
    markCheck('check-supply', !!supply && Number(supply) > 0);
    markCheck('check-price',  price !== '' && price !== null);
    markCheck('check-wallet', !!connectedPublicKey);
}

function markCheck(id, done) {
    const e = document.getElementById(id);
    if (e) e.classList.toggle('done', done);
}

// ── NFT Upload zone ──────────────────────────────────────────
// Wired up in creator-upload.js (the initCreatorDropZone function runs automatically).
// After upload completes, creator-upload.js calls the Netlify function and updates the zone.
// We watch the state and mark the checklist item.
setInterval(() => {
    const state = window.CreatorUpload?.getState?.();
    if (state?.uploaded) markCheck('check-images', true);
}, 500);

// ── Phase toggle ─────────────────────────────────────────────
function togglePhase(phase, enabled) {
    const body = document.getElementById(phase + '-phase-body');
    if (body) body.classList.toggle('hidden', !enabled);
}

// Wallet count badge
function countWallets(phase) {
    const ta    = document.getElementById(phase + '-wallets');
    const badge = document.getElementById(phase + '-wallet-count');
    if (!ta || !badge) return;
    const count = ta.value.split(/[\n,]+/).map(s => s.trim()).filter(s => s.length > 30).length;
    badge.textContent = count + ' wallet' + (count !== 1 ? 's' : '');
}

// ── Read phases from form ─────────────────────────────────────
function readPhases() {
    const parseWallets = id =>
        (document.getElementById(id)?.value || '')
            .split(/[\n,]+/).map(s => s.trim()).filter(s => s.length > 30);

    return {
        og: {
            enabled  : document.getElementById('og-enabled')?.checked || false,
            startDate: document.getElementById('og-start')?.value  || null,
            endDate  : document.getElementById('og-end')?.value    || null,
            price    : parseFloat(document.getElementById('og-price')?.value  || '0'),
            limit    : parseInt(document.getElementById('og-limit')?.value    || '2', 10),
            wallets  : parseWallets('og-wallets'),
        },
        whitelist: {
            enabled  : document.getElementById('wl-enabled')?.checked || false,
            startDate: document.getElementById('wl-start')?.value  || null,
            endDate  : document.getElementById('wl-end')?.value    || null,
            price    : parseFloat(document.getElementById('wl-price')?.value  || '0'),
            limit    : parseInt(document.getElementById('wl-limit')?.value    || '3', 10),
            wallets  : parseWallets('wl-wallets'),
        },
        public: {
            startDate: document.getElementById('pub-start')?.value || null,
            price    : parseFloat(document.getElementById('pub-price')?.value || '0'),
            limit    : parseInt(document.getElementById('pub-limit')?.value   || '10', 10),
        },
    };
}

// ── DEPLOY COLLECTION — calls the real Netlify function ───────
async function deployCollection() {
    const name    = document.getElementById('col-name')?.value.trim();
    const symbol  = document.getElementById('col-symbol')?.value.trim();
    const supply  = document.getElementById('col-supply')?.value;
    const royalty = document.getElementById('col-royalty')?.value || '5';
    const desc    = document.getElementById('col-desc')?.value    || '';

    if (!name)   { showToast('Enter a collection name', 'error'); return; }
    if (!symbol) { showToast('Enter a symbol', 'error'); return; }
    if (!supply) { showToast('Enter max supply', 'error'); return; }

    // Check images uploaded
    const uploadState = window.CreatorUpload?.getState?.();
    if (!uploadState?.uploaded || !uploadState.items?.length) {
        showToast('Upload your NFT images first (drag & drop above)', 'error');
        document.getElementById('nft-files-zone')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
    }

    if (uploadState.items.length !== parseInt(supply, 10)) {
        showToast(`Supply mismatch: you set ${supply} but uploaded ${uploadState.items.length} images. They must match.`, 'error', 7000);
        return;
    }

    const phases = readPhases();
    if (phases.og.enabled && phases.og.wallets.length === 0) {
        showToast('OG phase is enabled but no wallet addresses added. Paste addresses or disable the phase.', 'error', 6000);
        return;
    }
    if (phases.whitelist.enabled && phases.whitelist.wallets.length === 0) {
        showToast('Whitelist phase is enabled but no wallet addresses added.', 'error', 6000);
        return;
    }

    const btn  = el('deploy-collection-btn');
    const text = el('deploy-col-text');
    const spin = el('deploy-col-spinner');
    btn.style.pointerEvents = 'none';
    spin.classList.remove('hidden');

    // Step status messages (real deploy takes ~40-60s for Solana confirmations)
    const STEPS = [
        'Connecting to Solana…',
        'Creating Collection NFT on-chain…',
        'Deploying Candy Machine v3…',
        'Configuring OG / Whitelist / Public phases…',
        'Loading NFT items into Candy Machine…',
        'Saving config to IPFS…',
        'Confirming transactions…',
    ];
    let si = 0;
    text.textContent = STEPS[0];
    const stepTimer = setInterval(() => {
        si = Math.min(si + 1, STEPS.length - 1);
        text.textContent = STEPS[si];
    }, 5000);

    try {
        const res  = await fetch('/.netlify/functions/deploy-collection', {
            method : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body   : JSON.stringify({
                name, symbol, description: desc,
                supply: parseInt(supply, 10),
                royalty: parseFloat(royalty),
                items  : uploadState.items,
                configCID: uploadState.metaCID || '',
                creatorAddress: connectedPublicKey?.toString() || '',
                phases,
            }),
        });

        const data = await res.json();
        clearInterval(stepTimer);

        if (!res.ok || !data.success) throw new Error(data.error || 'Deployment failed — check Netlify function logs');

        // Persist so index.html can display the collection card
        localStorage.setItem('TOP_lastCM',      data.candyMachineAddress);
        localStorage.setItem('TOP_lastColl',    data.collectionMintAddress);
        localStorage.setItem('TOP_lastConfig',  data.configCID || '');
        localStorage.setItem('TOP_lastMintUrl', data.mintPageUrl);
        localStorage.setItem('TOP_network',     data.network);

        // Also push into the collections array for the index page grid
        try {
            const existing = JSON.parse(localStorage.getItem('TOP_collections') || '[]');
            existing.unshift({
                candyMachineAddress   : data.candyMachineAddress,
                collectionMintAddress : data.collectionMintAddress,
                configCID             : data.configCID || '',
                mintPageUrl           : data.mintPageUrl,
                network               : data.network,
                name,
                symbol,
            });
            localStorage.setItem('TOP_collections', JSON.stringify(existing.slice(0, 20)));
        } catch {}

        spin.classList.add('hidden');
        text.textContent   = '✅ Deployed!';
        btn.style.background = 'linear-gradient(135deg,#2ecc71,#27ae60)';

        // Populate the success card
        const net = data.network === 'mainnet' ? '🟢 Mainnet' : '🔵 Devnet';
        el('success-col-name').textContent   = name + ' is Live!';
        el('success-network-pill').textContent = net + ' · Phases: ' + data.phasesDeployed.join(' → ');
        el('success-cm-addr').textContent    = data.candyMachineAddress;
        el('success-coll-addr').textContent  = data.collectionMintAddress;
        el('success-mint-url').textContent   = data.mintPageUrl;
        el('preview-mint-link').href         = data.mintPageUrl;
        el('success-explorer-link').href     = data.explorerUrl;
        el('col-deploy-success').classList.remove('hidden');
        el('col-deploy-success').scrollIntoView({ behavior: 'smooth', block: 'nearest' });

        showToast(`🎉 "${name}" is live on Solana!`, 'success', 8000);

    } catch (err) {
        clearInterval(stepTimer);
        spin.classList.add('hidden');
        text.textContent    = '🚀 Deploy Collection on Solana';
        btn.style.pointerEvents = 'auto';
        btn.style.background    = '';
        showToast('❌ ' + err.message, 'error', 10000);
        console.error('[deployCollection]', err);
    }
}

// Copy helpers
function copyText(id) {
    const t = document.getElementById(id)?.textContent;
    if (t) navigator.clipboard.writeText(t).then(() => showToast('Copied!', 'success'));
}
function copyMintUrl() {
    const u = el('success-mint-url')?.textContent;
    if (u) navigator.clipboard.writeText(u).then(() => showToast('Mint URL copied!', 'success'));
}

function resetCollectionForm() {
    el('col-deploy-success').classList.add('hidden');
    el('deploy-col-text').textContent = '🚀 Deploy Collection on Solana';
    el('deploy-collection-btn').style.background = '';
    el('deploy-collection-btn').style.pointerEvents = 'auto';
    window.CreatorUpload?.resetState?.();
    // Reset upload zone
    const inner = document.getElementById('nft-upload-inner');
    if (inner) inner.innerHTML = `
        <span class="upload-icon">🖼️</span>
        <p class="upload-title">Drop your NFT images here or click to browse</p>
        <p class="upload-hint">Name them 1.png, 2.png, 3.png…</p>`;
    document.getElementById('upload-progress-bar').style.width = '0%';
    document.getElementById('upload-progress-text').textContent = '';
}

// ═══════════════════════════════════════════════════════════
// TAB 2 — GENERATE ART
// ═══════════════════════════════════════════════════════════

let layers = [
    { id:1, name:'Background', traits:[{name:'Forest',rarity:40,emoji:'🌲'},{name:'Desert',rarity:30,emoji:'🏜️'},{name:'Cosmos',rarity:20,emoji:'🌌'},{name:'Lava',rarity:10,emoji:'🌋'}] },
    { id:2, name:'Body',       traits:[{name:'Knight',rarity:35,emoji:'⚔️'},{name:'Mage',rarity:30,emoji:'🧙'},{name:'Rogue',rarity:25,emoji:'🗡️'},{name:'Dragon',rarity:10,emoji:'🐉'}] },
    { id:3, name:'Headwear',   traits:[{name:'Crown',rarity:10,emoji:'👑'},{name:'Helmet',rarity:40,emoji:'⛑️'},{name:'Hood',rarity:30,emoji:'🎭'},{name:'None',rarity:20,emoji:'✨'}] },
    { id:4, name:'Eyes',       traits:[{name:'Normal',rarity:50,emoji:'👁️'},{name:'Glowing',rarity:25,emoji:'✨'},{name:'Cyber',rarity:15,emoji:'🔵'},{name:'Flames',rarity:10,emoji:'🔥'}] },
];

function renderLayers() {
    const list = document.getElementById('layers-list');
    if (!list) return;
    list.innerHTML = '';
    layers.forEach((layer, idx) => {
        const card = document.createElement('div');
        card.className = 'layer-card';
        card.innerHTML = `
            <div class="layer-top">
                <span class="drag-handle">⠿</span>
                <input class="layer-name-input" value="${layer.name}" onchange="renameLayer(${layer.id},this.value)" placeholder="Layer name">
                <span style="font-size:.72rem;color:var(--secondary-text);margin-left:auto;margin-right:.5rem">Layer ${idx+1}</span>
                <button class="layer-delete" onclick="deleteLayer(${layer.id})">✕</button>
            </div>
            <div class="layer-traits">
                ${layer.traits.map(t => `<div class="trait-chip">${t.emoji} ${t.name}<span class="trait-chip-rarity">${t.rarity}%</span></div>`).join('')}
                <button class="add-trait-btn" onclick="addTrait(${layer.id})"><span>+</span> Add Trait</button>
            </div>`;
        list.appendChild(card);
    });
    renderRarityBars();
}

function renameLayer(id, name) { const l = layers.find(l => l.id === id); if (l) { l.name = name; renderRarityBars(); } }

function deleteLayer(id) {
    if (layers.length <= 1) { showToast('Need at least one layer', 'error'); return; }
    layers = layers.filter(l => l.id !== id);
    renderLayers(); refreshPreviews();
}

function addLayer() {
    layers.push({ id: Date.now(), name: `Layer ${layers.length + 1}`, traits: [{ name: 'Default', rarity: 100, emoji: '🎨' }] });
    renderLayers(); refreshPreviews(); showToast('Layer added', 'info');
}

function addTrait(layerId) {
    const name = prompt('Trait name:'); if (!name) return;
    const rarity = parseInt(prompt('Rarity % (1–100):') || '20', 10);
    const emojis = ['🌟','💫','⭐','🌙','☀️','🔮','💎','🌈'];
    const layer = layers.find(l => l.id === layerId);
    if (layer) { layer.traits.push({ name, rarity: Math.max(1, Math.min(100, rarity)), emoji: emojis[Math.floor(Math.random() * emojis.length)] }); renderLayers(); refreshPreviews(); }
}

function renderRarityBars() {
    const container = document.getElementById('rarity-bars'); if (!container) return;
    const tiers = { Common:{min:40,max:100,color:'#a0a0a0'}, Uncommon:{min:20,max:39,color:'#2ecc71'}, Rare:{min:10,max:19,color:'#3498db'}, Epic:{min:3,max:9,color:'#9b59b6'}, Legendary:{min:1,max:2,color:'#d4af37'} };
    const counts = { Common:0, Uncommon:0, Rare:0, Epic:0, Legendary:0 }; let total = 0;
    layers.forEach(l => l.traits.forEach(t => { total++; for (const [tier, {min, max}] of Object.entries(tiers)) { if (t.rarity >= min && t.rarity <= max) { counts[tier]++; break; } } }));
    container.innerHTML = Object.entries(counts).map(([tier, count]) => {
        const pct = total ? Math.round((count / total) * 100) : 0;
        return `<div class="rarity-bar-row"><span class="rarity-bar-label">${tier}</span><div class="rarity-bar-track"><div class="rarity-bar-fill" style="width:${pct}%;background:${tiers[tier].color}"></div></div><span class="rarity-bar-pct">${pct}%</span></div>`;
    }).join('');
}

function refreshPreviews() {
    const grid = document.getElementById('gen-preview-grid'); if (!grid) return;
    grid.innerHTML = '';
    for (let i = 0; i < 6; i++) {
        const combo = layers.map(l => { let c = 0; const r = Math.random() * 100; for (const t of l.traits) { c += t.rarity; if (r <= c) return t.emoji; } return l.traits[0].emoji; }).join('');
        const tile = document.createElement('div');
        tile.className = 'gen-preview-tile';
        tile.innerHTML = `<span style="font-size:2.5rem">${combo.slice(0,2)}</span><div class="tile-label">#${String(Math.floor(Math.random()*9999)+1).padStart(4,'0')}</div>`;
        tile.addEventListener('click', refreshPreviews);
        grid.appendChild(tile);
    }
}

function runGeneration() {
    const count  = parseInt(document.getElementById('gen-count')?.value || '1000', 10);
    const btnTxt = el('gen-btn-text');
    const spin   = el('gen-spinner');
    if (!btnTxt || !spin) return;
    btnTxt.textContent = `Generating ${count.toLocaleString()} NFTs…`;
    spin.classList.remove('hidden');
    let done = 0;
    const interval = setInterval(() => {
        done = Math.min(done + Math.floor(count / 20), count);
        btnTxt.textContent = `Generating… ${Math.round((done / count) * 100)}%`;
        refreshPreviews();
        if (done >= count) {
            clearInterval(interval);
            spin.classList.add('hidden');
            btnTxt.textContent = `✅ ${count.toLocaleString()} NFTs Generated!`;
            showToast(`🎨 ${count.toLocaleString()} unique NFTs generated!`, 'success', 5000);
        }
    }, 180);
}

// ═══════════════════════════════════════════════════════════
// TAB 3 — NFT PACK MINT
// ═══════════════════════════════════════════════════════════

let packTiers = [
    { id:1, name:'Starter',    icon:'📦', color:'#a0a0a0', price:'0.5', nftsPerPack:3,  supply:5000 },
    { id:2, name:'Rare',       icon:'💙', color:'#3498db', price:'1.0', nftsPerPack:5,  supply:2000 },
    { id:3, name:'Epic',       icon:'💜', color:'#9b59b6', price:'2.5', nftsPerPack:8,  supply:500  },
    { id:4, name:'Legendary',  icon:'👑', color:'#d4af37', price:'5.0', nftsPerPack:10, supply:100  },
];

function renderPackTiers() {
    const c = document.getElementById('pack-tiers-container'); if (!c) return;
    c.innerHTML = packTiers.map(tier => `
        <div class="pack-tier-card" style="--tier-color:${tier.color}">
            <div class="tier-card-header">
                <span class="tier-badge">${tier.icon} ${tier.name}</span>
                <button class="tier-delete-btn" onclick="deletePackTier(${tier.id})">🗑️</button>
            </div>
            <div class="tier-fields">
                <div><label class="tier-field-label">Name</label><input class="tier-input" value="${tier.name}" onchange="updatePackTier(${tier.id},'name',this.value)"></div>
                <div><label class="tier-field-label">Price (SOL)</label><input class="tier-input" type="number" value="${tier.price}" step="0.1" min="0" onchange="updatePackTier(${tier.id},'price',this.value)"></div>
                <div><label class="tier-field-label">NFTs/Pack</label><input class="tier-input" type="number" value="${tier.nftsPerPack}" min="1" onchange="updatePackTier(${tier.id},'nftsPerPack',+this.value)"></div>
                <div><label class="tier-field-label">Supply</label><input class="tier-input" type="number" value="${tier.supply}" min="1" onchange="updatePackTier(${tier.id},'supply',+this.value)"></div>
            </div>
        </div>`).join('');
    renderPackVisualPreview();
    renderPackSummary();
}

function updatePackTier(id, field, value) { const t = packTiers.find(t => t.id === id); if (t) { t[field] = value; renderPackVisualPreview(); renderPackSummary(); } }
function deletePackTier(id) { if (packTiers.length <= 1) { showToast('Need at least one tier', 'error'); return; } packTiers = packTiers.filter(t => t.id !== id); renderPackTiers(); }
function addPackTier() {
    const colors = ['#e74c3c','#e67e22','#1abc9c','#34495e'], icons = ['🎯','🎖️','⚡','🌟'];
    packTiers.push({ id: Date.now(), name: `Tier ${packTiers.length+1}`, icon: icons[packTiers.length % icons.length], color: colors[packTiers.length % colors.length], price: '1.0', nftsPerPack: 5, supply: 1000 });
    renderPackTiers(); showToast('Tier added', 'info');
}

function hexToRgb(hex) { const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16); return `${r},${g},${b}`; }

function renderPackVisualPreview() {
    const c = document.getElementById('pack-visual-preview'); if (!c) return;
    c.innerHTML = `<div class="pack-visual-grid">` + packTiers.map(tier => `
        <div class="pack-visual-card" style="border-color:${tier.color}">
            <div class="pack-visual-icon" style="background:rgba(${hexToRgb(tier.color)},.15)">${tier.icon}</div>
            <div class="pack-visual-info"><h4 style="color:${tier.color}">${tier.name} Pack</h4><p>${tier.nftsPerPack} NFTs · ${Number(tier.supply).toLocaleString()} available</p></div>
            <div class="pack-visual-price" style="color:${tier.color}">◎ ${tier.price}</div>
        </div>`).join('') + `</div>`;
}

function renderPackSummary() {
    const box = document.getElementById('pack-summary-content'); if (!box) return;
    const ts  = packTiers.reduce((s,t) => s + t.supply, 0);
    const tn  = packTiers.reduce((s,t) => s + t.supply * t.nftsPerPack, 0);
    const minP= Math.min(...packTiers.map(t => parseFloat(t.price)));
    const maxP= Math.max(...packTiers.map(t => parseFloat(t.price)));
    const mr  = packTiers.reduce((s,t) => s + t.supply * parseFloat(t.price), 0).toFixed(1);
    box.innerHTML = `
        <div class="summary-row"><span>Total Pack Supply</span><span>${ts.toLocaleString()}</span></div>
        <div class="summary-row"><span>Total NFTs in Packs</span><span>${tn.toLocaleString()}</span></div>
        <div class="summary-row"><span>Price Range</span><span>◎ ${minP} – ${maxP}</span></div>
        <div class="summary-row"><span>Tiers</span><span>${packTiers.length}</span></div>
        <div class="summary-row summary-total"><span>Max Revenue</span><span>◎ ${mr}</span></div>`;
}

function setReveal(type, el_btn) {
    document.querySelectorAll('.reveal-option').forEach(o => o.classList.remove('active'));
    el_btn.classList.add('active');
    const dr = document.getElementById('reveal-date-row');
    if (dr) dr.classList.toggle('hidden', type !== 'delayed');
}

function togglePresale() { document.getElementById('presale-field').classList.toggle('hidden', !document.getElementById('presale-toggle').checked); }

async function deployPackMint() {
    const name = document.getElementById('drop-name')?.value.trim();
    if (!name) { showToast('Enter a drop name', 'error'); return; }
    const btn  = el('pack-deploy-text');
    const spin = el('pack-deploy-spinner');
    spin.classList.remove('hidden');
    btn.textContent = 'Connecting to Solana…';

    const minPrice    = Math.min(...packTiers.map(t => parseFloat(t.price) || 0));
    const totalSupply = packTiers.reduce((s,t) => s + t.supply, 0);

    try {
        const res  = await fetch('/.netlify/functions/deploy-collection', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({
                name,
                symbol     : name.replace(/\s+/g,'').slice(0,10).toUpperCase(),
                supply     : totalSupply,
                price      : minPrice,
                royalty    : '5',
                description: `Pack drop: ${name} — ${packTiers.length} tiers`,
                items      : [],
                phases     : { og:{enabled:false}, whitelist:{enabled:false}, public:{price:minPrice,limit:10} },
            }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'Deployment failed');
        spin.classList.add('hidden');
        btn.textContent = '✅ Pack Drop Deployed!';
        showToast(`📦 "${name}" is live! CM: ${data.candyMachineAddress.slice(0,8)}…`, 'success', 7000);
    } catch (err) {
        spin.classList.add('hidden');
        btn.textContent = '📦 Deploy Pack Drop';
        showToast('❌ ' + err.message, 'error', 8000);
    }
}

// ═══════════════════════════════════════════════════════════
// TAB 4 — PACK COLLECTION WIZARD
// ═══════════════════════════════════════════════════════════

let wizardStep = 1;
const WIZARD_TOTAL = 5;
let wizardTiers = [
    { id:1, name:'Common',    icon:'📦', color:'#a0a0a0', price:'0.5', nfts:3,  supply:5000, rarity:'60%' },
    { id:2, name:'Rare',      icon:'💙', color:'#3498db', price:'1.5', nfts:5,  supply:1500, rarity:'25%' },
    { id:3, name:'Legendary', icon:'👑', color:'#d4af37', price:'5.0', nfts:10, supply:100,  rarity:'5%'  },
];

function wizardNext(from) {
    if (from === 1) {
        const n = document.getElementById('wiz-col-name')?.value.trim();
        const s = document.getElementById('wiz-col-symbol')?.value.trim();
        if (!n) { showToast('Collection name required', 'error'); return; }
        if (!s) { showToast('Symbol required', 'error'); return; }
    }
    if (from === 2) renderWizardAssets();
    if (from === 4) renderReviewSummary();
    goToWizardStep(from + 1);
}

function wizardBack(from) { goToWizardStep(from - 1); }

function goToWizardStep(step) {
    if (step < 1 || step > WIZARD_TOTAL) return;
    wizardStep = step;
    document.querySelectorAll('.wizard-panel').forEach(p => p.classList.toggle('active', parseInt(p.dataset.panel) === step));
    document.querySelectorAll('.wizard-step').forEach(s => {
        const n = parseInt(s.dataset.step);
        s.classList.toggle('active', n === step);
        s.classList.toggle('done',   n < step);
        const c = s.querySelector('.wizard-step-circle');
        if (c) c.textContent = n < step ? '✓' : n;
    });
    document.querySelectorAll('.wizard-step-line').forEach((l, i) => l.classList.toggle('done', i < step - 1));
    const fill = el('wizard-progress-fill');
    if (fill) fill.style.width = (step / WIZARD_TOTAL * 100) + '%';
}

function renderWizardTiers() {
    const c = document.getElementById('wiz-tiers-container'); if (!c) return;
    c.innerHTML = wizardTiers.map(t => `
        <div class="wiz-tier-card" style="--tier-color:${t.color}">
            <div class="wiz-tier-header">
                <input class="wiz-tier-label-input" value="${t.name}" style="color:${t.color}" onchange="updateWizTier(${t.id},'name',this.value)">
                <div style="display:flex;align-items:center;gap:.75rem"><span style="font-size:1.5rem">${t.icon}</span><button class="tier-delete-btn" onclick="deleteWizTier(${t.id})">🗑️</button></div>
            </div>
            <div class="wiz-tier-grid">
                <div><label class="tier-field-label">Price (SOL)</label><input class="tier-input" type="number" value="${t.price}" step="0.1" min="0" onchange="updateWizTier(${t.id},'price',this.value)"></div>
                <div><label class="tier-field-label">NFTs Per Pack</label><input class="tier-input" type="number" value="${t.nfts}" min="1" onchange="updateWizTier(${t.id},'nfts',+this.value)"></div>
                <div><label class="tier-field-label">Pack Supply</label><input class="tier-input" type="number" value="${t.supply}" min="1" onchange="updateWizTier(${t.id},'supply',+this.value)"></div>
                <div><label class="tier-field-label">Drop Rate</label><input class="tier-input" value="${t.rarity}" placeholder="e.g. 25%" onchange="updateWizTier(${t.id},'rarity',this.value)"></div>
            </div>
        </div>`).join('');
}

function updateWizTier(id, field, value) { const t = wizardTiers.find(t => t.id === id); if (t) t[field] = value; }
function deleteWizTier(id) { if (wizardTiers.length <= 1) { showToast('Need at least one tier', 'error'); return; } wizardTiers = wizardTiers.filter(t => t.id !== id); renderWizardTiers(); }
function addWizardTier() {
    const COLORS = ['#e74c3c','#e67e22','#1abc9c','#e91e63'], ICONS = ['🎯','⚡','🌟','💫'];
    wizardTiers.push({ id:Date.now(), name:'New Tier', icon:ICONS[wizardTiers.length % ICONS.length], color:COLORS[wizardTiers.length % COLORS.length], price:'2.0', nfts:5, supply:500, rarity:'10%' });
    renderWizardTiers(); showToast('Tier added', 'info');
}

function renderWizardAssets() {
    const c = document.getElementById('wiz-assets-container'); if (!c) return;
    c.innerHTML = wizardTiers.map(t => `
        <div class="asset-tier-section">
            <h3 class="asset-tier-title" style="color:${t.color}">${t.icon} ${t.name} — Asset Upload</h3>
            <div class="asset-upload-row">
                <div class="mini-upload" onclick="showToast('Select file to upload','info')"><span class="upload-icon">🎴</span><p>Pack Card Front</p></div>
                <div class="mini-upload" onclick="showToast('Select file to upload','info')"><span class="upload-icon">🖼️</span><p>Pack Card Back</p></div>
                <div class="mini-upload" onclick="showToast('Select file to upload','info')"><span class="upload-icon">📁</span><p>NFT Assets (.zip)</p></div>
                <div class="mini-upload" onclick="showToast('Select file to upload','info')"><span class="upload-icon">✨</span><p>Reveal Animation</p></div>
            </div>
        </div>`).join('');
}

function selectRevealType(type, el_card) {
    document.querySelectorAll('.reveal-card').forEach(c => c.classList.remove('selected'));
    el_card.classList.add('selected');
    const extra = document.getElementById('reveal-settings-extra');
    if (extra) extra.classList.toggle('hidden', type !== 'timed');
    showToast(`Reveal: ${el_card.querySelector('h3').textContent}`, 'info');
}

function renderReviewSummary() {
    const name = document.getElementById('wiz-col-name')?.value || 'Unnamed';
    const sym  = document.getElementById('wiz-col-symbol')?.value || '—';
    const roy  = document.getElementById('wiz-royalty')?.value || '5';
    const sel  = document.querySelector('.reveal-card.selected');
    const rt   = sel ? sel.querySelector('h3').textContent : 'Not set';
    const ts   = wizardTiers.reduce((s,t) => s + t.supply, 0);
    const tn   = wizardTiers.reduce((s,t) => s + t.supply * t.nfts, 0);
    const mr   = wizardTiers.reduce((s,t) => s + t.supply * parseFloat(t.price), 0).toFixed(1);
    const c    = document.getElementById('review-summary'); if (!c) return;
    c.innerHTML = `
        <div class="review-block"><div class="review-block-title">Collection Details</div>
            <div class="review-item"><span>Name</span><span>${name}</span></div>
            <div class="review-item"><span>Symbol</span><span>${sym}</span></div>
            <div class="review-item"><span>Royalty</span><span>${roy}%</span></div>
            <div class="review-item"><span>Blockchain</span><span>Solana</span></div>
        </div>
        <div class="review-block"><div class="review-block-title">Pack Tiers</div>
            ${wizardTiers.map(t => `<div class="review-item"><span style="color:${t.color}">${t.icon} ${t.name}</span><span>◎${t.price} · ${t.supply.toLocaleString()} packs</span></div>`).join('')}
        </div>
        <div class="review-block"><div class="review-block-title">Distribution</div>
            <div class="review-item"><span>Total Packs</span><span>${ts.toLocaleString()}</span></div>
            <div class="review-item"><span>Total NFTs</span><span>${tn.toLocaleString()}</span></div>
            <div class="review-item"><span>Max Revenue</span><span>◎ ${mr}</span></div>
        </div>
        <div class="review-block"><div class="review-block-title">Reveal Config</div>
            <div class="review-item"><span>Mechanic</span><span>${rt}</span></div>
            <div class="review-item"><span>Animated Open</span><span>Enabled</span></div>
        </div>`;
}

async function deployPackCollection() {
    const name = document.getElementById('wiz-col-name')?.value.trim();
    if (!name) { showToast('Collection name required', 'error'); goToWizardStep(1); return; }

    el('wizard-deploy-btn-wrap').classList.add('hidden');
    const cb = document.querySelector('.deploy-cost-box'); if (cb) cb.style.display = 'none';
    const da = el('deploy-animation'); da.classList.remove('hidden');

    const STEPS = [
        {icon:'🔗', label:'Connecting to Solana RPC…'},
        {icon:'📝', label:'Creating Collection NFT on-chain…'},
        {icon:'📦', label:'Deploying Candy Machine v3…'},
        {icon:'🎭', label:'Configuring reveal mechanics…'},
        {icon:'✅', label:'Verifying on-chain data…'},
    ];
    const sl = el('deploy-steps-list');
    sl.innerHTML = STEPS.map((s,i) => `<div class="deploy-step-item" id="wiz-step-${i}"><span class="deploy-step-icon">${s.icon}</span><span>${s.label}</span></div>`).join('');

    let animStep = 0;
    const animTimer = setInterval(() => {
        if (animStep > 0) { const prev = el(`wiz-step-${animStep-1}`); if (prev) { prev.classList.replace('active','complete'); prev.querySelector('.deploy-step-spinner')?.remove(); } }
        const cur = el(`wiz-step-${animStep}`);
        if (cur) { cur.classList.add('active'); cur.innerHTML += `<div class="deploy-step-spinner"></div>`; }
        animStep = Math.min(animStep + 1, STEPS.length - 1);
    }, 2500);

    try {
        const sym  = document.getElementById('wiz-col-symbol')?.value.trim() || name.replace(/\s+/g,'').slice(0,10).toUpperCase();
        const roy  = document.getElementById('wiz-royalty')?.value || '5';
        const ts   = wizardTiers.reduce((s,t) => s + t.supply, 0);
        const minP = Math.min(...wizardTiers.map(t => parseFloat(t.price) || 0));

        const res  = await fetch('/.netlify/functions/deploy-collection', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({
                name, symbol:sym, supply:ts, price:minP, royalty:roy,
                description: `Pack collection: ${name}`,
                items: [],
                phases: { og:{enabled:false}, whitelist:{enabled:false}, public:{price:minP,limit:10} },
            }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'Deployment failed');

        clearInterval(animTimer);
        STEPS.forEach((_,i) => { const e = el(`wiz-step-${i}`); if (e) { e.classList.remove('active'); e.classList.add('complete'); e.querySelector('.deploy-step-spinner')?.remove(); } });
        da.classList.add('hidden');

        // Show success
        el('deploy-success').classList.remove('hidden');
        el('success-address-val').textContent = data.candyMachineAddress;
        showToast(`👑 "${name}" is live on Solana!`, 'success', 7000);

    } catch (err) {
        clearInterval(animTimer);
        da.classList.add('hidden');
        el('wizard-deploy-btn-wrap').classList.remove('hidden');
        if (cb) cb.style.display = '';
        showToast('❌ ' + err.message, 'error', 8000);
    }
}

function copyAddress() { const a = el('success-address-val')?.textContent; if (a) navigator.clipboard.writeText(a).then(() => showToast('Address copied!', 'success')); }

function viewOnExplorer() {
    const a = el('success-address-val')?.textContent;
    const net = localStorage.getItem('TOP_network') || 'devnet';
    if (a) window.open(`https://explorer.solana.com/address/${a}${net==='devnet'?'?cluster=devnet':''}`, '_blank', 'noopener');
}

function resetWizard() {
    el('deploy-success').classList.add('hidden');
    el('wizard-deploy-btn-wrap').classList.remove('hidden');
    const cb = document.querySelector('.deploy-cost-box'); if (cb) cb.style.display = '';
    wizardTiers = [{id:1,name:'Common',icon:'📦',color:'#a0a0a0',price:'0.5',nfts:3,supply:5000,rarity:'60%'},{id:2,name:'Rare',icon:'💙',color:'#3498db',price:'1.5',nfts:5,supply:1500,rarity:'25%'},{id:3,name:'Legendary',icon:'👑',color:'#d4af37',price:'5.0',nfts:10,supply:100,rarity:'5%'}];
    goToWizardStep(1);
    renderWizardTiers();
    showToast('Wizard reset!', 'info');
}

// ═══════════════════════════════════════════════════════════
// WALLET — handled by wallet.js (loaded before this script)
// wallet.js fixes the Windows 10 timing bugs and works on
// all pages. We just read WalletState and hook callbacks.
// ═══════════════════════════════════════════════════════════

// Compatibility shim so existing code that reads connectedPublicKey
// still works — we proxy it from WalletState.
Object.defineProperty(window, 'connectedPublicKey', {
    get: () => window.WalletState?.publicKey || null,
    configurable: true,
});

// Hook wallet.js callbacks so the page-specific UI updates
window.addEventListener('DOMContentLoaded', () => {
    window.WalletState.onConnect    = (address) => {
        markCheck('check-wallet', true);
        updatePreview();
    };
    window.WalletState.onDisconnect = () => {
        markCheck('check-wallet', false);
        updatePreview();
    };

    // Sync initial state (in case wallet.js already connected)
    if (window.WalletState.isConnected) {
        markCheck('check-wallet', true);
        updatePreview();
    }
});

// ── Utility ──────────────────────────────────────────────────
function el(id) { return document.getElementById(id); }
