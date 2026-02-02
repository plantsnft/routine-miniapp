/**
 * Read the main tax Excel document and extract all data
 */

import * as fs from 'fs';
import * as path from 'path';

async function readTaxExcel() {
  const filePath = 'C:\\Users\\me\\OneDrive\\Desktop\\Taxes\\taxes\\taxes\\Taxes Excel Document .xlsx';
  
  try {
    const xlsxModule = await import('xlsx');
    const xlsx = xlsxModule.default || xlsxModule;
    const workbook = xlsx.readFile(filePath);
    
    console.log('Sheets found:', workbook.SheetNames);
    console.log('\n');
    
    const output: any = {};
    
    for (const sheetName of workbook.SheetNames) {
      console.log(`\n=== Processing Sheet: ${sheetName} ===`);
      const worksheet = workbook.Sheets[sheetName];
      
      // Try different parsing methods
      const jsonData = xlsx.utils.sheet_to_json(worksheet, { 
        header: 1, 
        defval: '',
        raw: false 
      });
      
      // Also try with headers
      const jsonWithHeaders = xlsx.utils.sheet_to_json(worksheet, {
        defval: '',
        raw: false
      });
      
      output[sheetName] = {
        rowCount: jsonData.length,
        firstFewRows: jsonData.slice(0, 10),
        headers: jsonWithHeaders.length > 0 ? Object.keys(jsonWithHeaders[0] || {}) : [],
        sampleData: jsonWithHeaders.slice(0, 5)
      };
      
      console.log(`Rows: ${jsonData.length}`);
      if (jsonData.length > 0) {
        console.log('First row:', jsonData[0]);
      }
    }
    
    // Save detailed output
    const outputPath = path.join(path.dirname(filePath), 'extracted_content', 'Taxes Excel Document - Detailed.json');
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8');
    console.log(`\nDetailed data saved to: ${outputPath}`);
    
    // Also create a readable text version
    let textOutput = 'TAX EXCEL DOCUMENT - COMPLETE EXTRACTION\n';
    textOutput += '='.repeat(80) + '\n\n';
    
    for (const [sheetName, data] of Object.entries(output)) {
      textOutput += `\n${'='.repeat(80)}\n`;
      textOutput += `SHEET: ${sheetName}\n`;
      textOutput += `${'='.repeat(80)}\n`;
      textOutput += `Total Rows: ${(data as any).rowCount}\n`;
      textOutput += `Headers: ${(data as any).headers.join(', ')}\n\n`;
      
      textOutput += 'Sample Data:\n';
      textOutput += '-'.repeat(80) + '\n';
      for (const row of (data as any).sampleData) {
        textOutput += JSON.stringify(row, null, 2) + '\n\n';
      }
    }
    
    const textPath = path.join(path.dirname(filePath), 'extracted_content', 'Taxes Excel Document - Readable.txt');
    fs.writeFileSync(textPath, textOutput, 'utf-8');
    console.log(`Readable text saved to: ${textPath}`);
    
    return output;
  } catch (error: any) {
    console.error('Error reading Excel:', error);
    throw error;
  }
}

readTaxExcel().catch(console.error);
