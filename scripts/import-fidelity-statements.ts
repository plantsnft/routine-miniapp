/**
 * Import Fidelity Statements
 * 
 * This script helps identify and process Fidelity statements
 * User needs to provide the statements, then we can extract transaction data
 */

import * as fs from 'fs';
import * as path from 'path';

async function findFidelityStatements() {
  const taxFolder = 'C:\\Users\\me\\OneDrive\\Desktop\\Taxes\\taxes\\taxes';
  
  console.log('Searching for Fidelity statements...\n');
  
  // Search for PDF files that might be Fidelity statements
  const allFiles: string[] = [];
  
  function searchDir(dir: string, depth: number = 0): void {
    if (depth > 10) return; // Prevent infinite recursion
    
    try {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const fullPath = path.join(dir, item);
        try {
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            searchDir(fullPath, depth + 1);
          } else if (stat.isFile()) {
            const lowerName = item.toLowerCase();
            if (lowerName.includes('fidelity') || 
                lowerName.includes('1099') ||
                lowerName.includes('consolidated') ||
                (lowerName.endsWith('.pdf') && (lowerName.includes('statement') || lowerName.includes('tax')))) {
              allFiles.push(fullPath);
            }
          }
        } catch (e) {
          // Skip files we can't access
        }
      }
    } catch (e) {
      // Skip directories we can't access
    }
  }
  
  searchDir(taxFolder);
  
  console.log(`Found ${allFiles.length} potential Fidelity/tax documents:\n`);
  for (const file of allFiles) {
    const relativePath = path.relative(taxFolder, file);
    console.log(`  - ${relativePath}`);
  }
  
  if (allFiles.length === 0) {
    console.log('\n⚠️  No Fidelity statements found in tax folder.');
    console.log('\nPlease:');
    console.log('1. Download all Fidelity statements (2020-2024)');
    console.log('2. Place them in the tax folder');
    console.log('3. Run this script again');
    console.log('\nFidelity statements typically include:');
    console.log('  - 1099-DIV (dividends)');
    console.log('  - 1099-B (brokerage transactions)');
    console.log('  - 1099-INT (interest)');
    console.log('  - Consolidated 1099');
    console.log('  - Annual statements');
  } else {
    console.log('\n✅ Found potential Fidelity/tax documents!');
    console.log('\nNext steps:');
    console.log('1. Verify these are Fidelity statements');
    console.log('2. Extract transaction data from PDFs');
    console.log('3. Import into main Excel document');
  }
  
  // Save list
  const outputPath = path.join(taxFolder, 'extracted_content', 'Fidelity Statements Found.txt');
  fs.writeFileSync(outputPath, allFiles.join('\n'), 'utf-8');
  console.log(`\nList saved to: ${outputPath}`);
}

findFidelityStatements().catch(console.error);
