'use strict';

document.addEventListener('DOMContentLoaded', () => {

    // ── Custom cursor ────────────────────────────────────────
    const cursor = document.getElementById('cursor');
    if (cursor) {
        document.addEventListener('mousemove', e => {
            cursor.style.left = e.clientX + 'px';
            cursor.style.top  = e.clientY + 'px';
        });
    }

    // ── Typing animation ─────────────────────────────────────
    const phrases = [
        'Mint Your Legend ⚔️',
        'Rule the Solana Kingdom 👑',
        'Deploy Collections in 45 Seconds 🚀',
        'OG · Whitelist · Public Phases 💎',
        'Your NFTs. Your Royalties. Forever. ⚡',
    ];
    let phraseIdx = 0, charIdx = 0, deleting = false;
    const typedEl = document.getElementById('typed-text');

    function type() {
        if (!typedEl) return;
        const current = phrases[phraseIdx];
        if (!deleting) {
            typedEl.textContent = current.slice(0, ++charIdx);
            if (charIdx === current.length) { deleting = true; setTimeout(type, 2200); return; }
        } else {
            typedEl.textContent = current.slice(0, --charIdx);
            if (charIdx === 0) { deleting = false; phraseIdx = (phraseIdx + 1) % phrases.length; }
        }
        setTimeout(type, deleting ? 45 : 90);
    }
    setTimeout(type, 1000);

    // ── NFT card tilt effect ─────────────────────────────────
    document.querySelectorAll('.nft-card').forEach(card => {
        card.addEventListener('mousemove', e => {
            const rect    = card.getBoundingClientRect();
            const rotateX = (((e.clientY - rect.top)  / rect.height) - 0.5) * -8;
            const rotateY = (((e.clientX - rect.left) / rect.width)  - 0.5) *  8;
            card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
        });
        card.addEventListener('mouseleave', () => {
            card.style.transform = 'perspective(1000px) rotateX(0) rotateY(0)';
        });
    });

    // ── Scroll fade-in observer ──────────────────────────────
    const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1 });

    document.querySelectorAll(
        '.collections-section, .how-it-works-section, .features-section, .launch-section'
    ).forEach(el => observer.observe(el));

    // ── Collection filter buttons ────────────────────────────
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            filterCollections(btn.dataset.filter);
        });
    });

    function filterCollections(filter) {
        document.querySelectorAll('.nft-card').forEach(card => {
            if (filter === 'all') { card.style.display = 'flex'; return; }
            const badge = card.querySelector('.card-phase-badge');
            card.style.display = (badge && badge.classList.contains(filter)) ? 'flex' : 'none';
        });
    }

    // ── Mobile nav ───────────────────────────────────────────
    document.getElementById('mobile-menu-btn')?.addEventListener('click', () => {
        document.getElementById('mobile-nav')?.classList.toggle('hidden');
    });

    // ── Load live collections from localStorage ──────────────
    loadLiveCollections();

    // ── Platform stats ───────────────────────────────────────
    animateCounter('stat-total-collections', getCollectionCount());
    animateCounter('hero-stat-collections',  getCollectionCount());

    // ── Network badge ────────────────────────────────────────
    const network = localStorage.getItem('TOP_network') || 'devnet';
    const badge   = document.getElementById('footer-network-badge');
    if (badge) badge.textContent = network === 'mainnet' ? '🟢 Mainnet' : '🔵 Devnet';

    // ── Hook wallet callbacks (wallet.js handles the connect) ─
    // When wallet.js connects, update our checklist and stats.
    window.WalletState.onConnect = (address) => {
        console.log('[script.js] Wallet connected:', address);
    };

}); // end DOMContentLoaded

// ── Live collections ─────────────────────────────────────────
function loadLiveCollections() {
    const grid = document.getElementById('live-collection-grid');
    if (!grid) return;

    const collections = [];

    const lastCM      = localStorage.getItem('TOP_lastCM');
    const lastColl    = localStorage.getItem('TOP_lastColl');
    const lastConfig  = localStorage.getItem('TOP_lastConfig');
    const lastMintUrl = localStorage.getItem('TOP_lastMintUrl');
    const network     = localStorage.getItem('TOP_network') || 'devnet';

    if (lastCM && lastColl) {
        collections.push({
            candyMachineAddress  : lastCM,
            collectionMintAddress: lastColl,
            configCID            : lastConfig  || '',
            mintPageUrl          : lastMintUrl || `mint.html?cm=${lastCM}`,
            network,
            name  : localStorage.getItem('TOP_lastName')   || 'Your Collection',
            symbol: localStorage.getItem('TOP_lastSymbol') || '',
        });
    }

    try {
        const stored = JSON.parse(localStorage.getItem('TOP_collections') || '[]');
        stored.forEach(c => {
            if (!collections.find(x => x.candyMachineAddress === c.candyMachineAddress))
                collections.push(c);
        });
    } catch {}

    if (collections.length === 0) return;

    // Hide the 3 placeholder cards
    for (let i = 1; i <= 3; i++) {
        const c = grid.children[i - 1];
        if (c) c.style.display = 'none';
    }

    const devnet = network !== 'mainnet';

    collections.forEach(col => {
        const card = document.createElement('div');
        card.className = 'nft-card';
        const shortCM = `${col.candyMachineAddress.slice(0,6)}…${col.candyMachineAddress.slice(-4)}`;
        const keyId   = col.candyMachineAddress.slice(0, 8);
        card.innerHTML = `
            <div class="card-phase-badge minting">🟢 Live</div>
            <div style="aspect-ratio:1;background:rgba(212,175,55,.05);display:flex;align-items:center;justify-content:center;font-size:3.5rem">🏰</div>
            <div class="card-info">
                <div class="card-info-top">
                    <div>
                        <h3>${escapeHtml(col.name || 'Untitled Collection')}</h3>
                        <p class="card-creator">${escapeHtml(col.symbol || '')}</p>
                    </div>
                    <div class="card-network-badge">${devnet ? '🔵 Dev' : '🟢 Main'}</div>
                </div>
                <div class="card-stats">
                    <div class="card-stat"><span class="cs-label">CM</span><span class="cs-val" style="font-size:.65rem">${shortCM}</span></div>
                    <div class="card-stat"><span class="cs-label">Minted</span><span class="cs-val" id="stat-m-${keyId}">—</span></div>
                    <div class="card-stat"><span class="cs-label">Supply</span><span class="cs-val" id="stat-s-${keyId}">—</span></div>
                </div>
                <div class="card-progress-wrap">
                    <div class="card-progress-track"><div class="card-progress-fill" id="prog-${keyId}" style="width:0%"></div></div>
                    <span class="card-progress-pct" id="pct-${keyId}">Loading…</span>
                </div>
                <a href="${escapeHtml(col.mintPageUrl)}" class="btn-card-mint">Mint Now →</a>
            </div>`;

        card.addEventListener('mousemove', e => {
            const r = card.getBoundingClientRect();
            card.style.transform = `perspective(1000px) rotateX(${(((e.clientY-r.top)/r.height)-.5)*-8}deg) rotateY(${(((e.clientX-r.left)/r.width)-.5)*8}deg)`;
        });
        card.addEventListener('mouseleave', () => { card.style.transform = ''; });

        grid.appendChild(card);

        // Fetch live stats
        fetch(`/.netlify/functions/get-collection?cm=${col.candyMachineAddress}${col.configCID?`&cfg=${col.configCID}`:''}`)
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (!data) return;
                const pct = data.supply > 0 ? Math.round((data.minted/data.supply)*100) : 0;
                const pEl = document.getElementById(`prog-${keyId}`);
                const tEl = document.getElementById(`pct-${keyId}`);
                const mEl = document.getElementById(`stat-m-${keyId}`);
                const sEl = document.getElementById(`stat-s-${keyId}`);
                if (pEl)  pEl.style.width     = pct + '%';
                if (tEl)  tEl.textContent     = data.soldOut ? '🔴 Sold out' : `${pct}% minted`;
                if (mEl)  mEl.textContent     = data.minted.toLocaleString();
                if (sEl)  sEl.textContent     = data.supply.toLocaleString();
                animateCounter('stat-total-minted',  data.minted);
                animateCounter('hero-stat-minted',   data.minted);
            })
            .catch(() => {
                const tEl = document.getElementById(`pct-${keyId}`);
                if (tEl) tEl.textContent = 'Stats unavailable';
            });
    });
}

function getCollectionCount() {
    let count = localStorage.getItem('TOP_lastCM') ? 1 : 0;
    try { count += JSON.parse(localStorage.getItem('TOP_collections') || '[]').length; } catch {}
    return count;
}

function animateCounter(id, target) {
    const el = document.getElementById(id);
    if (!el || !target || target === 0) return;
    let n = 0;
    const step = Math.ceil(target / 40);
    const t = setInterval(() => {
        n = Math.min(n + step, target);
        el.textContent = n.toLocaleString();
        if (n >= target) clearInterval(t);
    }, 40);
}

function closeMobileNav() {
    document.getElementById('mobile-nav')?.classList.add('hidden');
}

function escapeHtml(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
