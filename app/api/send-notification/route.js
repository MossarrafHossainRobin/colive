import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const body = await request.json();
    const delayMs = Math.min(5000, Math.max(0, Number(body.delayMs) || 0));
    
    if (!body.token) {
      return NextResponse.json({ success: false, error: 'No token provided' }, { status: 400 });
    }

    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    console.log('📱 Sending to:', body.token.substring(0, 20) + '...');

    const message = {
      token: body.token,
      
      // ONLY use data payload (not notification) to prevent double display
      // The service worker will handle showing the notification
      data: {
        title: body.title || 'NestHub',
        body: body.body || 'You have a new update',
        url: body.url || '/dashboard',
        type: body.type || 'general',
        conversationId: body.conversationId || '',
        icon: body.icon || '',
        timestamp: String(body.timestamp || Date.now()),
      },
      
      android: {
        priority: 'high',
        ttl: '86400s',
        data: {
          title: body.title || 'NestHub',
          body: body.body || 'You have a new update',
          url: body.url || '/dashboard',
          type: body.type || 'general',
          timestamp: String(body.timestamp || Date.now()),
          conversationId: body.conversationId || '',
          icon: body.icon || '',
        },
      },
      
      webpush: {
        headers: {
          Urgency: 'high',
          TTL: '86400',
        },
        data: {
          title: body.title || 'NestHub',
          body: body.body || 'You have a new update',
          url: body.url || '/dashboard',
          type: body.type || 'general',
          timestamp: String(body.timestamp || Date.now()),
          conversationId: body.conversationId || '',
          icon: body.icon || '',
        },
        fcmOptions: {
          link: body.url || '/dashboard',
        },
      },
    };

    const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (!serviceAccountKey) {
      return NextResponse.json({ success: false, error: 'No service account' }, { status: 500 });
    }

    const key = JSON.parse(serviceAccountKey);
    const firebaseProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || key.project_id;
    if (!firebaseProjectId) {
      return NextResponse.json({ success: false, error: 'No Firebase project ID' }, { status: 500 });
    }
    
    const now = Math.floor(Date.now() / 1000);
    const jwtHeader = { alg: 'RS256', typ: 'JWT' };
    const jwtClaim = {
      iss: key.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    };

    const encoder = new TextEncoder();
    const hB64 = btoa(JSON.stringify(jwtHeader)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const cB64 = btoa(JSON.stringify(jwtClaim)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const input = `${hB64}.${cB64}`;

    let privateKey = key.private_key.replace(/\\n/g, '\n');
    const pem = privateKey.replace('-----BEGIN PRIVATE KEY-----', '').replace('-----END PRIVATE KEY-----', '').replace(/\s/g, '');
    const binaryKey = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
    
    const cryptoKey = await crypto.subtle.importKey('pkcs8', binaryKey, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
    const signature = await crypto.subtle.sign({ name: 'RSASSA-PKCS1-v1_5' }, cryptoKey, encoder.encode(input));
    const sB64 = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const jwt = `${input}.${sB64}`;

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      return NextResponse.json({ success: false, error: 'OAuth failed' }, { status: 500 });
    }

    const fcmRes = await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(firebaseProjectId)}/messages:send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenData.access_token}`,
      },
      body: JSON.stringify({ message }),
    });

    const fcmResult = await fcmRes.json();
    
    if (fcmResult.name) {
      console.log('✅ Sent:', fcmResult.name);
      return NextResponse.json({ success: true, messageId: fcmResult.name });
    } else {
      console.error('❌ Error:', fcmResult.error?.message);
      return NextResponse.json({ success: false, error: fcmResult.error?.message }, { status: 400 });
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
