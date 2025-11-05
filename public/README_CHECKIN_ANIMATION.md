# Check-in Animation GIF

## File Location
Place your check-in animation GIF file at:
```
public/checkin-animation.gif
```

## Requirements
- **Format:** GIF (animated)
- **Recommended Duration:** 5 seconds (or less)
- **Recommended Size:** Optimized for web (aim for < 2MB)
- **Dimensions:** 
  - Full screen on mobile devices
  - Recommended aspect ratio: 9:16 (portrait) or 16:9 (landscape)
  - The component will scale to fit the screen

## Usage
The GIF will automatically play for 5 seconds when a user successfully checks in.

## Customization
You can customize the GIF URL and duration in `src/app/daily-checkin.tsx`:
```tsx
<CheckinGifAnimation
  isVisible={showAnimation}
  gifUrl="/your-custom-animation.gif"  // Change this
  duration={5000}  // Change duration in milliseconds
  onComplete={() => {
    setShowAnimation(false);
  }}
/>
```

## Testing
1. Add your GIF file to the `public` folder
2. Run `npm run dev`
3. Perform a check-in
4. The GIF should play full-screen for 5 seconds

## Notes
- The GIF will automatically scale to fit the screen while maintaining aspect ratio
- The component handles missing GIFs gracefully (shows loading state)
- Background is black (#000000) to match the app theme
- The animation blocks user interaction during playback (5 seconds)

