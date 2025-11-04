# How to Upload the Logo Image

## Step-by-Step Instructions

### Option 1: Using File Explorer (Windows) or Finder (Mac)

1. **Locate your project folder:**
   - Navigate to: `c:\miniapps\routine\public\`

2. **Check what's already there:**
   - You should see files like:
     - `icon.png`
     - `splash.png`

3. **Copy your logo file:**
   - Find your logo image file on your computer
   - Make sure it's named exactly: `logo.png`
   - If your logo has a different name (like `logo.jpg` or `catwalk-logo.png`), rename it to `logo.png` first

4. **Paste the logo:**
   - Copy the `logo.png` file
   - Paste it into the `c:\miniapps\routine\public\` folder
   - You should now have: `c:\miniapps\routine\public\logo.png`

### Option 2: Using VS Code or Cursor

1. **Open your project in VS Code/Cursor:**
   - Make sure you have the `routine` folder open

2. **Navigate to the public folder:**
   - In the left sidebar (file explorer), find the `public` folder
   - Click on it to expand

3. **Add the logo:**
   - Right-click in the `public` folder
   - Select "New File" or "Paste" if you have the file copied
   - Name it `logo.png`
   - Or drag and drop your logo file into the `public` folder

### Option 3: Using Command Line (Terminal)

1. **Open Terminal/PowerShell in your project:**
   - Navigate to: `c:\miniapps\routine\`

2. **Copy your logo:**
   ```powershell
   # If your logo is on your Desktop:
   copy "C:\Users\YourName\Desktop\logo.png" "public\logo.png"
   
   # Or if it's in Downloads:
   copy "C:\Users\YourName\Downloads\logo.png" "public\logo.png"
   
   # Replace "YourName" with your actual Windows username
   ```

## Important Notes:

1. **File name must be exact:** The file MUST be named `logo.png` (lowercase, exactly as shown)

2. **File format:** 
   - PNG format is recommended (supports transparency)
   - JPG also works, but you'd need to rename it to `logo.png` (or update the code)

3. **After uploading:**
   - The logo will appear automatically on the next page refresh
   - If you're running the dev server (`npm run dev`), it should update automatically
   - If deployed to Vercel, you'll need to commit and push the file, then redeploy

4. **To commit the logo to Git:**
   ```powershell
   git add public/logo.png
   git commit -m "Add logo image"
   git push origin master
   ```

5. **Current location in code:**
   - The logo is referenced in: `src/components/ui/tabs/HomeTab.tsx`
   - It's looking for: `/logo.png` (which means `public/logo.png`)

## Troubleshooting:

- **Logo not showing?** Check that:
  1. File is named exactly `logo.png`
  2. File is in the `public` folder (not `src` or anywhere else)
  3. File is a valid image format
  4. Browser cache is cleared (try hard refresh: Ctrl+F5)

- **Need to use a different file name?** 
  - Update line 119 in `src/components/ui/tabs/HomeTab.tsx`
  - Change `src="/logo.png"` to your filename

