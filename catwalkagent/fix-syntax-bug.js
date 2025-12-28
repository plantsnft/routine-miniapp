/**
 * Fix the replyingToCatwalk syntax bug
 * Run: node fix-syntax-bug.js
 */

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/lib/mentionHandler.ts');

if (!fs.existsSync(filePath)) {
  console.error('❌ Could not find mentionHandler.ts');
  process.exit(1);
}

console.log('🔧 Fixing syntax error...\n');

try {
  let content = fs.readFileSync(filePath, 'utf8');
  
  // The broken pattern: const replyingToCatwalk = ... if block ... !!cast.parent_author...
  // We need to move the if block to after the assignment completes
  
  // First, extract the if block
  const ifBlockRegex = /\/\/ Update creator roster if cast is in \/catwalk channel\s*if \(inCatwalkChannel[\s\S]*?\}\s*\}/;
  const ifBlockMatch = content.match(ifBlockRegex);
  
  if (!ifBlockMatch) {
    console.log('✅ No broken pattern found - file may already be fixed');
    process.exit(0);
  }
  
  const ifBlock = ifBlockMatch[0];
  
  // Remove the if block from its current (wrong) location
  content = content.replace(ifBlockRegex, '');
  
  // Find where replyingToCatwalk assignment ends and insert the if block after it
  content = content.replace(
    /(const replyingToCatwalk\s*=\s*!!cast\.parent_author && cast\.parent_author\.fid === CATWALK_FID;)/,
    `$1

${ifBlock}`
  );
  
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('✅ Fixed! The if block is now after the replyingToCatwalk assignment.');
  console.log('   Please verify the file compiles correctly.');
  
} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}

