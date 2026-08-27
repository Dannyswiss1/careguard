#!/usr/bin/env tsx

import fs from 'node:fs/promises';
import path from 'node:path';
import { glob } from 'glob';

interface EnvVar {
  name: string;
  line: number;
  used: boolean;
  files: string[];
}

// Wallet key-pair halves that `npm run setup` (scripts/setup-wallets.ts) prints
// for every wallet in WALLET_NAMES, documented here for operators to paste the
// full pair into .env, even though only one half of each pair is ever read via
// process.env at runtime (e.g. recipient wallets only need their PUBLIC_KEY;
// the app never loads their SECRET_KEY, and the agent's own PUBLIC_KEY is
// derived from AGENT_SECRET_KEY rather than read separately).
const DOCUMENTATION_ONLY_VARS = new Set([
  'STELLAR_RPC_URL',
  'AGENT_PUBLIC_KEY',
  'CAREGIVER_SECRET_KEY',
  'CAREGIVER_PUBLIC_KEY',
  'PHARMACY_1_SECRET_KEY',
  'PHARMACY_2_SECRET_KEY',
  'PHARMACY_3_SECRET_KEY',
  'PHARMACY_3_PUBLIC_KEY',
  'BILL_PROVIDER_SECRET_KEY',
]);

async function extractEnvVarsFromExample(): Promise<Map<string, EnvVar>> {
  const envExamplePath = path.join(process.cwd(), '.env.example');
  const content = await fs.readFile(envExamplePath, 'utf-8');
  const lines = content.split('\n');

  const envVars = new Map<string, EnvVar>();

  lines.forEach((line, index) => {
    // Match lines like: VAR_NAME=value or # VAR_NAME=value
    const match = line.match(/^#?\s*([A-Z_][A-Z0-9_]*)=/);
    if (match) {
      const varName = match[1];
      // Skip common meta variables and documented-but-intentionally-unread vars
      if (!['NODE_ENV', 'PORT', 'HOST'].includes(varName) && !DOCUMENTATION_ONLY_VARS.has(varName)) {
        envVars.set(varName, {
          name: varName,
          line: index + 1,
          used: false,
          files: [],
        });
      }
    }
  });

  return envVars;
}

async function searchCodebaseForEnvVars(envVars: Map<string, EnvVar>): Promise<void> {
  const files = await glob('**/*.{ts,js,tsx,jsx}', {
    ignore: ['**/node_modules/**', '**/dist/**', '**/.next/**', 'scripts/check-env-vars.ts'],
  });
  
  for (const file of files) {
    const content = await fs.readFile(file, 'utf-8');
    
    for (const [varName, varInfo] of envVars) {
      // Check for process.env.VAR_NAME or process.env['VAR_NAME']
      const patterns = [
        new RegExp(`process\\.env\\.${varName}\\b`),
        new RegExp(`process\\.env\\['${varName}'\\]`),
        new RegExp(`process\\.env\\["${varName}"\\]`),
      ];
      
      if (patterns.some((pattern) => pattern.test(content))) {
        varInfo.used = true;
        varInfo.files.push(file);
      }
    }
  }
}

async function main() {
  console.log('🔍 Checking for unused environment variables...\n');
  
  const envVars = await extractEnvVarsFromExample();
  console.log(`Found ${envVars.size} environment variables in .env.example`);
  
  await searchCodebaseForEnvVars(envVars);
  
  const unused = Array.from(envVars.values()).filter((v) => !v.used);
  const used = Array.from(envVars.values()).filter((v) => v.used);
  
  console.log(`✅ ${used.length} variables are used`);
  console.log(`⚠️  ${unused.length} variables are unused\n`);
  
  if (unused.length > 0) {
    console.log('Unused environment variables:');
    unused.forEach((v) => {
      console.log(`  - ${v.name} (line ${v.line})`);
    });
    console.log('\nConsider removing these from .env.example or adding a comment explaining why they exist.');
    process.exit(1);
  }
  
  console.log('✅ All environment variables in .env.example are used in the codebase');
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
