;(function (global) {
  'use strict';

  async function mintNFT({ candyMachineAddress, collectionMintAddress, configCID, group, onStatus }) {
    const status  = onStatus || (() => {});
    const web3    = global.solanaWeb3;
    const phantom = global.phantom?.solana || global.solana;

    if (!web3)              throw new Error('@solana/web3.js not loaded');
    if (!phantom?.publicKey) throw new Error('Please connect your wallet first');

    const minterPublicKey = phantom.publicKey.toString();
    const RPC_URL = global._solanaRpcUrl || 'https://api.devnet.solana.com';

    status('Preparing transaction…');

    const prepRes = await fetch('/.netlify/functions/prepare-mint', {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({ candyMachineAddress, collectionMintAddress, minterPublicKey, group, configCID }),
    });

    const prepData = await prepRes.json();
    if (!prepRes.ok || !prepData.success)
      throw new Error(prepData.error || 'Server failed to prepare mint transaction');

    status('Waiting for wallet approval…');

    const txBytes   = Uint8Array.from(atob(prepData.serializedTransaction), c => c.charCodeAt(0));
    const tx        = web3.VersionedTransaction.deserialize(txBytes);
    const signedTx  = await phantom.signTransaction(tx);

    status('Submitting to Solana…');

    const connection  = new web3.Connection(RPC_URL, 'confirmed');
    const rawTx       = signedTx.serialize();
    const signature   = await connection.sendRawTransaction(rawTx, { skipPreflight: false, preflightCommitment: 'confirmed' });

    status('Confirming on-chain…');

    const latestHash = await connection.getLatestBlockhash();
    await connection.confirmTransaction({ signature, ...latestHash }, 'confirmed');

    status('✅ Minted!');

    const devnet = RPC_URL.includes('devnet');
    return {
      signature,
      nftMintAddress: prepData.nftMintAddress,
      groupUsed     : prepData.groupUsed,
      explorerUrl   : `https://explorer.solana.com/tx/${signature}${devnet ? '?cluster=devnet' : ''}`,
    };
  }

  global.MintHandler = { mintNFT };

}(typeof window !== 'undefined' ? window : globalThis));
