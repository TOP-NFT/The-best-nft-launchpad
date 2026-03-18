'use strict';

const { createUmi }               = require('@metaplex-foundation/umi-bundle-defaults');
const { mplTokenMetadata, createNft } = require('@metaplex-foundation/mpl-token-metadata');
const {
  mplCandyMachine, createCandyMachine, addConfigLines,
  getMerkleRoot, TokenStandard,
} = require('@metaplex-foundation/mpl-candy-machine');
const {
  createSignerFromKeypair, signerIdentity, generateSigner,
  percentAmount, sol, some, none, publicKey: toPublicKey,
} = require('@metaplex-foundation/umi');
const bs58       = require('bs58');
const { NFTStorage, File } = require('nft.storage');

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return ok({});
  if (event.httpMethod !== 'POST')    return err(405, 'Method not allowed');

  const TREASURY_KEY  = process.env.TREASURY_PRIVATE_KEY;
  const STORAGE_KEY   = process.env.NFT_STORAGE_KEY;
  const RPC_URL       = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
  const NETWORK       = process.env.SOLANA_NETWORK || 'devnet';
  const PLAT_SHARE    = parseFloat(process.env.PLATFORM_ROYALTY_SHARE || '0');
  const PLAT_WALLET   = process.env.PLATFORM_WALLET_ADDRESS;

  if (!TREASURY_KEY) return err(500, 'TREASURY_PRIVATE_KEY not set in Netlify env vars');
  if (!STORAGE_KEY)  return err(500, 'NFT_STORAGE_KEY not set in Netlify env vars');

  let body;
  try { body = JSON.parse(event.body); } catch { return err(400, 'Invalid JSON'); }

  const {
    name, symbol, description = '', supply, royalty = 5,
    items = [],           // [{ name, uri }] from upload step
    configCID = '',       // pre-uploaded config CID (optional, from upload step)
    creatorAddress = '',  // creator's Phantom wallet
    phases = {},          // { og, whitelist, public }
  } = body;

  if (!name || !symbol || !supply || !items.length)
    return err(400, 'name, symbol, supply, and items[] are all required');

  // ── Boot Umi ────────────────────────────────────────────────
  const umi = createUmi(RPC_URL).use(mplCandyMachine()).use(mplTokenMetadata());
  const secretBytes  = bs58.decode(TREASURY_KEY);
  const keypair      = umi.eddsa.createKeypairFromSecretKey(secretBytes);
  const treasury     = createSignerFromKeypair(umi, keypair);
  umi.use(signerIdentity(treasury));

  // ── Check balance ───────────────────────────────────────────
  const balLamports = await umi.rpc.getBalance(treasury.publicKey);
  const balSol      = Number(balLamports.basisPoints) / 1e9;
  if (balSol < 0.05) return err(402, `Treasury balance too low: ${balSol.toFixed(4)} SOL. Need at least 0.05 SOL.`);

  // ── Build Merkle roots for OG and Whitelist phases ──────────
  const ogPhase  = phases.og       || {};
  const wlPhase  = phases.whitelist || {};
  const pubPhase = phases.public   || {};

  // Parse wallet address lists
  const parseWallets = (list) => {
    if (!list) return [];
    const arr = typeof list === 'string'
      ? list.split(/[\n,]+/).map(s => s.trim()).filter(Boolean)
      : Array.isArray(list) ? list : [];
    return arr.filter(addr => addr.length >= 32);
  };

  const ogWallets  = parseWallets(ogPhase.wallets);
  const wlWallets  = parseWallets(wlPhase.wallets);

  // Convert addresses to UmiPublicKey for Merkle computation
  let ogRoot  = null;
  let wlRoot  = null;
  try {
    if (ogWallets.length > 0)
      ogRoot  = getMerkleRoot(ogWallets.map(w => toPublicKey(w)));
    if (wlWallets.length > 0)
      wlRoot  = getMerkleRoot(wlWallets.map(w => toPublicKey(w)));
  } catch (e) {
    return err(400, 'Invalid wallet address in allowlist: ' + e.message);
  }

  // ── Upload config JSON to IPFS for use by mint page ─────────
  // Stores wallet lists so the mint page can compute Merkle proofs.
  const storageClient = new NFTStorage({ token: STORAGE_KEY });
  const config = {
    name, symbol, description,
    supply: parseInt(supply, 10),
    royalty: parseFloat(royalty),
    creatorAddress,
    network: NETWORK,
    phases: {
      og: ogPhase.enabled ? {
        wallets   : ogWallets,
        startDate : ogPhase.startDate  || null,
        endDate   : ogPhase.endDate    || null,
        price     : parseFloat(ogPhase.price  || 0),
        limit     : parseInt(ogPhase.limit    || 2, 10),
      } : null,
      whitelist: wlPhase.enabled ? {
        wallets   : wlWallets,
        startDate : wlPhase.startDate  || null,
        endDate   : wlPhase.endDate    || null,
        price     : parseFloat(wlPhase.price  || 0),
        limit     : parseInt(wlPhase.limit    || 3, 10),
      } : null,
      public: {
        startDate : pubPhase.startDate || null,
        price     : parseFloat(pubPhase.price || 0),
        limit     : parseInt(pubPhase.limit   || 10, 10),
      },
    },
    deployedAt: new Date().toISOString(),
  };

  const newConfigCID = await storageClient.storeDirectory([
    new File([JSON.stringify(config, null, 2)], 'config.json', { type: 'application/json' }),
  ]);

  // ── Create Collection NFT ───────────────────────────────────
  const collectionMint = generateSigner(umi);
  const collectionUri  = configCID
    ? `https://${configCID}.ipfs.nftstorage.link/0.json`
    : items[0]?.uri || 'https://arweave.net/placeholder';

  await createNft(umi, {
    mint                : collectionMint,
    authority           : treasury,
    updateAuthority     : treasury,
    name, symbol,
    uri                 : collectionUri,
    sellerFeeBasisPoints: percentAmount(parseFloat(royalty)),
    isCollection        : true,
  }).sendAndConfirm(umi, { confirm: { commitment: 'confirmed' } });

  // ── Build guard groups (phases) ─────────────────────────────
  const toDate = (str) => str ? new Date(str) : null;
  const toSOL  = (n)   => sol(Math.max(0, parseFloat(n) || 0));

  // Creators array: creator gets their royalty cut, platform takes its share
  const creators = [];
  if (creatorAddress && PLAT_SHARE < 100) {
    creators.push({
      address        : toPublicKey(creatorAddress),
      verified       : false,
      percentageShare: 100 - Math.round(PLAT_SHARE),
    });
  }
  if (PLAT_WALLET && PLAT_SHARE > 0) {
    creators.push({
      address        : toPublicKey(PLAT_WALLET),
      verified       : true,
      percentageShare: Math.round(PLAT_SHARE),
    });
  }
  if (creators.length === 0) {
    creators.push({
      address        : treasury.publicKey,
      verified       : true,
      percentageShare: 100,
    });
  }

  const guardGroups = [];
  let   groupIdCounter = 1;

  // OG group
  if (ogPhase.enabled && ogRoot) {
    const g = {
      label : 'og',
      guards: {
        allowList: some({ merkleRoot: ogRoot }),
        mintLimit: some({ id: groupIdCounter++, limit: parseInt(ogPhase.limit || 2, 10) }),
        solPayment: some({ lamports: toSOL(ogPhase.price), destination: treasury.publicKey }),
      },
    };
    if (ogPhase.startDate) g.guards.startDate = some({ date: new Date(ogPhase.startDate) });
    if (ogPhase.endDate)   g.guards.endDate   = some({ date: new Date(ogPhase.endDate) });
    guardGroups.push(g);
  }

  // Whitelist group
  if (wlPhase.enabled && wlRoot) {
    const g = {
      label : 'wl',
      guards: {
        allowList: some({ merkleRoot: wlRoot }),
        mintLimit: some({ id: groupIdCounter++, limit: parseInt(wlPhase.limit || 3, 10) }),
        solPayment: some({ lamports: toSOL(wlPhase.price), destination: treasury.publicKey }),
      },
    };
    if (wlPhase.startDate) g.guards.startDate = some({ date: new Date(wlPhase.startDate) });
    if (wlPhase.endDate)   g.guards.endDate   = some({ date: new Date(wlPhase.endDate) });
    guardGroups.push(g);
  }

  // Public group (always added)
  {
    const g = {
      label : 'pub',
      guards: {
        mintLimit: some({ id: groupIdCounter++, limit: parseInt(pubPhase.limit || 10, 10) }),
        solPayment: some({ lamports: toSOL(pubPhase.price), destination: treasury.publicKey }),
      },
    };
    if (pubPhase.startDate) g.guards.startDate = some({ date: new Date(pubPhase.startDate) });
    guardGroups.push(g);
  }

  // Default guards (bot tax protects against failed mints)
  const defaultGuards = {
    botTax: some({ lamports: sol(0.001), lastInstruction: true }),
  };

  // ── Create Candy Machine ────────────────────────────────────
  const candyMachine = generateSigner(umi);

  await createCandyMachine(umi, {
    candyMachine,
    authority               : treasury,
    collectionMint          : collectionMint.publicKey,
    collectionUpdateAuthority: treasury,
    tokenStandard           : TokenStandard.NonFungible,
    sellerFeeBasisPoints    : percentAmount(parseFloat(royalty)),
    itemsAvailable          : parseInt(supply, 10),
    creators,
    configLineSettings: some({
      prefixName  : '',
      nameLength  : 32,
      prefixUri   : '',
      uriLength   : 200,
      isSequential: false,
    }),
    guards: defaultGuards,
    groups: guardGroups,
  }).sendAndConfirm(umi, { confirm: { commitment: 'confirmed' } });

  // ── Add NFT items in batches of 10 ─────────────────────────
  const BATCH = 10;
  for (let i = 0; i < items.length; i += BATCH) {
    const batch = items.slice(i, i + BATCH);
    await addConfigLines(umi, {
      candyMachine: candyMachine.publicKey,
      index       : i,
      configLines : batch.map(item => ({
        name: (item.name || `${name} #${i + 1}`).slice(0, 32),
        uri : item.uri.slice(0, 200),
      })),
    }).sendAndConfirm(umi, { confirm: { commitment: 'confirmed' } });
  }

  const devnet  = NETWORK === 'devnet';
  const cmAddr  = candyMachine.publicKey.toString();
  const colAddr = collectionMint.publicKey.toString();
  const suffix  = devnet ? '?cluster=devnet' : '';
  const mintUrl = `https://topnft.netlify.app/mint?cm=${cmAddr}&cfg=${newConfigCID}`;

  return ok({
    success               : true,
    candyMachineAddress   : cmAddr,
    collectionMintAddress : colAddr,
    configCID             : newConfigCID,
    mintPageUrl           : mintUrl,
    network               : NETWORK,
    phasesDeployed        : guardGroups.map(g => g.label),
    explorerUrl           : `https://explorer.solana.com/address/${cmAddr}${suffix}`,
    collectionExplorerUrl : `https://explorer.solana.com/address/${colAddr}${suffix}`,
  });
};

const ok  = (body)         => ({ statusCode: 200, headers: CORS, body: JSON.stringify(body) });
const err = (code, message)=> ({ statusCode: code, headers: CORS, body: JSON.stringify({ error: message }) });
