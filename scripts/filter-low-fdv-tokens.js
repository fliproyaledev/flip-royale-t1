/**
 * Script to filter tokens with FDV < 10M USD from token-list.json
 * This will create a backup and filter the list
 */

const fs = require('fs');
const path = require('path');

const TOKEN_LIST_PATH = path.join(__dirname, '../lib/token-list.json');
const BACKUP_PATH = path.join(__dirname, '../lib/token-list.json.backup');
const MIN_FDV_USD = 10_000_000; // 10M USD

async function fetchFDVForToken(tokenAddress, network = 'base') {
  try {
    const https = require('https');
    return new Promise((resolve, reject) => {
      const url = `https://api.dexscreener.com/latest/dex/pairs/${network}/${tokenAddress}`;
      https.get(url, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            const pair = json.pair || (Array.isArray(json.pairs) ? json.pairs[0] : null);
            if (!pair) {
              resolve(null);
              return;
            }
            // Try different possible FDV fields
            const fdv = pair.fdv || pair.fdvUsd || pair.fullyDilutedValuation || 
                        (pair.marketCap && pair.marketCap.fdv) || null;
            resolve(typeof fdv === 'number' ? fdv : null);
          } catch (e) {
            resolve(null);
          }
        });
      }).on('error', reject);
    });
  } catch (e) {
    return null;
  }
}

function extractPairAddress(dexscreenerUrl) {
  if (!dexscreenerUrl) return null;
  try {
    const url = new URL(dexscreenerUrl);
    const segments = url.pathname.split('/').filter(Boolean);
    // Look for pair address in URL
    for (let i = segments.length - 1; i >= 0; i--) {
      if (segments[i] && segments[i].startsWith('0x') && segments[i].length === 42) {
        return segments[i].toLowerCase();
      }
    }
    // Try to find in pairs path
    const pairsIndex = segments.indexOf('pairs');
    if (pairsIndex >= 0 && pairsIndex + 1 < segments.length) {
      const addr = segments[pairsIndex + 1];
      if (addr && addr.startsWith('0x')) return addr.toLowerCase();
    }
  } catch (e) {
    // ignore
  }
  return null;
}

async function main() {
  console.log('Loading token-list.json...');
  const tokenList = JSON.parse(fs.readFileSync(TOKEN_LIST_PATH, 'utf8'));
  const tokens = tokenList.Sayfa1 || [];
  
  console.log(`Found ${tokens.length} tokens`);
  console.log('Creating backup...');
  fs.writeFileSync(BACKUP_PATH, JSON.stringify(tokenList, null, 2));
  console.log(`Backup saved to ${BACKUP_PATH}`);
  
  console.log('\nFetching FDV data (this may take a while)...');
  const results = [];
  const lowFdvTokens = [];
  
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const url = token['GECKO TERMINAL POOL LINK'] || token['DEXSCREENER LINK'] || '';
    const pairAddress = extractPairAddress(url);
    
    if (!pairAddress) {
      console.log(`[${i + 1}/${tokens.length}] ${token['TICKER'] || token['CARD NAME / TOKEN NAME']}: No pair address found`);
      results.push({ token, fdv: null, keep: true }); // Keep if no address
      continue;
    }
    
    process.stdout.write(`[${i + 1}/${tokens.length}] ${token['TICKER'] || token['CARD NAME / TOKEN NAME']}: Fetching...\r`);
    const fdv = await fetchFDVForToken(pairAddress, 'base');
    
    const keep = !fdv || fdv >= MIN_FDV_USD;
    if (!keep) {
      lowFdvTokens.push({
        ticker: token['TICKER'],
        name: token['CARD NAME / TOKEN NAME'],
        fdv: fdv ? `$${(fdv / 1_000_000).toFixed(2)}M` : 'N/A'
      });
    }
    
    results.push({ token, fdv, keep });
    
    // Rate limiting: wait 200ms between requests
    if (i < tokens.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  
  console.log('\n\nFiltering tokens...');
  const filtered = results.filter(r => r.keep).map(r => r.token);
  
  console.log(`\nResults:`);
  console.log(`  Total tokens: ${tokens.length}`);
  console.log(`  Tokens to keep: ${filtered.length}`);
  console.log(`  Tokens to remove (FDV < $10M): ${lowFdvTokens.length}`);
  
  if (lowFdvTokens.length > 0) {
    console.log(`\nTokens with FDV < $10M:`);
    lowFdvTokens.forEach(t => {
      console.log(`  - ${t.ticker} (${t.name}): ${t.fdv}`);
    });
  }
  
  console.log('\nUpdating token-list.json...');
  tokenList.Sayfa1 = filtered;
  fs.writeFileSync(TOKEN_LIST_PATH, JSON.stringify(tokenList, null, 2));
  
  console.log('Done! Token list has been filtered.');
  console.log(`\nTo restore the original list, run:`);
  console.log(`  cp ${BACKUP_PATH} ${TOKEN_LIST_PATH}`);
}

main().catch(console.error);

