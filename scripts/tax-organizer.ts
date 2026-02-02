/**
 * Tax Organizer Tool
 * 
 * Organizes tax transactions by year and helps identify where losses can be applied.
 * This is a data organization tool only - not tax advice.
 * 
 * Usage: tsx scripts/tax-organizer.ts <path-to-excel-file>
 */

import * as fs from 'fs';
import * as path from 'path';
import { readFile } from 'fs/promises';

// xlsx will be loaded conditionally
let xlsx: any = null;

// Transaction types
type TransactionType = 
  | 'income'
  | 'crypto_loss'
  | 'crypto_gain'
  | 'stock_gain'
  | 'stock_loss'
  | 'rental_income'
  | 'rental_expense'
  | 'business_income'
  | 'business_expense'
  | 'gift_received'
  | 'other';

interface Transaction {
  date: Date;
  taxYear: number;
  type: TransactionType;
  category: string;
  description: string;
  amount: number; // Positive for income/gains, negative for losses/expenses
  source?: string; // e.g., "crypto", "rental property", "wife's business"
  notes?: string;
}

interface YearSummary {
  year: number;
  income: number;
  gains: number;
  losses: number;
  expenses: number;
  netIncome: number;
  transactions: Transaction[];
  lossCarryforward?: number; // Unused losses that can carry forward
}

// Tax year determination (US: Jan 1 - Dec 31)
function getTaxYear(date: Date): number {
  return date.getFullYear();
}

// Categorize transaction based on description/keywords
function categorizeTransaction(
  description: string,
  amount: number,
  date: Date
): { type: TransactionType; category: string; source?: string } {
  const desc = description.toLowerCase();
  
  // Crypto transactions
  if (desc.includes('crypto') || desc.includes('bitcoin') || desc.includes('ethereum') || 
      desc.includes('coinbase') || desc.includes('binance') || desc.includes('exchange')) {
    return {
      type: amount < 0 ? 'crypto_loss' : 'crypto_gain',
      category: 'Cryptocurrency',
      source: 'crypto'
    };
  }
  
  // Stock transactions
  if (desc.includes('stock') || desc.includes('equity') || desc.includes('gift') && desc.includes('dad')) {
    return {
      type: amount < 0 ? 'stock_loss' : 'stock_gain',
      category: 'Stocks/Securities',
      source: 'stocks'
    };
  }
  
  // Rental property
  if (desc.includes('rent') || desc.includes('rental') || desc.includes('property') || 
      desc.includes('tenant') || desc.includes('lease')) {
    return {
      type: amount < 0 ? 'rental_expense' : 'rental_income',
      category: 'Rental Property',
      source: 'rental property'
    };
  }
  
  // Business (book/paint)
  if (desc.includes('book') || desc.includes('paint') || desc.includes('business') || 
      desc.includes('revenue') || desc.includes('sales')) {
    return {
      type: amount < 0 ? 'business_expense' : 'business_income',
      category: 'Business',
      source: 'wife\'s business'
    };
  }
  
  // Default
  return {
    type: amount < 0 ? 'other' : 'income',
    category: 'Other',
    source: 'unknown'
  };
}

// Parse CSV/Excel data
async function parseTransactions(filePath: string): Promise<Transaction[]> {
  const ext = path.extname(filePath).toLowerCase();
  const transactions: Transaction[] = [];
  
  // Load xlsx if needed
  if ((ext === '.xlsx' || ext === '.xls') && !xlsx) {
    try {
      xlsx = await import('xlsx');
    } catch (e) {
      console.error('Excel support requires: npm install xlsx');
      console.error('Alternatively, convert your Excel file to CSV and try again.');
      throw new Error('xlsx package not installed');
    }
  }
  
  // Handle Excel files
  if ((ext === '.xlsx' || ext === '.xls') && xlsx) {
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(worksheet, { raw: false });
    
    for (const row of data as any[]) {
      try {
        // Try common column name variations
        const dateStr = row.Date || row.date || row.DATE || row['Transaction Date'] || row['TransactionDate'];
        const description = row.Description || row.description || row.DESCRIPTION || row['Transaction Description'] || row['TransactionDescription'] || row.Note || row.note || '';
        const amountStr = String(row.Amount || row.amount || row.AMOUNT || row['Transaction Amount'] || row['TransactionAmount'] || 0);
        const notes = row.Notes || row.notes || row.NOTES || row.Notes || '';
        
        if (!dateStr) continue;
        
        // Parse date (handle Excel serial dates)
        let date: Date;
        if (typeof dateStr === 'number') {
          // Excel serial date
          date = xlsx.SSF.parse_date_code(dateStr);
        } else {
          date = new Date(dateStr);
        }
        
        if (isNaN(date.getTime())) continue;
        
        // Parse amount
        const amount = parseFloat(String(amountStr).replace(/[^0-9.-]/g, ''));
        if (isNaN(amount) || amount === 0) continue;
        
        const { type, category, source } = categorizeTransaction(description, amount, date);
        const taxYear = getTaxYear(date);
        
        transactions.push({
          date,
          taxYear,
          type,
          category,
          description: String(description),
          amount,
          source,
          notes: String(notes || '')
        });
      } catch (error) {
        console.warn(`Skipping row: ${error}`);
      }
    }
  } else {
    // Handle CSV files
    const content = await readFile(filePath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());
    
    // Skip header if present
    const startLine = lines[0].toLowerCase().includes('date') ? 1 : 0;
    
    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      // Parse CSV line (handle quoted fields)
      const parts: string[] = [];
      let current = '';
      let inQuotes = false;
      
      for (let j = 0; j < line.length; j++) {
        const char = line[j];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          parts.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      parts.push(current.trim());
      
      if (parts.length < 3) continue;
      
      try {
        // Expected format: Date, Description, Amount, [Notes]
        const dateStr = parts[0];
        const description = parts[1] || '';
        const amountStr = parts[2].replace(/[^0-9.-]/g, '');
        const notes = parts[3] || '';
        
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) continue;
        
        const amount = parseFloat(amountStr);
        if (isNaN(amount)) continue;
        
        const { type, category, source } = categorizeTransaction(description, amount, date);
        const taxYear = getTaxYear(date);
        
        transactions.push({
          date,
          taxYear,
          type,
          category,
          description,
          amount,
          source,
          notes
        });
      } catch (error) {
        console.warn(`Skipping line ${i + 1}: ${error}`);
      }
    }
  }
  
  return transactions;
}

// Organize by year
function organizeByYear(transactions: Transaction[]): Map<number, YearSummary> {
  const yearMap = new Map<number, YearSummary>();
  
  for (const tx of transactions) {
    if (!yearMap.has(tx.taxYear)) {
      yearMap.set(tx.taxYear, {
        year: tx.taxYear,
        income: 0,
        gains: 0,
        losses: 0,
        expenses: 0,
        netIncome: 0,
        transactions: []
      });
    }
    
    const summary = yearMap.get(tx.taxYear)!;
    summary.transactions.push(tx);
    
    // Categorize amounts
    if (tx.type === 'income' || tx.type === 'rental_income' || tx.type === 'business_income') {
      summary.income += tx.amount;
    } else if (tx.type === 'crypto_gain' || tx.type === 'stock_gain') {
      summary.gains += tx.amount;
    } else if (tx.type === 'crypto_loss' || tx.type === 'stock_loss') {
      summary.losses += Math.abs(tx.amount); // Store as positive for losses
    } else if (tx.type === 'rental_expense' || tx.type === 'business_expense') {
      summary.expenses += Math.abs(tx.amount);
    }
  }
  
  // Calculate net income and loss carryforward for each year
  for (const summary of yearMap.values()) {
    summary.netIncome = summary.income + summary.gains - summary.losses - summary.expenses;
    
    // Capital losses can offset capital gains, then up to $3,000 of ordinary income
    // Unused losses carry forward
    const capitalGains = summary.gains;
    const capitalLosses = summary.losses;
    
    if (capitalLosses > capitalGains) {
      const unusedLosses = capitalLosses - capitalGains;
      // Can offset up to $3,000 of ordinary income per year
      const offsetAmount = Math.min(unusedLosses, 3000);
      summary.lossCarryforward = unusedLosses - offsetAmount;
    }
  }
  
  return yearMap;
}

// Generate CPA-ready report
function generateReport(yearMap: Map<number, YearSummary>): string {
  const years = Array.from(yearMap.keys()).sort();
  let report = '='.repeat(80) + '\n';
  report += 'TAX ORGANIZER REPORT - FOR CPA REVIEW\n';
  report += '='.repeat(80) + '\n\n';
  report += '⚠️  DISCLAIMER: This is data organization only, not tax advice.\n';
  report += '   Consult with your CPA for actual tax filing and strategy.\n\n';
  
  // Summary by year
  report += 'SUMMARY BY TAX YEAR\n';
  report += '-'.repeat(80) + '\n';
  report += 'Year'.padEnd(8) + 
            'Income'.padEnd(15) + 
            'Gains'.padEnd(15) + 
            'Losses'.padEnd(15) + 
            'Expenses'.padEnd(15) + 
            'Net Income'.padEnd(15) + 
            'Loss Carryforward\n';
  report += '-'.repeat(80) + '\n';
  
  for (const year of years) {
    const summary = yearMap.get(year)!;
    report += `${year}`.padEnd(8) +
              `$${summary.income.toFixed(2)}`.padEnd(15) +
              `$${summary.gains.toFixed(2)}`.padEnd(15) +
              `$${summary.losses.toFixed(2)}`.padEnd(15) +
              `$${summary.expenses.toFixed(2)}`.padEnd(15) +
              `$${summary.netIncome.toFixed(2)}`.padEnd(15) +
              (summary.lossCarryforward ? `$${summary.lossCarryforward.toFixed(2)}` : '$0.00') +
              '\n';
  }
  
  // Detailed transactions by year
  report += '\n\nDETAILED TRANSACTIONS BY YEAR\n';
  report += '='.repeat(80) + '\n';
  
  for (const year of years) {
    const summary = yearMap.get(year)!;
    report += `\n${year} - ${summary.transactions.length} transactions\n`;
    report += '-'.repeat(80) + '\n';
    
    // Group by category
    const byCategory = new Map<string, Transaction[]>();
    for (const tx of summary.transactions) {
      if (!byCategory.has(tx.category)) {
        byCategory.set(tx.category, []);
      }
      byCategory.get(tx.category)!.push(tx);
    }
    
    for (const [category, txs] of byCategory.entries()) {
      report += `\n  ${category}:\n`;
      for (const tx of txs.sort((a, b) => a.date.getTime() - b.date.getTime())) {
        const dateStr = tx.date.toLocaleDateString();
        const amountStr = tx.amount >= 0 
          ? `+$${tx.amount.toFixed(2)}` 
          : `-$${Math.abs(tx.amount).toFixed(2)}`;
        report += `    ${dateStr.padEnd(12)} ${amountStr.padEnd(15)} ${tx.description}\n`;
        if (tx.notes) {
          report += `      Notes: ${tx.notes}\n`;
        }
      }
    }
  }
  
  // Loss carryforward analysis
  report += '\n\nLOSS CARRYFORWARD ANALYSIS\n';
  report += '='.repeat(80) + '\n';
  report += 'General guidance (consult CPA for specifics):\n';
  report += '- Capital losses can offset capital gains in the same year\n';
  report += '- Unused capital losses can offset up to $3,000 of ordinary income per year\n';
  report += '- Remaining losses carry forward to future years\n';
  report += '- Business losses may have different rules (NOL carryforward)\n';
  report += '- Rental losses may be limited by passive activity rules\n\n';
  
  let totalCarryforward = 0;
  for (const year of years) {
    const summary = yearMap.get(year)!;
    if (summary.lossCarryforward && summary.lossCarryforward > 0) {
      report += `${year}: $${summary.lossCarryforward.toFixed(2)} available to carry forward\n`;
      totalCarryforward += summary.lossCarryforward;
    }
  }
  
  if (totalCarryforward > 0) {
    report += `\nTotal unused losses: $${totalCarryforward.toFixed(2)}\n`;
    report += 'These can potentially be applied to future years.\n';
  }
  
  // Export format suggestions
  report += '\n\nEXPORT FORMATS FOR CPA\n';
  report += '='.repeat(80) + '\n';
  report += '1. CSV by year (one file per year)\n';
  report += '2. Excel workbook with one sheet per year\n';
  report += '3. Summary totals by category and year\n';
  report += '4. Supporting documentation checklist\n\n';
  
  return report;
}

// Export to CSV
function exportToCSV(yearMap: Map<number, YearSummary>, outputDir: string): void {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const years = Array.from(yearMap.keys()).sort();
  
  for (const year of years) {
    const summary = yearMap.get(year)!;
    const csvPath = path.join(outputDir, `tax_${year}.csv`);
    
    let csv = 'Date,Type,Category,Description,Amount,Source,Notes\n';
    for (const tx of summary.transactions.sort((a, b) => a.date.getTime() - b.date.getTime())) {
      csv += `${tx.date.toISOString().split('T')[0]},${tx.type},${tx.category},"${tx.description}",${tx.amount},${tx.source || ''},"${tx.notes || ''}"\n`;
    }
    
    fs.writeFileSync(csvPath, csv);
    console.log(`Exported ${year} to ${csvPath}`);
  }
  
  // Summary CSV
  const summaryPath = path.join(outputDir, 'summary_by_year.csv');
  let summaryCsv = 'Year,Income,Gains,Losses,Expenses,Net Income,Loss Carryforward\n';
  for (const year of years) {
    const summary = yearMap.get(year)!;
    summaryCsv += `${year},${summary.income},${summary.gains},${summary.losses},${summary.expenses},${summary.netIncome},${summary.lossCarryforward || 0}\n`;
  }
  fs.writeFileSync(summaryPath, summaryCsv);
  console.log(`Exported summary to ${summaryPath}`);
}

// Main function
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Tax Organizer Tool');
    console.log('Usage: tsx scripts/tax-organizer.ts <path-to-csv-or-excel-file>');
    console.log('\nSupports:');
    console.log('  - Excel files (.xlsx, .xls) - requires: npm install xlsx');
    console.log('  - CSV files (.csv)');
    console.log('\nExpected format:');
    console.log('  Date,Description,Amount,Notes');
    console.log('  2021-01-15,Bought Bitcoin,-5000,');
    console.log('  2021-06-20,Sold Bitcoin,3000,');
    console.log('\nThe tool will:');
    console.log('  1. Organize transactions by tax year');
    console.log('  2. Categorize by type (income, gains, losses, expenses)');
    console.log('  3. Calculate loss carryforward opportunities');
    console.log('  4. Generate CPA-ready reports');
    console.log('\nSee scripts/TAX_ORGANIZER_README.md for details');
    process.exit(1);
  }
  
  const filePath = args[0];
  
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }
  
  console.log(`Reading transactions from: ${filePath}`);
  const transactions = await parseTransactions(filePath);
  console.log(`Parsed ${transactions.length} transactions`);
  
  const yearMap = organizeByYear(transactions);
  console.log(`Organized into ${yearMap.size} tax years`);
  
  // Generate report
  const report = generateReport(yearMap);
  const reportPath = path.join(path.dirname(filePath), 'tax_organizer_report.txt');
  fs.writeFileSync(reportPath, report);
  console.log(`\nReport saved to: ${reportPath}`);
  console.log('\n' + report);
  
  // Export CSVs
  const outputDir = path.join(path.dirname(filePath), 'tax_exports');
  exportToCSV(yearMap, outputDir);
  console.log(`\nCSV files exported to: ${outputDir}`);
}

main().catch(console.error);
