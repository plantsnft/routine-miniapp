import { NextRequest, NextResponse } from 'next/server';
import { getFarcasterDomainManifest, decodeAccountAssociationDomain, extractDomainFromUrl } from '~/lib/utils';

/**
 * Diagnostics endpoint for Farcaster manifest.
 * 
 * Returns detailed information about the manifest being served, including:
 * - Request host
 * - Decoded payload domain
 * - Full manifest JSON
 * - Domain validation status
 * 
 * This endpoint is useful for debugging domain association issues.
 * In production, consider adding authentication or IP restrictions.
 */
export async function GET(request: NextRequest) {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 
      `${request.nextUrl.protocol}//${request.nextUrl.host}`;
    const expectedDomain = extractDomainFromUrl(baseUrl);
    
    // Get accountAssociation from env vars
    let accountAssociation: { header: string; payload: string; signature: string } | null = null;
    let accountAssociationSource = 'none';
    
    if (process.env.NEXT_PUBLIC_APP_ACCOUNT_ASSOCIATION) {
      accountAssociation = JSON.parse(process.env.NEXT_PUBLIC_APP_ACCOUNT_ASSOCIATION);
      accountAssociationSource = 'NEXT_PUBLIC_APP_ACCOUNT_ASSOCIATION';
    } else if (
      process.env.FARCASTER_ASSOC_HEADER &&
      process.env.FARCASTER_ASSOC_PAYLOAD &&
      process.env.FARCASTER_ASSOC_SIGNATURE
    ) {
      accountAssociation = {
        header: process.env.FARCASTER_ASSOC_HEADER,
        payload: process.env.FARCASTER_ASSOC_PAYLOAD,
        signature: process.env.FARCASTER_ASSOC_SIGNATURE,
      };
      accountAssociationSource = 'FARCASTER_ASSOC_* (separate vars)';
    } else {
      accountAssociationSource = 'fallback (hardcoded)';
      // Use fallback
      accountAssociation = {
        header: "eyJmaWQiOjMxODQ0NywidHlwZSI6ImF1dGgiLCJrZXkiOiIweDdjNTI3ZDk1NmY0NzkyMEZlYzM4ZEZjNTgzNEZlMzFiNUE3MmRCMTIifQ",
        payload: "eyJkb21haW4iOiJyb3V0aW5lLXNtb2t5LnZlcmNlbC5hcHAifQ",
        signature: "edEJSA+ZYlH0pssvN99KYTk3EzwQPFUQ2grBw+zKlYcLJUZdTqf6brlZ7qnPBTlMRh72KspvXkmCQdV6llxRexw="
      };
    }
    
    const actualDomain = accountAssociation ? decodeAccountAssociationDomain(accountAssociation.payload) : null;
    const domainMatch = actualDomain === expectedDomain;
    
    // Get manifest (without validation to avoid throwing)
    const manifest = await getFarcasterDomainManifest(baseUrl, false);
    
    // Remove diagnostics from manifest copy
    const cleanManifest = { ...manifest };
    if ('_diagnostics' in cleanManifest) {
      delete (cleanManifest as any)._diagnostics;
    }
    
    // Decode payload to get just the domain JSON
    const payloadDecoded = accountAssociation?.payload
      ? JSON.parse(Buffer.from(accountAssociation.payload, 'base64').toString('utf-8'))
      : null;
    
    return NextResponse.json({
      request: {
        host: request.nextUrl.host,
        protocol: request.nextUrl.protocol,
        baseUrl,
        expectedDomain,
      },
      accountAssociation: {
        source: accountAssociationSource,
        payloadDomain: actualDomain,
        domainMatch,
        hasHeader: !!accountAssociation?.header,
        hasPayload: !!accountAssociation?.payload,
        hasSignature: !!accountAssociation?.signature,
        // Decode header for debugging (contains fid, type, key)
        headerDecoded: accountAssociation?.header 
          ? JSON.parse(Buffer.from(accountAssociation.header, 'base64').toString('utf-8'))
          : null,
        // Payload decoded (domain only JSON)
        payloadDecoded,
      },
      manifest: cleanManifest,
      validation: {
        domainMatch,
        status: domainMatch ? '✅ PASS' : '❌ FAIL',
        message: domainMatch
          ? `Domain matches: ${expectedDomain}`
          : `Domain mismatch: expected "${expectedDomain}" but payload contains "${actualDomain}". Update env vars.`,
      },
      computed: {
        baseUrl,
        expectedDomain,
        actualDomain,
        manifestHomeUrl: cleanManifest.miniapp?.homeUrl || cleanManifest.miniapp?.homeUrl,
      },
      environment: {
        nodeEnv: process.env.NODE_ENV,
        vercelEnv: process.env.VERCEL_ENV,
        hasNextPublicBaseUrl: !!process.env.NEXT_PUBLIC_BASE_URL,
      },
    }, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    }, { status: 500 });
  }
}

