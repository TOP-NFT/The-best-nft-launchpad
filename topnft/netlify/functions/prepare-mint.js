'use strict';

const { createUmi }              = require('@metaplex-foundation/umi-bundle-defaults');
const { mplTokenMetadata }       = require('@metaplex-foundation/mpl-token-metadata');
const {
  mplCandyMachine, mintV1, fetchCandyMachine,
  getMerkleProof,
} = require('@metaplex-foundation/mpl-candy-machine');
const {
  createNoopSigner, generateSigner, signerIdentity,
  publicKey: toPublicKey, some,
} = require('@metaplex-foundation/umi');

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return ok({});
  if (event.httpMethod !== 'POST')    return err(405, 'Method not allowed');

  let body;
  try { body = JSON.parse(event.body); } catch { return err(400, 'Invalid JSON'); }

  const { candyMachineAddress, collectionMintAddress, minterPublicKey, group, configCID } = body;

  if (!candyMachineAddress || !collectionMintAddress || !minterPublicKey)
    return err(400, 'candyMachineAddress, collectionMintAddress, and minterPublicKey are required');

  const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';

  // ── Boot Umi with minter as NoopSigner ──────────────────────
  const umi = createUmi(RPC_URL).use(mplCandyMachine()).use(mplTokenMetadata());
  const minterKey    = toPublicKey(minterPublicKey);
  const minterSigner = createNoopSigner(minterKey);
  umi.use(signerIdentity(minterSigner));

  // ── Fetch the Candy Machine on-chain ────────────────────────
  let cm;
  try {
    cm = await fetchCandyMachine(umi, toPublicKey(candyMachineAddress));
  } catch {
    return err(404, 'Candy Machine not found. Check the address and network.');
  }

  if (cm.itemsRedeemed >= cm.itemsAvailable)
    return err(410, 'This collection is sold out!');

  // ── Load collection config from IPFS ────────────────────────
  // Config holds the wallet lists needed for Merkle proof computation.
  let config = null;
  if (configCID) {
    try {
      const res = await fetch(`https://${configCID}.ipfs.nftstorage.link/config.json`);
      if (res.ok) config = await res.json();
    } catch { /* continue without config — public mint */ }
  }

  // ── Determine which group to mint from ──────────────────────
  // If no group specified, auto-determine based on time + allowlist status
  const activeGroup = group || autoGroup(config, minterPublicKey);

  // ── Build mintArgs ──────────────────────────────────────────
  const mintArgs = {};

  // For OG and WL groups, compute the Merkle proof
  if (activeGroup === 'og' && config?.phases?.og?.wallets?.length) {
    const wallets = config.phases.og.wallets;
    if (!wallets.includes(minterPublicKey))
      return err(403, 'Your wallet is not on the OG list for this collection.');
    try {
      mintArgs.allowList = some({
        proof: getMerkleProof(
          wallets.map(w => toPublicKey(w)),
          toPublicKey(minterPublicKey)
        ),
      });
    } catch {
      return err(400, 'Could not compute Merkle proof for OG allowlist.');
    }
  }

  if (activeGroup === 'wl' && config?.phases?.whitelist?.wallets?.length) {
    const wallets = config.phases.whitelist.wallets;
    if (!wallets.includes(minterPublicKey))
      return err(403, 'Your wallet is not on the Whitelist for this collection.');
    try {
      mintArgs.allowList = some({
        proof: getMerkleProof(
          wallets.map(w => toPublicKey(w)),
          toPublicKey(minterPublicKey)
        ),
      });
    } catch {
      return err(400, 'Could not compute Merkle proof for Whitelist.');
    }
  }

  // SolPayment destination: find from the active group's guards
  const group_obj = cm.candyGuard?.groups?.find(g => g.label === activeGroup);
  const defaultGuards = cm.candyGuard?.guards;

  const payGuard = group_obj?.guards?.solPayment ?? defaultGuards?.solPayment;
  if (payGuard?.__option === 'Some') {
    mintArgs.solPayment = some({ destination: payGuard.value.destination });
  }

  // ── Generate fresh NFT mint keypair ─────────────────────────
  const nftMint = generateSigner(umi);

  // ── Build mint instruction ──────────────────────────────────
  const mintBuilder = mintV1(umi, {
    candyMachine: toPublicKey(candyMachineAddress),
    asset       : nftMint,
    collection  : toPublicKey(collectionMintAddress),
    group       : activeGroup ? some(activeGroup) : undefined,
    mintArgs,
  });

  // Build tx with latest blockhash and partially sign with nftMint keypair
  const tx              = await mintBuilder.buildWithLatestBlockhash(umi);
  const partiallySignedTx = await nftMint.signTransaction(tx);
  const serializedBytes = umi.transactions.serialize(partiallySignedTx);

  return ok({
    success             : true,
    serializedTransaction: Buffer.from(serializedBytes).toString('base64'),
    nftMintAddress      : nftMint.publicKey.toString(),
    groupUsed           : activeGroup,
  });
};

// Determine the best group based on current time and wallet membership
function autoGroup(config, minterPublicKey) {
  if (!config?.phases) return 'pub';
  const now = Date.now();

  const og = config.phases.og;
  if (og) {
    const start = og.startDate ? new Date(og.startDate).getTime() : 0;
    const end   = og.endDate   ? new Date(og.endDate).getTime()   : Infinity;
    if (now >= start && now <= end && og.wallets?.includes(minterPublicKey)) return 'og';
  }

  const wl = config.phases.whitelist;
  if (wl) {
    const start = wl.startDate ? new Date(wl.startDate).getTime() : 0;
    const end   = wl.endDate   ? new Date(wl.endDate).getTime()   : Infinity;
    if (now >= start && now <= end && wl.wallets?.includes(minterPublicKey)) return 'wl';
  }

  return 'pub';
}

const ok  = (b)    => ({ statusCode: 200, headers: CORS, body: JSON.stringify(b) });
const err = (c, m) => ({ statusCode: c,   headers: CORS, body: JSON.stringify({ error: m }) });
