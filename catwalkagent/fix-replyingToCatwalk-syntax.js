/**
 * Quick fix for the replyingToCatwalk syntax error
 * Run with: node fix-replyingToCatwalk-syntax.js
 */

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/lib/mentionHandler.ts');

if (!fs.existsSync(filePath)) {
  console.error('❌ Could not find mentionHandler.ts at:', filePath);
  process.exit(1);
}

console.log(`📁 Fixing syntax error in: ${filePath}\n`);

try {
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Find and fix the broken pattern
  // Look for: const replyingToCatwalk = ... followed by if block ... then the rest of the assignment
  const brokenPattern = /(const replyingToCatwalk\s*=\s*)\s*\/\/ Update creator roster if cast is in \/catwalk channel[\s\S]*?(\s*!!cast\.parent_author && cast\.parent_author\.fid === CATWALK_FID;)/;
  
  if (brokenPattern.test(content)) {
    // Extract the if block
    const ifBlockMatch = content.match(/\/\/ Update creator roster if cast is in \/catwalk channel[\s\S]*?\}\s*\}/);
    const ifBlock = ifBlockMatch ? ifBlockMatch[0] : '';
    
    // Replace the broken pattern with the correct one
    content = content.replace(
      brokenPattern,
      `$1$2

${ifBlock}`
    );
    
    console.log('✅ Fixed the replyingToCatwalk syntax error');
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('   File saved successfully!');
  } else {
    // Try alternative pattern - the if block might be in a different position
    const altPattern = /(const replyingToCatwalk\s*=\s*)\s*\/\/ Update creator roster[\s\S]*?(\s*!!cast\.parent_author && cast\.parent_author\.fid === CATWALK_FID;)/;
    
    if (altPattern.test(content)) {
      const ifBlockMatch = content.match(/\/\/ Update creator roster[\s\S]*?\}\s*\}/);
      const ifBlock = ifBlockMatch ? ifBlockMatch[0] : '';
      
      content = content.replace(
        altPattern,
        `$1$2

${ifBlock}`
      );
      
      console.log('✅ Fixed the replyingToCatwalk syntax error (alternative pattern)');
      fs.writeFileSync(filePath, content, 'utf8');
      console.log('   File saved successfully!');
    } else {
      // Manual fix pattern - find the exact broken sequence
      const manualFix = content.replace(
        /(const replyingToCatwalk\s*=\s*)\s*\/\/ Update creator roster if cast is in \/catwalk channel\s*if \(inCatwalkChannel[\s\S]*?\}\s*\}\s*(\s*!!cast\.parent_author && cast\.parent_author\.fid === CATWALK_FID;)/,
        `$1$2

  // Update creator roster if cast is in /catwalk channel
  if (inCatwalkChannel && cast.author?.fid && cast.timestamp) {
    try {
      await upsertCreatorFromCast(
        cast.author.fid,
        cast.author.username,
        cast.author.display_name,
        cast.timestamp
      );
    } catch (error) {
      logWithContext("error", "Failed to upsert creator from cast", {
        castHash: cast.hash,
        error: getErrorMessage(error),
      });
    }
  }`
      );
      
      if (manualFix !== content) {
        content = manualFix;
        console.log('✅ Fixed the replyingToCatwalk syntax error (manual pattern)');
        fs.writeFileSync(filePath, content, 'utf8');
        console.log('   File saved successfully!');
      } else {
        console.log('⚠️  Could not find the broken pattern automatically.');
        console.log('   Please fix manually:');
        console.log('   1. Find: const replyingToCatwalk =');
        console.log('   2. Complete the assignment: !!cast.parent_author && cast.parent_author.fid === CATWALK_FID;');
        console.log('   3. Then add the if block after it');
      }
    }
  }
  
} catch (error) {
  console.error('❌ Error fixing file:', error.message);
  process.exit(1);
}

