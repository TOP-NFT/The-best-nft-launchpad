'use strict';

const { createUmi }              = require('@metaplex-foundation/umi-bundle-defaults');
const { mplTokenMetadata }       = require('@metaplex-foundation/mpl-token-metadata');
const {
  mplCandyMachine, fetchCandyMachine,
} = require('@metaplex-foundation/mpl-candy-machine');
const { publicKey: toPublicKey } = require('@metaplex-foundation/umi');

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return ok({});

  const { cm, cfg } = event.queryStringParameters || {};
  if (!cm) return err(400, 'Missing ?cm= (Candy Machine address)');

  const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
  const NETWORK = process.env.SOLANA_NETWORK || 'devnet';

  // ── Fetch Candy Machine on-chain ────────────────────────────
  const umi = createUmi(RPC_URL).use(mplCandyMachine()).use(mplTokenMetadata());
  let cmData;
  try {
    cmData = await fetchCandyMachine(umi, toPublicKey(cm));
  } catch {
    return err(404, 'Candy Machine not found. Check the address and network.');
  }

  // ── Load config from IPFS ───────────────────────────────────
  let config = null;
  if (cfg) {
    try {
      const res = await fetch(`https://${cfg}.ipfs.nftstorage.link/config.json`);
      if (res.ok) config = await res.json();
    } catch {}
  }

  const available = Number(cmData.itemsAvailable);
  const redeemed  = Number(cmData.itemsRedeemed);
  const remaining = available - redeemed;

  // ── Determine phases with active status ─────────────────────
  const now    = Date.now();
  const phases = buildPhaseStatus(config?.phases || {}, now);

  return ok({
    candyMachineAddress  : cm,
    collectionMintAddress: cmData.collectionMint.toString(),
    configCID            : cfg || null,
    supply               : available,
    minted               : redeemed,
    remaining,
    soldOut              : remaining === 0,
    network              : NETWORK,
    name                 : config?.name        || 'NFT Collection',
    symbol               : config?.symbol      || 'NFT',
    description          : config?.description || '',
    creatorAddress       : config?.creatorAddress || '',
    phases,
    activePhase          : phases.find(p => p.active)?.id || 'pub',
  });
};

function buildPhaseStatus(phases, now) {
  const result = [];

  if (phases.og) {
    const start = phases.og.startDate ? new Date(phases.og.startDate).getTime() : 0;
    const end   = phases.og.endDate   ? new Date(phases.og.endDate).getTime()   : Infinity;
    result.push({
      id        : 'og',
      label     : 'OG',
      price     : phases.og.price,
      limit     : phases.og.limit,
      walletCount: phases.og.wallets?.length || 0,
      startDate : phases.og.startDate || null,
      endDate   : phases.og.endDate   || null,
      active    : now >= start && now < end,
      upcoming  : now < start,
      ended     : end !== Infinity && now >= end,
    });
  }

  if (phases.whitelist) {
    const start = phases.whitelist.startDate ? new Date(phases.whitelist.startDate).getTime() : 0;
    const end   = phases.whitelist.endDate   ? new Date(phases.whitelist.endDate).getTime()   : Infinity;
    result.push({
      id        : 'wl',
      label     : 'Whitelist',
      price     : phases.whitelist.price,
      limit     : phases.whitelist.limit,
      walletCount: phases.whitelist.wallets?.length || 0,
      startDate : phases.whitelist.startDate || null,
      endDate   : phases.whitelist.endDate   || null,
      active    : now >= start && now < end,
      upcoming  : now < start,
      ended     : end !== Infinity && now >= end,
    });
  }

  const pubStart = phases.public?.startDate ? new Date(phases.public.startDate).getTime() : 0;
  result.push({
    id       : 'pub',
    label    : 'Public',
    price    : phases.public?.price || 0,
    limit    : phases.public?.limit || 10,
    startDate: phases.public?.startDate || null,
    endDate  : null,
    active   : now >= pubStart,
    upcoming : now < pubStart,
    ended    : false,
  });

  return result;
}

const ok  = (b)    => ({ statusCode: 200, headers: CORS, body: JSON.stringify(b) });
const err = (c, m) => ({ statusCode: c,   headers: CORS, body: JSON.stringify({ error: m }) });
