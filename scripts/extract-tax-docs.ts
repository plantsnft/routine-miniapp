/**
 * Extract text from tax documents (PPTX, XLSX, DOCX)
 * and create a comprehensive Statement of Truth
 */

import * as fs from 'fs';
import * as path from 'path';

// xlsx will be loaded dynamically

async function extractPPTX(filePath: string): Promise<string> {
  const content: string[] = [];
  
  try {
    // PPTX is a ZIP file - extract and read slide XML
    const AdmZip = (await import('adm-zip')).default;
    const zip = new AdmZip(filePath);
    const zipEntries = zip.getEntries();
    
    // Find all slide files
    const slideFiles = zipEntries.filter((entry: any) => 
      entry.entryName.match(/ppt\/slides\/slide\d+\.xml/)
    );
    
    for (const slide of slideFiles) {
      const slideContent = zip.readAsText(slide);
      // Extract text from XML (simple regex - could be improved)
      const textMatches = slideContent.match(/<a:t[^>]*>([^<]+)<\/a:t>/g);
      if (textMatches) {
        for (const match of textMatches) {
          const text = match.replace(/<[^>]+>/g, '').trim();
          if (text) content.push(text);
        }
      }
    }
  } catch (error: any) {
    console.warn(`Could not extract PPTX: ${error.message}`);
    return `[PPTX file - extraction failed: ${error.message}]`;
  }
  
  return content.join('\n');
}

async function extractXLSX(filePath: string): Promise<string> {
  try {
    const xlsxModule = await import('xlsx');
    const xlsx = xlsxModule.default || xlsxModule;
    const workbook = xlsx.readFile(filePath);
    const content: string[] = [];
    
    for (const sheetName of workbook.SheetNames) {
      content.push(`\n=== Sheet: ${sheetName} ===\n`);
      const worksheet = workbook.Sheets[sheetName];
      const data = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
      
      for (const row of data as any[][]) {
        const rowText = row.filter((cell: any) => cell !== null && cell !== undefined && cell !== '').join(' | ');
        if (rowText.trim()) {
          content.push(rowText);
        }
      }
    }
    
    return content.join('\n');
  } catch (error: any) {
    return `[Excel extraction error: ${error.message}]`;
  }
}

async function extractDOCX(filePath: string): Promise<string> {
  try {
    // DOCX is also a ZIP file
    const AdmZip = (await import('adm-zip')).default;
    const zip = new AdmZip(filePath);
    const document = zip.readAsText('word/document.xml');
    
    // Extract text from XML
    const textMatches = document.match(/<w:t[^>]*>([^<]+)<\/w:t>/g);
    if (textMatches) {
      return textMatches.map((match: string) => 
        match.replace(/<[^>]+>/g, '').trim()
      ).filter((t: string) => t).join('\n');
    }
    
    return '[DOCX file - no text found]';
  } catch (error: any) {
    return `[DOCX extraction error: ${error.message}]`;
  }
}

async function extractCSV(filePath: string): Promise<string> {
  try {
    return await fs.promises.readFile(filePath, 'utf-8');
  } catch (error: any) {
    return `[CSV read error: ${error.message}]`;
  }
}

async function processTaxFolder(folderPath: string): Promise<Map<string, string>> {
  const extracted: Map<string, string> = new Map();
  
  const files = [
    'Ryan Conlon personal.pptx',
    'Taxes Excel Document .xlsx',
    'word doc response.docx',
    'Kelsey\'s Business Expenses.xlsx',
    'personal bank account jul 23 to jan 2025.csv',
    'Bell st bank account july 23 to jan 2025.csv'
  ];
  
  for (const fileName of files) {
    const filePath = path.join(folderPath, fileName);
    if (!fs.existsSync(filePath)) {
      console.warn(`File not found: ${fileName}`);
      continue;
    }
    
    const ext = path.extname(fileName).toLowerCase();
    console.log(`Processing: ${fileName}...`);
    
    let content = '';
    if (ext === '.pptx') {
      content = await extractPPTX(filePath);
    } else if (ext === '.xlsx') {
      content = await extractXLSX(filePath);
    } else if (ext === '.docx') {
      content = await extractDOCX(filePath);
    } else if (ext === '.csv') {
      content = await extractCSV(filePath);
    }
    
    extracted.set(fileName, content);
  }
  
  return extracted;
}

async function main() {
  const taxFolder = 'C:\\Users\\me\\OneDrive\\Desktop\\Taxes\\taxes\\taxes';
  
  console.log('Extracting content from tax documents...\n');
  const extracted = await processTaxFolder(taxFolder);
  
  // Save extracted content
  const outputDir = path.join(taxFolder, 'extracted_content');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  for (const [fileName, content] of extracted.entries()) {
    const outputPath = path.join(outputDir, fileName.replace(/\.[^.]+$/, '.txt'));
    fs.writeFileSync(outputPath, content, 'utf-8');
    console.log(`Saved: ${outputPath}`);
  }
  
  console.log('\nExtraction complete!');
  console.log(`Files saved to: ${outputDir}`);
}

main().catch(console.error);
