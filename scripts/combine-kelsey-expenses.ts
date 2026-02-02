/**
 * Combine Kelsey's Business Expenses from multiple Excel files
 * into the main tax Excel document structure
 */

import * as fs from 'fs';
import * as path from 'path';

async function combineKelseyExpenses() {
  const taxFolder = 'C:\\Users\\me\\OneDrive\\Desktop\\Taxes\\taxes\\taxes';
  const kelseyFile = path.join(taxFolder, "Kelsey's Business Expenses.xlsx");
  const mainFile = path.join(taxFolder, 'Taxes Excel Document .xlsx');
  
  try {
    const xlsxModule = await import('xlsx');
    const xlsx = xlsxModule.default || xlsxModule;
    
    // Read Kelsey's file
    console.log('Reading Kelsey\'s Business Expenses...');
    const kelseyWorkbook = xlsx.readFile(kelseyFile);
    console.log('Sheets in Kelsey file:', kelseyWorkbook.SheetNames);
    
    // Read main file
    console.log('Reading main Tax Excel Document...');
    const mainWorkbook = xlsx.readFile(mainFile);
    console.log('Sheets in main file:', mainWorkbook.SheetNames);
    
    // Extract Kelsey data by year
    const kelseyData: any = {};
    for (const sheetName of kelseyWorkbook.SheetNames) {
      if (sheetName.includes('202') || sheetName.includes('Ryans Bills')) {
        const worksheet = kelseyWorkbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(worksheet, { 
          header: 1, 
          defval: '',
          raw: false 
        });
        kelseyData[sheetName] = data;
        console.log(`Extracted ${data.length} rows from ${sheetName}`);
      }
    }
    
    // Check if main file has Kelsey Book sheet
    let kelseyBookSheet = mainWorkbook.Sheets['Kelsey Book'] || null;
    
    if (!kelseyBookSheet) {
      console.log('Kelsey Book sheet not found in main file, will create summary');
    } else {
      console.log('Kelsey Book sheet exists in main file');
    }
    
    // Create combined summary
    const summary: any = {
      source: 'Kelsey\'s Business Expenses.xlsx',
      extracted: new Date().toISOString(),
      sheets: Object.keys(kelseyData),
      totalRows: Object.values(kelseyData).reduce((sum: number, data: any) => sum + data.length, 0),
      data: kelseyData
    };
    
    // Save summary
    const outputPath = path.join(taxFolder, 'extracted_content', 'Kelsey Business Expenses - Combined.json');
    fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2), 'utf-8');
    console.log(`\nCombined data saved to: ${outputPath}`);
    
    // Create readable summary
    let textOutput = 'KELSEY\'S BUSINESS EXPENSES - COMBINED SUMMARY\n';
    textOutput += '='.repeat(80) + '\n\n';
    textOutput += `Extracted: ${new Date().toLocaleString()}\n`;
    textOutput += `Source: Kelsey's Business Expenses.xlsx\n\n`;
    
    for (const [sheetName, data] of Object.entries(kelseyData)) {
      textOutput += `\n${'='.repeat(80)}\n`;
      textOutput += `SHEET: ${sheetName}\n`;
      textOutput += `${'='.repeat(80)}\n`;
      textOutput += `Rows: ${(data as any[]).length}\n\n`;
      
      // Show first 20 rows
      const rows = (data as any[]).slice(0, 20);
      for (const row of rows) {
        if (Array.isArray(row)) {
          const rowText = row.filter((cell: any) => cell !== null && cell !== undefined && cell !== '').join(' | ');
          if (rowText.trim()) {
            textOutput += rowText + '\n';
          }
        }
      }
      
      if ((data as any[]).length > 20) {
        textOutput += `\n... (${(data as any[]).length - 20} more rows)\n`;
      }
    }
    
    const textPath = path.join(taxFolder, 'extracted_content', 'Kelsey Business Expenses - Combined.txt');
    fs.writeFileSync(textPath, textOutput, 'utf-8');
    console.log(`Readable summary saved to: ${textPath}`);
    
    console.log('\n✅ Kelsey expenses extraction complete!');
    console.log('\nNext steps:');
    console.log('1. Review the combined data');
    console.log('2. Manually add missing expenses to main Excel "Kelsey Book" sheet');
    console.log('3. Verify all expenses are categorized correctly');
    
  } catch (error: any) {
    console.error('Error:', error);
    throw error;
  }
}

combineKelseyExpenses().catch(console.error);
