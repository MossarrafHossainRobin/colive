import { NextResponse } from 'next/server';

const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;

const MEMBER_COLS = {
  'rahat': 'C',
  'robin': 'E',
  'abir': 'G',
  'shadat': 'I',
  'rupam': 'K',
  'shishir': 'M',
};

async function getAccessToken() {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let privateKey = process.env.GOOGLE_PRIVATE_KEY || '';

  privateKey = privateKey.replace(/\\n/g, '\n');
  privateKey = privateKey.replace(/^"|"$/g, '');

  if (!clientEmail || privateKey.length < 100) {
    throw new Error('Credentials not configured');
  }

  const now = Math.floor(Date.now() / 1000);
  const jwtHeader = { alg: 'RS256', typ: 'JWT' };
  const jwtClaim = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  const encoder = new TextEncoder();
  const hB64 = btoa(JSON.stringify(jwtHeader)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const cB64 = btoa(JSON.stringify(jwtClaim)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const input = `${hB64}.${cB64}`;

  const pem = privateKey.replace('-----BEGIN PRIVATE KEY-----', '').replace('-----END PRIVATE KEY-----', '').replace(/\s/g, '');
  const binaryKey = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey('pkcs8', binaryKey, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'RSASSA-PKCS1-v1_5' }, cryptoKey, encoder.encode(input));
  const sB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const jwt = `${input}.${sB64}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.access_token;
}

export async function POST(request) {
  try {
    if (!SPREADSHEET_ID) {
      throw new Error('Google Sheet ID not configured');
    }

    const { memberName, date, lunch, dinner } = await request.json();
    
    const [year, month, day] = date.split('-');
    const sheetDate = `${day}/${month}/${year}`;
    const total = (lunch || 0) + (dinner || 0);
    const mealValue = total === 0 ? 'NM' : String(total);
    
    // CASE-INSENSITIVE matching
    const nameLower = (memberName || '').toLowerCase().trim();
    let col = MEMBER_COLS[nameLower];
    
    // If not found, try partial match
    if (!col) {
      for (const [key, value] of Object.entries(MEMBER_COLS)) {
        if (nameLower.includes(key) || key.includes(nameLower)) {
          col = value;
          break;
        }
      }
    }
    
    console.log(`📊 Sheet sync: "${memberName}" → Col: ${col} | ${sheetDate} | Value: ${mealValue}`);
    
    if (!col) {
      return NextResponse.json({ success: false, error: `Member "${memberName}" not found` });
    }

    const token = await getAccessToken();

    const readRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/B:B`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    const readData = await readRes.json();
    const rows = readData.values || [];

    let foundRow = null;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i] && rows[i][0] === sheetDate) {
        foundRow = i + 1;
        break;
      }
    }

    if (!foundRow) {
      return NextResponse.json({ success: false, error: `Date "${sheetDate}" not found` });
    }

    const cellRange = `${col}${foundRow}`;
    console.log(`📝 Updating ${cellRange} = ${mealValue}`);

    const updateRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(cellRange)}?valueInputOption=USER_ENTERED`,
      {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: [[mealValue]] })
      }
    );
    
    const updateData = await updateRes.json();
    
    if (updateData.error) {
      return NextResponse.json({ success: false, error: updateData.error.message });
    }

    console.log(`✅ ${cellRange} = ${mealValue}`);
    return NextResponse.json({ success: true, message: `${cellRange}=${mealValue}` });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    return NextResponse.json({ success: false, error: error.message });
  }
}
