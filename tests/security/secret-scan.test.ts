/**
 * Security Tests
 *
 * Verifies that the codebase does not contain committed secrets,
 * hardcoded credentials, or other security violations.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..');

/**
 * Patterns that indicate potentially committed secrets.
 */
const SECRET_PATTERNS = [
  /(?:api[_-]?key|apikey)\s*[:=]\s*['"][A-Za-z0-9]{20,}['"]/gi,
  /(?:secret|password|passwd|pwd)\s*[:=]\s*['"][^'"]{8,}['"]/gi,
  /(?:access[_-]?token|auth[_-]?token)\s*[:=]\s*['"][A-Za-z0-9]{20,}['"]/gi,
  /sk-[A-Za-z0-9]{32,}/g, // OpenAI API keys
  /EAA[A-Za-z0-9]{50,}/g, // Facebook access tokens
  /AIza[A-Za-z0-9_-]{35}/g, // Google API keys
  /sk-ant-[A-Za-z0-9_-]{40,}/g, // Anthropic API keys
  /ghp_[A-Za-z0-9]{36}/g, // GitHub personal access tokens
  /ghs_[A-Za-z0-9]{36}/g, // GitHub app tokens
];

/**
 * Files and directories to exclude from scanning.
 */
const EXCLUDED = new Set([
  'node_modules',
  '.git',
  '.wrangler',
  'dist',
  'coverage',
  'package-lock.json',
]);

/**
 * File extensions to scan.
 */
const SCANNABLE_EXTENSIONS = new Set([
  '.ts',
  '.js',
  '.json',
  '.jsonc',
  '.md',
  '.txt',
  '.yml',
  '.yaml',
  '.toml',
  '.env',
  '.cfg',
  '.ini',
  '.sql',
  '.html',
  '.css',
]);

function collectFiles(dir: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(dir)) {
    if (EXCLUDED.has(entry)) continue;

    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      files.push(...collectFiles(fullPath));
    } else if (SCANNABLE_EXTENSIONS.has(extname(entry))) {
      files.push(fullPath);
    }
  }

  return files;
}

describe('Secret Scanning', () => {
  const files = collectFiles(PROJECT_ROOT);

  it('should have files to scan', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const filePath of files) {
    const relativePath = filePath.replace(PROJECT_ROOT, '').replace(/\\/g, '/');

    // Skip the test file itself and example files
    if (relativePath.includes('secret-scan.test.ts')) continue;
    if (relativePath.includes('.env.example')) continue;

    it(`should not contain secrets in ${relativePath}`, () => {
      const content = readFileSync(filePath, 'utf-8');
      const violations: string[] = [];

      for (const pattern of SECRET_PATTERNS) {
        // Reset lastIndex for global regex
        pattern.lastIndex = 0;
        const matches = content.match(pattern);
        if (matches) {
          for (const match of matches) {
            // Skip obvious placeholders/examples
            if (
              match.includes('your-') ||
              match.includes('placeholder') ||
              match.includes('example') ||
              match.includes('PLACEHOLDER') ||
              match.includes('xxx')
            ) {
              continue;
            }
            violations.push(`Potential secret found: ${match.substring(0, 30)}...`);
          }
        }
      }

      expect(
        violations,
        `Secrets found in ${relativePath}:\n${violations.join('\n')}`,
      ).toHaveLength(0);
    });
  }
});

describe('.gitignore protection', () => {
  it('should protect .dev.vars', () => {
    const gitignore = readFileSync(join(PROJECT_ROOT, '.gitignore'), 'utf-8');
    expect(gitignore).toContain('.dev.vars');
  });

  it('should protect .env files', () => {
    const gitignore = readFileSync(join(PROJECT_ROOT, '.gitignore'), 'utf-8');
    expect(gitignore).toContain('.env');
    expect(gitignore).toContain('.env.local');
  });

  it('should allow .env.example', () => {
    const gitignore = readFileSync(join(PROJECT_ROOT, '.gitignore'), 'utf-8');
    expect(gitignore).toContain('!.env.example');
  });

  it('should protect credential files', () => {
    const gitignore = readFileSync(join(PROJECT_ROOT, '.gitignore'), 'utf-8');
    expect(gitignore).toContain('*.pem');
    expect(gitignore).toContain('*.key');
    expect(gitignore).toContain('secrets.json');
    expect(gitignore).toContain('credentials.json');
  });
});
