import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class DidService {
  constructor(private readonly configService: ConfigService) {}

  /**
   * Generate a DID for a new user
   * Using did:key method (self-contained, no registry needed)
   */
  async generateDid(): Promise<{
    did: string;
    publicKey: string;
    privateKey: string;
  }> {
    const method = this.configService.get<string>('DID_METHOD', 'key');

    if (method === 'key') {
      return this.generateDidKey();
    }

    // Future: support other DID methods (did:web, did:ethr, etc.)
    throw new Error(`Unsupported DID method: ${method}`);
  }

  /**
   * Generate did:key DID (Ed25519)
   * did:key is a self-contained DID method where the DID itself contains the public key
   */
  private async generateDidKey(): Promise<{
    did: string;
    publicKey: string;
    privateKey: string;
  }> {
    // Generate Ed25519 key pair
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
      publicKeyEncoding: {
        type: 'spki',
        format: 'der',
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'der',
      },
    });

    // Convert public key to base58
    const publicKeyBase58 = this.toBase58(publicKey);

    // Create DID from public key
    // Format: did:key:z{base58-encoded-public-key}
    const did = `did:key:z${publicKeyBase58}`;

    return {
      did,
      publicKey: publicKeyBase58,
      privateKey: privateKey.toString('base64'),
    };
  }

  /**
   * Verify a DID is valid
   */
  async verifyDid(did: string): Promise<boolean> {
    if (!did || !did.startsWith('did:')) {
      return false;
    }

    const [, method] = did.split(':');

    if (method === 'key') {
      return this.verifyDidKey(did);
    }

    return false;
  }

  /**
   * Verify did:key format
   */
  private verifyDidKey(did: string): boolean {
    // Format: did:key:z{base58-encoded-public-key}
    const pattern = /^did:key:z[1-9A-HJ-NP-Za-km-z]+$/;
    return pattern.test(did);
  }

  /**
   * Extract public key from did:key
   */
  extractPublicKeyFromDid(did: string): string | null {
    if (!did.startsWith('did:key:z')) {
      return null;
    }

    // Remove 'did:key:z' prefix to get the base58-encoded public key
    return did.substring(9);
  }

  /**
   * Create a DID document (for did:key, it's derived from the DID itself)
   */
  async resolveDidDocument(did: string): Promise<any> {
    if (!did.startsWith('did:key:')) {
      throw new Error('Only did:key method is supported');
    }

    const publicKeyBase58 = this.extractPublicKeyFromDid(did);
    if (!publicKeyBase58) {
      throw new Error('Invalid DID format');
    }

    // Standard DID document structure
    return {
      '@context': [
        'https://www.w3.org/ns/did/v1',
        'https://w3id.org/security/suites/ed25519-2020/v1',
      ],
      id: did,
      verificationMethod: [
        {
          id: `${did}#${publicKeyBase58}`,
          type: 'Ed25519VerificationKey2020',
          controller: did,
          publicKeyBase58,
        },
      ],
      authentication: [`${did}#${publicKeyBase58}`],
      assertionMethod: [`${did}#${publicKeyBase58}`],
      capabilityDelegation: [`${did}#${publicKeyBase58}`],
      capabilityInvocation: [`${did}#${publicKeyBase58}`],
    };
  }

  /**
   * Sign data with DID private key
   */
  async signWithDid(
    privateKeyBase64: string,
    data: string,
  ): Promise<string> {
    const privateKeyBuffer = Buffer.from(privateKeyBase64, 'base64');

    const sign = crypto.createSign('SHA256');
    sign.update(data);
    sign.end();

    const signature = sign.sign({
      key: privateKeyBuffer,
      format: 'der',
      type: 'pkcs8',
    });

    return signature.toString('base64');
  }

  /**
   * Verify signature with DID public key
   */
  async verifySignature(
    did: string,
    data: string,
    signatureBase64: string,
  ): Promise<boolean> {
    const publicKeyBase58 = this.extractPublicKeyFromDid(did);
    if (!publicKeyBase58) {
      return false;
    }

    const publicKeyBuffer = this.fromBase58(publicKeyBase58);
    const signatureBuffer = Buffer.from(signatureBase64, 'base64');

    const verify = crypto.createVerify('SHA256');
    verify.update(data);
    verify.end();

    return verify.verify(
      {
        key: publicKeyBuffer,
        format: 'der',
        type: 'spki',
      },
      signatureBuffer,
    );
  }

  /**
   * Create a Verifiable Credential
   */
  // eslint-disable-next-line max-params -- TODO(par-max): pass an options object / contract
  async issueVerifiableCredential(
    issuerDid: string,
    issuerPrivateKey: string,
    subjectDid: string,
    claims: Record<string, any>,
    credentialType: string,
  ): Promise<any> {
    const credential = {
      '@context': [
        'https://www.w3.org/2018/credentials/v1',
        this.configService.get<string>(
          'VC_CONTEXT_URL',
          'https://example.com/credentials/v1',
        ),
      ],
      type: ['VerifiableCredential', credentialType],
      issuer: issuerDid,
      issuanceDate: new Date().toISOString(),
      credentialSubject: {
        id: subjectDid,
        ...claims,
      },
    };

    // Sign the credential
    const credentialString = JSON.stringify(credential);
    const signature = await this.signWithDid(issuerPrivateKey, credentialString);

    return {
      ...credential,
      proof: {
        type: 'Ed25519Signature2020',
        created: new Date().toISOString(),
        verificationMethod: `${issuerDid}#${this.extractPublicKeyFromDid(issuerDid)}`,
        proofPurpose: 'assertionMethod',
        proofValue: signature,
      },
    };
  }

  /**
   * Verify a Verifiable Credential
   */
  async verifyVerifiableCredential(credential: any): Promise<boolean> {
    if (!credential.proof || !credential.issuer) {
      return false;
    }

    // Extract the proof
    const { proof, ...credentialWithoutProof } = credential;

    // Verify the signature
    const credentialString = JSON.stringify(credentialWithoutProof);
    return this.verifySignature(
      credential.issuer,
      credentialString,
      proof.proofValue,
    );
  }

  // Helper: Base58 encoding
  private toBase58(buffer: Buffer): string {
    const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let num = BigInt('0x' + buffer.toString('hex'));
    let result = '';

    while (num > 0) {
      const remainder = Number(num % 58n);
      num = num / 58n;
      result = ALPHABET[remainder] + result;
    }

    // Handle leading zeros
    for (let i = 0; i < buffer.length && buffer[i] === 0; i++) {
      result = ALPHABET[0] + result;
    }

    return result;
  }

  // Helper: Base58 decoding
  private fromBase58(str: string): Buffer {
    const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let num = 0n;

    for (const char of str) {
      const index = ALPHABET.indexOf(char);
      if (index === -1) {
        throw new Error('Invalid base58 character');
      }
      num = num * 58n + BigInt(index);
    }

    const hex = num.toString(16);
    return Buffer.from(hex.padStart(hex.length + (hex.length % 2), '0'), 'hex');
  }
}





