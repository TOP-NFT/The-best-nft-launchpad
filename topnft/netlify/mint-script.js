'use strict';

// ── Read URL params ──────────────────────────────────────────
const params  = new URLSearchParams(window.location.search);
const CM_ADDR = params.get('cm')  || '';
const CFG_CID = params.get('cfg') || '';

window._solanaRpcUrl = 'https://api.devnet.solana.com';

let collectionData = null;
let countdownTimer = null;

// ── Custom cursor ────────────────────────────────────────────
const cursor = document.getElementById('cursor');
if (cursor) document.addEventListener('mousemove', e => {
  cursor.style.left = e.clientX + 'px';
  cursor.style.top  = e.clientY + 'px';
});

// ── Wallet UI for mint page ───────────────────────────────────
// wallet.js handles the actual connect/disconnect logic.
// We just update the mint-specific UI (show/hide mint button etc.)
function updateWalletUI() {
  const btn     = document.getElementById('connect-wallet-btn');
  const btnText = document.getElementById('btn-text');
  const prompt  = document.getElementById('connect-prompt');
  const mintBtn = document.getElementById('btn-mint');
  const isConn  = window.WalletState?.isConnected;

  if (isConn) {
    const k = window.WalletState.address;
    if (btnText) btnText.textContent = `${k.slice(0,4)}…${k.slice(-4)}`;
    if (btn) btn.classList.add('connected');
    if (prompt)  prompt.classList.add('hidden');
    if (mintBtn) mintBtn.classList.remove('hidden');
    checkEligibility();
  } else {
    if (btnText) btnText.textContent = 'Connect Wallet';
    if (btn) btn.classList.remove('connected');
    if (prompt)  prompt.classList.remove('hidden');
    if (mintBtn) mintBtn.classList.add('hidden');
    setEligibility('unknown', 'Connect your wallet to check eligibility');
  }
}

// Hook wallet.js callbacks
window.WalletState = window.WalletState || {};
window.WalletState.onConnect    = () => updateWalletUI();
window.WalletState.onDisconnect = () => updateWalletUI();

// Also sync whenever the page calls updateWalletUI manually
// (wallet.js auto-reconnect fires before DOMContentLoaded on load)
document.addEventListener('DOMContentLoaded', () => updateWalletUI());

// ── Compatibility shim for connectedWallet reads ─────────────
// Some functions below read connectedWallet — proxy to WalletState
Object.defineProperty(window, 'connectedWallet', {
  get: () => window.WalletState?.publicKey || null,
  configurable: true,
});

// showBanner still needed for mint-specific messages
function showBanner(msg, type, duration) {
  const b = document.getElementById('wallet-status-banner');
  if (!b) return;
  b.textContent = msg;
  b.className = `wallet-banner ${type || 'success'}`;
  clearTimeout(b._t);
  b._t = setTimeout(() => b.classList.add('hidden'), duration || 4000);
}

// ── Load collection data ─────────────────────────────────────
async function loadCollection() {
  if (!CM_ADDR) {
    showError('No collection address in URL. Add ?cm=YOUR_CM_ADDRESS to the URL.');
    return;
  }

  try {
    const url = `/.netlify/functions/get-collection?cm=${CM_ADDR}${CFG_CID ? `&cfg=${CFG_CID}` : ''}`;
    const res  = await fetch(url);
    const data = await res.json();

    if (!res.ok) { showError(data.error || 'Failed to load collection'); return; }

    collectionData = data;

    if (data.network === 'devnet') window._solanaRpcUrl = 'https://api.devnet.solana.com';

    renderCollection(data);
    document.getElementById('mint-loading').classList.add('hidden');
    document.getElementById('mint-main').classList.remove('hidden');
    document.getElementById('page-title').textContent = `Mint ${data.name} — Throne Of Power`;

    // Sync wallet UI with current state from wallet.js
    updateWalletUI();

  } catch (err) {
    showError('Network error loading collection: ' + err.message);
  }
}

function renderCollection(data) {
  // NFT image
  const imageArea = document.getElementById('nft-image-area');
  if (imageArea) {
    if (data.coverImageUrl) {
      imageArea.innerHTML = `<img src="${data.coverImageUrl}" alt="${data.name}">`;
    } else {
      imageArea.textContent = '🏰';
    }
  }

  // Name & symbol
  el('nft-col-name').textContent   = data.name;
  el('nft-col-symbol').textContent = data.symbol;

  // Stats
  el('stat-minted').textContent    = data.minted.toLocaleString();
  el('stat-remaining').textContent = data.remaining.toLocaleString();
  el('stat-supply').textContent    = data.supply.toLocaleString();

  // Progress bar
  const pct = data.supply > 0 ? Math.round((data.minted / data.supply) * 100) : 0;
  el('mint-progress-fill').style.width = pct + '%';
  el('progress-pct').textContent = `${pct}% minted`;

  if (data.soldOut) {
    el('stat-sold-out').classList.remove('hidden');
    el('btn-mint').disabled = true;
    el('mint-btn-text').textContent = 'Sold Out';
  }

  // Render phase tabs and active phase
  renderPhases(data.phases, data.activePhase);

  // Kick off the countdown ticker
  startCountdown(data.phases, data.activePhase);
}

// ── Phase rendering ──────────────────────────────────────────
function renderPhases(phases, activePhaseId) {
  const nav = el('phases-nav');
  if (!nav || !phases) return;
  nav.innerHTML = '';

  phases.forEach(phase => {
    const btn = document.createElement('button');
    btn.className = 'phase-tab'
      + (phase.id === activePhaseId ? ' active' : '')
      + (phase.ended   ? ' ended'   : '')
      + (phase.upcoming ? ' upcoming' : '');

    const dot = phase.active ? 'dot-active' : phase.upcoming ? 'dot-upcoming' : 'dot-ended';
    btn.innerHTML = `<span class="phase-badge-dot ${dot}"></span>${phase.label}`;

    if (!phase.ended) {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.phase-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderActivePhaseCard(phase, phases);
        startCountdown(phases, phase.id);
      });
    }
    nav.appendChild(btn);
  });

  const active = phases.find(p => p.id === activePhaseId) || phases[phases.length - 1];
  renderActivePhaseCard(active, phases);
}

function renderActivePhaseCard(phase, allPhases) {
  el('phase-title').textContent = `${phase.label} Phase`;

  const isFreeMint = phase.price === 0;
  const priceLabel = isFreeMint ? '🆓 FREE' : `◎ ${phase.price} SOL`;

  const nextPhase = allPhases?.find(p => p.upcoming && p.id !== phase.id);

  el('phase-details').innerHTML = `
    <div class="phase-detail-row">
      <span class="label">Price per NFT</span>
      <span class="value" style="color:${isFreeMint ? '#2ecc71' : 'var(--primary-gold)'}">${priceLabel}</span>
    </div>
    <div class="phase-detail-row">
      <span class="label">Max per wallet</span>
      <span class="value">${phase.limit} NFT${phase.limit !== 1 ? 's' : ''}</span>
    </div>
    ${phase.walletCount ? `
    <div class="phase-detail-row">
      <span class="label">Eligible wallets</span>
      <span class="value">${phase.walletCount.toLocaleString()}</span>
    </div>` : ''}
    ${phase.startDate ? `
    <div class="phase-detail-row">
      <span class="label">Start</span>
      <span class="value">${new Date(phase.startDate).toLocaleString()}</span>
    </div>` : ''}
    ${phase.endDate ? `
    <div class="phase-detail-row">
      <span class="label">End</span>
      <span class="value">${new Date(phase.endDate).toLocaleString()}</span>
    </div>` : ''}
    ${nextPhase ? `
    <div class="phase-detail-row">
      <span class="label">Next phase</span>
      <span class="value" style="color:var(--primary-gold)">${nextPhase.label}</span>
    </div>` : ''}
  `;

  el('mint-btn-text').textContent = isFreeMint ? '✨ Mint Free' : `◎ Mint for ${phase.price} SOL`;
}

// ── Countdown ────────────────────────────────────────────────
function startCountdown(phases, activePhaseId) {
  clearInterval(countdownTimer);
  const phase = phases?.find(p => p.id === activePhaseId);
  if (!phase) return;

  const wrap = el('countdown-wrap');
  if (!wrap) return;

  function tick() {
    const now = Date.now();
    let target = null;
    let label  = '';

    if (phase.upcoming && phase.startDate) {
      target = new Date(phase.startDate).getTime();
      label  = 'Phase starts in';
    } else if (phase.active && phase.endDate) {
      target = new Date(phase.endDate).getTime();
      label  = 'Phase ends in';
    }

    if (!target) { wrap.classList.add('hidden'); return; }

    const diff = target - now;
    if (diff <= 0) { wrap.classList.add('hidden'); clearInterval(countdownTimer); loadCollection(); return; }

    wrap.classList.remove('hidden');
    el('countdown-label').textContent = label;

    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000)  / 60000);
    const s = Math.floor((diff % 60000)    / 1000);

    el('cd-d').textContent = String(d).padStart(2,'0');
    el('cd-h').textContent = String(h).padStart(2,'0');
    el('cd-m').textContent = String(m).padStart(2,'0');
    el('cd-s').textContent = String(s).padStart(2,'0');
  }

  tick();
  countdownTimer = setInterval(tick, 1000);
}

// ── Eligibility check ────────────────────────────────────────
function checkEligibility() {
  if (!collectionData || !window.WalletState?.isConnected) return;

  const walletAddr = window.WalletState.address;
  const phase      = collectionData.phases?.find(p => p.id === collectionData.activePhase);

  if (!phase) return;
  if (collectionData.soldOut) { setEligibility('denied', '🔴 This collection is sold out'); el('btn-mint').disabled = true; return; }

  if (phase.id === 'pub') {
    setEligibility('allowed', '✅ You can mint in the public phase');
    el('btn-mint').disabled = false;
    return;
  }

  // For OG/WL phases, check wallet against list
  const listKey = phase.id === 'og' ? 'og' : 'whitelist';
  const phaseConfig = collectionData.phases?.find(p => p.id === phase.id);
  // NOTE: wallet list is in the IPFS config, not directly in collectionData.
  // We perform a server-side check when minting — just give a helpful message here.
  setEligibility('unknown', `🔍 ${phase.label} phase active — wallet eligibility checked at mint time`);
  el('btn-mint').disabled = false;
}

function setEligibility(type, msg) {
  const banner = el('eligibility-banner');
  if (!banner) return;
  banner.className = `eligibility-banner ${type}`;
  banner.textContent = msg;
}

// ── Mint ─────────────────────────────────────────────────────
el('btn-mint')?.addEventListener('click', async () => {
  if (!collectionData || !window.WalletState?.isConnected) return;

  const btn     = el('btn-mint');
  const btnText = el('mint-btn-text');
  const spinner = el('mint-spinner');
  const result  = el('mint-result');

  btn.disabled = true;
  spinner.classList.remove('hidden');

  try {
    const mintResult = await window.MintHandler.mintNFT({
      candyMachineAddress  : collectionData.candyMachineAddress,
      collectionMintAddress: collectionData.collectionMintAddress,
      configCID            : CFG_CID,
      group                : collectionData.activePhase,
      onStatus             : (msg) => { btnText.textContent = msg; },
    });

    // Show success card
    el('result-mint-addr').textContent        = mintResult.nftMintAddress;
    el('result-explorer-link').href           = mintResult.explorerUrl;
    result.classList.remove('hidden');
    btn.classList.add('hidden');

    showBanner('👑 NFT minted! Check your Phantom wallet.', 'success', 7000);

    // Refresh stats
    loadCollection();

  } catch (e) {
    showBanner(`❌ Mint failed: ${e.message}`, 'error', 8000);
    btn.disabled = false;
    btnText.textContent = collectionData.phases?.find(p => p.id === collectionData.activePhase)?.price === 0
      ? '✨ Mint Free'
      : `◎ Mint for ${collectionData.phases?.find(p => p.id === collectionData.activePhase)?.price} SOL`;
  } finally {
    spinner.classList.add('hidden');
  }
});

el('mint-another-btn')?.addEventListener('click', () => {
  el('mint-result').classList.add('hidden');
  el('btn-mint').classList.remove('hidden');
  el('btn-mint').disabled = false;
  const phase = collectionData?.phases?.find(p => p.id === collectionData.activePhase);
  el('mint-btn-text').textContent = phase?.price === 0 ? '✨ Mint Free' : `◎ Mint for ${phase?.price} SOL`;
});

// ── Error display ────────────────────────────────────────────
function showError(msg) {
  el('mint-loading').classList.add('hidden');
  el('mint-main').classList.add('hidden');
  el('mint-error').classList.remove('hidden');
  el('mint-error-msg').textContent = msg;
}

function el(id) { return document.getElementById(id); }

// ── Init ─────────────────────────────────────────────────────
loadCollection();
