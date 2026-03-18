'use strict';

const { NFTStorage, File } = require('nft.storage');

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return ok({});
  if (event.httpMethod !== 'POST')    return err(405, 'Method not allowed');

  const KEY = process.env.NFT_STORAGE_KEY;
  if (!KEY) return err(500, 'NFT_STORAGE_KEY not configured');

  let fields, fileParts;
  try {
    const parsed = parseMultipart(event);
    fields    = parsed.fields;
    fileParts = parsed.files;
  } catch (e) {
    return err(400, 'Could not parse upload: ' + e.message);
  }

  if (!fileParts || fileParts.length === 0)
    return err(400, 'No image files received');

  const collectionName   = fields.collectionName   || 'NFT Collection';
  const collectionSymbol = fields.collectionSymbol || 'NFT';
  const description      = fields.description      || '';
  const royaltyBps       = parseInt(fields.royaltyBps || '500', 10);
  const creatorAddress   = fields.creatorAddress   || '';

  let traitsPerNFT = [];
  try { if (fields.traits) traitsPerNFT = JSON.parse(fields.traits); } catch {}

  const client = new NFTStorage({ token: KEY });

  // Upload images as IPFS directory
  const imageFiles = fileParts.map((part, i) => {
    const ext = (part.filename || '').split('.').pop() || 'png';
    return new File(
      [Buffer.from(part.data, 'base64')],
      `${i + 1}.${ext}`,
      { type: part.contentType || 'image/png' }
    );
  });

  const imageCID     = await client.storeDirectory(imageFiles);
  const imageBaseUrl = `https://${imageCID}.ipfs.nftstorage.link`;

  // Build and upload metadata JSONs
  const metadataFiles = fileParts.map((part, i) => {
    const index    = i + 1;
    const ext      = (part.filename || '').split('.').pop() || 'png';
    const imageUrl = `${imageBaseUrl}/${index}.${ext}`;
    const traits   = traitsPerNFT[i] || [];

    const metadata = {
      name                   : `${collectionName} #${index}`,
      symbol                 : collectionSymbol,
      description,
      seller_fee_basis_points: royaltyBps,
      image                  : imageUrl,
      attributes             : traits.map(t => ({ trait_type: t.type || 'Property', value: t.value || 'Default' })),
      properties: {
        files   : [{ uri: imageUrl, type: part.contentType || 'image/png' }],
        category: 'image',
        creators: creatorAddress ? [{ address: creatorAddress, share: 100 }] : [],
      },
    };

    return new File([JSON.stringify(metadata, null, 2)], `${index}.json`, { type: 'application/json' });
  });

  const metaCID     = await client.storeDirectory(metadataFiles);
  const metaBaseUrl = `https://${metaCID}.ipfs.nftstorage.link`;

  const items = fileParts.map((_, i) => ({
    index: i,
    name : `${collectionName} #${i + 1}`,
    uri  : `${metaBaseUrl}/${i + 1}.json`,
  }));

  return ok({ success: true, count: items.length, imageCID, imageBaseUrl, metaCID, metaBaseUrl, items });
};

// ── Multipart parser ─────────────────────────────────────────
function parseMultipart(event) {
  const ct = event.headers['content-type'] || '';
  const bm = ct.match(/boundary=([^\s;]+)/);
  if (!bm) throw new Error('No multipart boundary');
  const boundary = '--' + bm[1];
  const body     = Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf8');
  const parts    = splitBuf(body, Buffer.from('\r\n' + boundary)).filter(p => p.length > 4);

  const fields = {};
  const files  = [];

  for (const part of parts) {
    const sep = part.indexOf('\r\n\r\n');
    if (sep === -1) continue;
    const headers = part.slice(0, sep).toString();
    const data    = part.slice(sep + 4);

    const disp  = headers.match(/Content-Disposition:[^\r\n]*name="([^"]+)"/i);
    if (!disp) continue;

    const fileM = headers.match(/filename="([^"]+)"/i);
    const ctM   = headers.match(/Content-Type:\s*([^\r\n]+)/i);

    if (fileM) {
      files.push({
        fieldName  : disp[1],
        filename   : fileM[1],
        contentType: ctM ? ctM[1].trim() : 'application/octet-stream',
        data       : data.slice(0, data.length - 2).toString('base64'),
      });
    } else {
      fields[disp[1]] = data.toString('utf8').replace(/\r\n$/, '');
    }
  }
  return { fields, files };
}

function splitBuf(buf, sep) {
  const parts = [];
  let start = 0;
  while (true) {
    const i = buf.indexOf(sep, start);
    if (i === -1) { parts.push(buf.slice(start)); break; }
    parts.push(buf.slice(start, i));
    start = i + sep.length;
  }
  return parts;
}

const ok  = (b)    => ({ statusCode: 200, headers: CORS, body: JSON.stringify(b) });
const err = (c, m) => ({ statusCode: c,   headers: CORS, body: JSON.stringify({ error: m }) });
