# Quick Start: Testing Citation Detection

## 1. Start the Application

The dev server is already running at:
- **Local**: http://localhost:3000
- **Network**: http://192.168.123.31:3000

## 2. Upload a PDF with Citations

### Best Test PDFs:
- Research papers from **arXiv** (LaTeX-generated)
- Papers from **IEEE Xplore** or **ACM Digital Library**
- Any PDF compiled from LaTeX/Overleaf with `\cite{}` commands

### Where to Get Test PDFs:
1. **arXiv.org** - Download any recent paper
2. **Google Scholar** - Most papers have PDF links
3. **Your own LaTeX papers** - If you have any

## 3. Test the Features

### A. Hover Tooltip
1. Find a citation number in the text (usually looks like: [1], [2], or superscript 1, 2)
2. **Hover** your mouse over it
3. **Wait 300ms** → Tooltip appears
4. Tooltip shows:
   - Reference text preview
   - Page number of reference
   - "Click to jump to reference" message

### B. Click Navigation
1. **Click** on a citation number
2. Watch the smooth scroll animation
3. See the page jump to the reference section
4. Notice the **blue flash highlight** effect on the target page

### C. Multiple Citations
1. Try hovering over different citations
2. Each should show its corresponding reference
3. Click different citations to jump to different references

## 4. What You Should See

### When Hovering:
```
┌─────────────────────────────────────┐
│ 📖 Reference • Page 15              │
│                                     │
│ [1] Smith, J. et al. "Title of     │
│ the Referenced Paper." Journal     │
│ Name, 2024. This paper discusses...│
│                                     │
│ ─────────────────────────────────  │
│ Click to jump to reference         │
└─────────────────────────────────────┘
```

### When Clicking:
1. **Smooth scroll** to reference page
2. **Page number updates** in toolbar
3. **Blue highlight flash** on the target page (1 second)

## 5. Keyboard Shortcuts

While the PDF viewer is focused:

| Key | Action |
|-----|--------|
| Click citation | Jump to reference |
| Hover citation | Show tooltip |
| Scroll/Drag | Dismiss tooltip |

## 6. Debugging

### Open Browser Console (F12)

You should see logs like:
```
[PDFCitationLinkDetector] Setting up citation link detection
[PDFCitationLinkDetector] Found 10 annotation layers
[PDFCitationLinkDetector] Layer 0 has 5 internal links
[PDFViewer] Citation link clicked, jumping to page: 15
```

### If No Logs Appear:
- PDF might not have internal link annotations
- Upload a different PDF (try arXiv)
- Check that PDF.js worker loaded successfully

## 7. Troubleshooting

### Tooltips Not Showing:
- **Cause**: PDF doesn't have internal link annotations
- **Solution**: Use a LaTeX-generated PDF from arXiv or similar

### Click Not Working:
- **Cause**: JavaScript error or page navigation disabled
- **Solution**: Check browser console for errors

### Performance Issues:
- **Cause**: Very large PDF (>500 pages)
- **Solution**: System is optimized, but extreme PDFs may be slow

## 8. Feature Comparison

### OLD (Existing System):
- Detects citations in extracted references
- Shows popup on hover/click
- Links to external paper URLs

### NEW (This Implementation):
- Detects **internal PDF links**
- Shows **reference preview** in tooltip
- **Jumps to reference section** in the same PDF
- Works **automatically** with PDF annotations

### Both Work Together:
The new system **complements** the existing citation system:
- Old system: External paper metadata & links
- New system: Internal PDF navigation

## 9. Example Test Case

### Sample Paper Structure:
```
Page 1: Introduction
  "Previous work [1] showed that..."  ← Click here

Page 15: References
  [1] Smith et al. 2024. "Title..." ← Jumps here
```

### Expected Behavior:
1. Hover over `[1]` on page 1
2. Tooltip shows: "Smith et al. 2024. Title..."
3. Click on `[1]`
4. Smooth scroll to page 15
5. Blue highlight on the reference

## 10. Recommended Test Papers

### Good Examples:
- https://arxiv.org/pdf/2308.07107 (PaperQA2 paper)
- Any recent ML paper from arXiv
- Papers with 20+ references

### Poor Examples:
- Scanned PDFs (no text layer)
- Image-based PDFs
- Very old PDFs without annotations

## 11. Visual Indicators

When citation detection is working:

✅ Citation links have:
- Blue color (rgb(59, 130, 246))
- Dotted underline on hover
- Pointer cursor
- Smooth transitions

❌ If you see none of these:
- PDF lacks internal link annotations
- Try a different PDF

## 12. Next Steps

After testing:
1. Try different PDF papers
2. Test with papers containing many citations
3. Try jumping between multiple references
4. Test with different browsers
5. Report any issues or bugs

## 13. Success Checklist

- [ ] Dev server running
- [ ] PDF uploaded
- [ ] Hover shows tooltip with reference preview
- [ ] Click jumps to reference section
- [ ] Smooth scroll animation works
- [ ] Blue highlight flash appears
- [ ] Page number updates correctly
- [ ] No console errors
- [ ] Works with multiple citations
- [ ] Tooltip positioning is correct (not off-screen)

## 14. Common Questions

**Q: Why doesn't it work with my PDF?**
A: Your PDF might not have internal link annotations. Try a LaTeX-generated paper from arXiv.

**Q: Can I disable the tooltip?**
A: Yes, remove the `<PDFCitationLinkDetector>` component from `pdf-viewer.tsx`.

**Q: How do I change the tooltip delay?**
A: Edit the timeout value (300ms) in `pdf-citation-link-detector.tsx` line ~103.

**Q: Does this work on mobile?**
A: Hover tooltips work on desktop only. Click navigation works on mobile.

## 15. Enjoy!

The citation detection system is now fully integrated and ready to use. Upload a PDF and start exploring!

---

**Need Help?** Check `CITATION_DETECTION.md` for detailed technical documentation.
