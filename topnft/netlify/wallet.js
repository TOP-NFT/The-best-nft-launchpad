/**
 * ================================================================
 * wallet.js — Shared Phantom Wallet Connect
 * Used by: index.html, create.html, mint.html
 *
 * WHY THIS FILE EXISTS:
 *   The wallet connect code was duplicated across script.js,
 *   create-script.js, and mint-script.js — all with the same
 *   Windows 10 timing bugs. This single file fixes everything
 *   in one place and works on all three pages.
 *
 * THE 4 BUGS THIS FIXES:
 *
 *   BUG 1 — Race condition on Windows 10
 *     OLD: window.addEventListener('load', ...) was registered
 *          INSIDE the DOMContentLoaded callback. On Windows 10,
 *          'load' can fire before DOMContentLoaded finishes
 *          processing, so the auto-reconnect listener was never
 *          called. Result: wallet never auto-reconnects.
 *     FIX: Register the 'load' listener at the TOP LEVEL of this
 *          file, before any DOM is ready, so it always fires.
 *
 *   BUG 2 — Phantom injection timeout too short
 *     OLD: 10 retries × 200ms = only 2 seconds to find Phantom.
 *          Windows 10 Chrome extensions often take 3–5 seconds
 *          to fully inject, especially on older hardware.
 *     FIX: 25 retries × 250ms = 6.25 seconds total wait time.
 *
 *   BUG 3 — No feedback while waiting for Phantom
 *     OLD: If Phantom was slow, the button just did nothing.
 *          User thought it was broken and clicked multiple times.
 *     FIX: Show "Finding Phantom…" immediately on click, then
 *          "Waiting for approval…" when the popup opens.
 *
 *   BUG 4 — Button got permanently stuck on errors
 *     OLD: Some Phantom errors (non-4001) left the button in
 *          "Connecting…" state with no way to reset it.
 *     FIX: The 'finally' block always resets button state, and
 *          ALL errors show a user-readable message.
 * ================================================================
 */

'use strict';

// ── Shared state (readable by any page's script) ─────────────
window.WalletState = {
    publicKey     : null,       // PublicKey object when connected
    address       : '',         // string address e.g. "7xKX...AsU"
    isConnected   : false,
    onConnect     : null,       // optional callback(address) set by page
    onDisconnect  : null,       // optional callback() set by page
};

// ── Internal helpers ─────────────────────────────────────────

/** Find Phantom with extended retry for slow Windows 10 injection */
function _getProvider() {
    return new Promise((resolve) => {
        let attempts = 0;
        const MAX    = 25;          // 25 × 250ms = 6.25 seconds
        const DELAY  = 250;

        function attempt() {
            // Modern Phantom API (preferred)
            const pNew = window.phantom?.solana;
            if (pNew?.isPhantom) return resolve(pNew);

            // Legacy Phantom injection (some older versions)
            const pOld = window.solana;
            if (pOld?.isPhantom) return resolve(pOld);

            if (++attempts < MAX) {
                setTimeout(attempt, DELAY);
            } else {
                resolve(null); // Could not find Phantom after 6.25s
            }
        }

        attempt();
    });
}

/** Update every Connect Wallet button on the page */
function _updateAllButtons() {
    const addr    = window.WalletState.address;
    const short   = addr ? `${addr.slice(0,4)}…${addr.slice(-4)}` : null;

    // Desktop button (all pages)
    const btn     = document.getElementById('connect-wallet-btn');
    const btnText = document.getElementById('btn-text');
    const spinner = document.getElementById('btn-spinner');

    if (btnText)  btnText.textContent = short || 'Connect Wallet';
    if (spinner)  spinner.classList.add('hidden');
    if (btn) {
        btn.style.pointerEvents = 'auto';
        btn.style.opacity       = '1';
        if (short) btn.classList.add('connected');
        else       btn.classList.remove('connected');
    }

    // Mobile button (index page)
    const mobileBtn = document.getElementById('mobile-connect-btn');
    if (mobileBtn) {
        mobileBtn.textContent = short ? `${short} (Disconnect)` : 'Connect Wallet';
    }
}

/** Show the wallet status banner */
function _showBanner(msg, type, duration) {
    const banner = document.getElementById('wallet-status-banner');
    if (!banner) return;
    banner.textContent = msg;
    banner.className   = `wallet-banner ${type}`;
    clearTimeout(banner._walletTimer);
    banner._walletTimer = setTimeout(() => banner.classList.add('hidden'), duration || 4000);
}

/** Set the button into loading state */
function _setLoading(label) {
    const btn     = document.getElementById('connect-wallet-btn');
    const btnText = document.getElementById('btn-text');
    const spinner = document.getElementById('btn-spinner');

    if (btn)     btn.style.pointerEvents = 'none';
    if (btn)     btn.style.opacity       = '0.7';
    if (btnText) btnText.textContent     = label || 'Connecting…';
    if (spinner) spinner.classList.remove('hidden');
}

// ── Public: connect wallet ────────────────────────────────────
async function connectWallet() {
    _setLoading('Finding Phantom…');

    let provider;
    try {
        provider = await _getProvider();
    } catch (e) {
        provider = null;
    }

    if (!provider) {
        _updateAllButtons();
        _showBanner(
            '⚠️ Phantom not found. Make sure it\'s installed & enabled in Chrome extensions.',
            'error', 7000
        );
        // Small delay so banner is visible before the new tab opens
        setTimeout(() => window.open('https://phantom.app/', '_blank', 'noopener'), 500);
        return;
    }

    _setLoading('Waiting for approval…');

    try {
        const response               = await provider.connect();
        window.WalletState.publicKey  = response.publicKey;
        window.WalletState.address    = response.publicKey.toString();
        window.WalletState.isConnected= true;

        _showBanner(
            `✅ Connected: ${window.WalletState.address.slice(0,4)}…${window.WalletState.address.slice(-4)}`,
            'success', 4000
        );

        if (typeof window.WalletState.onConnect === 'function') {
            window.WalletState.onConnect(window.WalletState.address);
        }

    } catch (err) {
        // Code 4001 = user clicked "Cancel" in Phantom — not an error
        if (err.code === 4001) {
            _showBanner('Cancelled — connect your wallet when ready.', 'success', 3000);
        } else {
            // Log full error to help debug
            console.error('[Wallet] Connect error:', err);
            _showBanner(
                `❌ ${err.message || 'Connection failed'} — try refreshing the page.`,
                'error', 7000
            );
        }
    }

    _updateAllButtons();
}

// ── Public: disconnect wallet ─────────────────────────────────
async function disconnectWallet() {
    _setLoading('Disconnecting…');

    try {
        const provider = await _getProvider();
        if (provider) await provider.disconnect().catch(() => {});
    } catch {}

    window.WalletState.publicKey  = null;
    window.WalletState.address    = '';
    window.WalletState.isConnected= false;

    _showBanner('👋 Wallet disconnected.', 'success', 3000);

    if (typeof window.WalletState.onDisconnect === 'function') {
        window.WalletState.onDisconnect();
    }

    _updateAllButtons();
}

// ── Button click handler — wired to ALL pages ─────────────────
// We use event delegation on document so it works even if the
// button is added to the DOM after this script loads.
document.addEventListener('click', function (e) {
    const target = e.target.closest('#connect-wallet-btn, #mobile-connect-btn, #mint-connect-btn');
    if (!target) return;
    e.preventDefault();
    if (window.WalletState.isConnected) disconnectWallet();
    else connectWallet();
});

// ── AUTO-RECONNECT on page load ───────────────────────────────
// FIX #1: This listener is registered at the TOP LEVEL of the
// file — NOT inside DOMContentLoaded — so it is guaranteed to
// register before the 'load' event fires on all browsers.
window.addEventListener('load', async function autoReconnect() {
    const provider = await _getProvider();
    if (!provider) return;

    try {
        // onlyIfTrusted: true = never shows a popup.
        // Only reconnects if user previously approved this site.
        const response               = await provider.connect({ onlyIfTrusted: true });
        window.WalletState.publicKey  = response.publicKey;
        window.WalletState.address    = response.publicKey.toString();
        window.WalletState.isConnected= true;

        // Wait for DOM to be ready before updating buttons
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
            _updateAllButtons();
        } else {
            document.addEventListener('DOMContentLoaded', _updateAllButtons);
        }

        if (typeof window.WalletState.onConnect === 'function') {
            window.WalletState.onConnect(window.WalletState.address);
        }

        console.log('[Wallet] Auto-reconnected:', window.WalletState.address);
    } catch {
        // Expected when user hasn't approved this site yet — silently ignore
        console.log('[Wallet] No prior session. User must connect manually.');
    }
});

// ── Expose globally so pages can call these directly ──────────
window.connectWallet    = connectWallet;
window.disconnectWallet = disconnectWallet;
window._getProvider     = _getProvider;   // exposed for debugging

// ── Windows 10 diagnostic (logs to console, not user-facing) ──
(function diagnose() {
    const isWin = navigator.userAgent.includes('Windows');
    if (!isWin) return;

    // Check every 500ms for up to 10s and log Phantom status
    let checks = 0;
    const poll = setInterval(() => {
        const found = !!(window.phantom?.solana?.isPhantom || window.solana?.isPhantom);
        console.log(`[Wallet] Windows check ${++checks}/20 — Phantom found: ${found}`);
        if (found || checks >= 20) {
            clearInterval(poll);
            if (!found) {
                console.warn('[Wallet] Phantom not detected after 10s. Possible causes:',
                    '\n 1. Phantom extension is disabled in Chrome extensions',
                    '\n 2. Phantom is locked (needs password)',
                    '\n 3. Chrome extension permissions not granted for this URL',
                    '\n 4. Try reloading the page with Ctrl+Shift+R'
                );
            }
        }
    }, 500);
}());
