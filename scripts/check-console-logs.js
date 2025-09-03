#!/usr/bin/env node

import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

/**
 * Check for console.log statements in staged files
 */
function checkConsoleLogs() {
  try {
    // Get staged files
    const stagedFiles = execSync('git diff --cached --name-only --diff-filter=ACMR', {
      encoding: 'utf8',
      cwd: projectRoot
    }).trim().split('\n').filter(file => file);

    if (stagedFiles.length === 0) {
      console.log('✅ No staged files to check');
      return true;
    }

    // Filter for TypeScript/JavaScript files
    const jsTsFiles = stagedFiles.filter(file => 
      file.match(/\.(ts|tsx|js|jsx)$/) && 
      !file.includes('node_modules') &&
      !file.includes('dist/')
    );

    if (jsTsFiles.length === 0) {
      console.log('✅ No TypeScript/JavaScript files to check');
      return true;
    }

    let hasConsoleLogs = false;
    const consoleLogFiles = [];

    // Check each file for console.log statements
    for (const file of jsTsFiles) {
      try {
        const filePath = join(projectRoot, file);
        const content = execSync(`git show :${file}`, { encoding: 'utf8', cwd: projectRoot });
        
        // Check for console.log, console.warn, console.error, console.info
        const consoleRegex = /console\.(log|warn|error|info|debug)\s*\(/g;
        const matches = content.match(consoleRegex);
        
        if (matches) {
          hasConsoleLogs = true;
          consoleLogFiles.push({
            file,
            count: matches.length,
            methods: [...new Set(matches.map(match => match.replace('console.', '').replace('(', '')))]
          });
        }
      } catch (error) {
        // File might be new, check the working directory version
        try {
          const fs = await import('fs');
          const content = fs.readFileSync(join(projectRoot, file), 'utf8');
          const consoleRegex = /console\.(log|warn|error|info|debug)\s*\(/g;
          const matches = content.match(consoleRegex);
          
          if (matches) {
            hasConsoleLogs = true;
            consoleLogFiles.push({
              file,
              count: matches.length,
              methods: [...new Set(matches.map(match => match.replace('console.', '').replace('(', '')))]
            });
          }
        } catch (readError) {
          console.warn(`⚠️  Could not read file: ${file}`);
        }
      }
    }

    if (hasConsoleLogs) {
      console.log('\n🚨 WARNING: Console statements found in staged files:\n');
      
      consoleLogFiles.forEach(({ file, count, methods }) => {
        console.log(`📁 ${file}`);
        console.log(`   Found ${count} console.${methods.join(', console.')} statement(s)`);
      });
      
      console.log('\n💡 Consider removing console statements before committing to production.');
      console.log('   You can use a proper logger instead (e.g., pino, winston, etc.)');
      console.log('\n⚠️  This is a WARNING - commit will proceed, but please review the above files.\n');
      
      return true; // Allow commit to proceed with warning
    } else {
      console.log('✅ No console statements found in staged files');
      return true;
    }

  } catch (error) {
    console.error('❌ Error checking console logs:', error.message);
    return false;
  }
}

// Run the check
const success = checkConsoleLogs();
process.exit(success ? 0 : 1);
