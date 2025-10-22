import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";

// Required for PDF.js to work in browser environments
GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js`;

/**
 * Groups text items by their vertical position (y-coordinate) to form complete lines
 */
function groupItemsByLine(items: any[], tolerance = 2) {
  const lines: any[][] = [];
  
  // Sort items by y-coordinate (top to bottom)
  const sortedItems = [...items].sort((a, b) => {
    const yA = a.transform[5]; // y-coordinate is at index 5
    const yB = b.transform[5];
    return yB - yA; // Higher y values first (top of page)
  });

  for (const item of sortedItems) {
    const itemY = item.transform[5];
    
    // Find existing line with similar y-coordinate
    let foundLine = false;
    for (const line of lines) {
      const lineY = line[0].transform[5];
      if (Math.abs(itemY - lineY) <= tolerance) {
        line.push(item);
        foundLine = true;
        break;
      }
    }
    
    // Create new line if no matching line found
    if (!foundLine) {
      lines.push([item]);
    }
  }
  
  // Sort items within each line by x-coordinate (left to right)
  return lines.map(line => 
    line.sort((a, b) => a.transform[4] - b.transform[4]) // x-coordinate is at index 4
  );
}

/**
 * Combines text items in a line into a single string
 */
function combineLineText(lineItems: any[]) {
  return lineItems
    .map(item => item.str?.trim() || '')
    .filter(str => str.length > 0)
    .join(' ')
    .trim();
}

/**
 * Gets the dominant font for a line (most common font)
 */
function getLineFontName(lineItems: any[]) {
  const fontCounts: { [key: string]: number } = {};
  
  for (const item of lineItems) {
    const fontName = item.fontName;
    if (fontName) {
      fontCounts[fontName] = (fontCounts[fontName] || 0) + 1;
    }
  }
  
  // Return the most frequent font
  return Object.entries(fontCounts)
    .sort(([,a], [,b]) => b - a)[0]?.[0] || '';
}

/**
 * Gets the average font size for a line
 */
function getLineFontSize(lineItems: any[]) {
  let totalSize = 0;
  let count = 0;
  
  for (const item of lineItems) {
    // Font size is typically the height in the transform matrix
    const fontSize = item.transform[3] || item.height || 0;
    if (fontSize > 0) {
      totalSize += fontSize;
      count++;
    }
  }
  
  return count > 0 ? totalSize / count : 0;
}

/**
 * Analyze document to determine normal body text characteristics
 */
function analyzeDocumentBodyText(allLines: any[][]) {
  const fontAnalysis: { [key: string]: { count: number; sizes: number[] } } = {};
  
  // Collect all font usage statistics
  for (const line of allLines) {
    const lineText = combineLineText(line);
    
    // Skip very short lines (likely not body text)
    if (lineText.length < 10) continue;
    
    const fontName = getLineFontName(line);
    const fontSize = getLineFontSize(line);
    
    if (fontName && fontSize > 0) {
      if (!fontAnalysis[fontName]) {
        fontAnalysis[fontName] = { count: 0, sizes: [] };
      }
      fontAnalysis[fontName].count++;
      fontAnalysis[fontName].sizes.push(fontSize);
    }
  }
  
  // Find the most common font (likely body text)
  let dominantFont = '';
  let maxCount = 0;
  
  for (const [fontName, data] of Object.entries(fontAnalysis)) {
    if (data.count > maxCount) {
      maxCount = data.count;
      dominantFont = fontName;
    }
  }
  
  // Calculate average size for dominant font
  const bodyTextSize = dominantFont && fontAnalysis[dominantFont] 
    ? fontAnalysis[dominantFont].sizes.reduce((a, b) => a + b) / fontAnalysis[dominantFont].sizes.length
    : 10; // fallback
  
  return {
    dominantFont,
    bodyTextSize,
    fontAnalysis
  };
}

/**
 * Calculate average line spacing for the document
 */
function calculateAverageLineSpacing(lines: any[][]) {
  const spacings: number[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const prevY = lines[i - 1][0]?.transform[5] || 0;
    const currY = lines[i][0]?.transform[5] || 0;
    const spacing = Math.abs(prevY - currY);
    if (spacing > 0 && spacing < 50) {
      spacings.push(spacing);
    }
  }
  
  return spacings.length > 0 ? spacings.reduce((a, b) => a + b) / spacings.length : 12;
}

/**
 * Check if font size is significantly different from body text
 */
function checkFontSizeRule(lineItems: any[], bodyTextSize: number) {
  const lineFontSize = getLineFontSize(lineItems);
  
  // Skip very small fonts (likely footnotes, captions, etc.)
  const isVerySmallFont = lineFontSize < bodyTextSize ; // 20% smaller than body
  if (isVerySmallFont) {
    return {
      lineFontSize,
      bodyTextSize,
      sizeRatio: lineFontSize / bodyTextSize,
      isLargerFont: false,
      isMuchLargerFont: false,
      isVerySmallFont: true,
      score: 0 // No score for small fonts
    };
  }
  
  // Consider larger fonts as potential headings
  const sizeRatio = lineFontSize / bodyTextSize;
  const isLargerFont = sizeRatio >= 1; // 15% larger
  const isMuchLargerFont = sizeRatio >= 1.3; // 30% larger
  
  let score = 0;
  if (isMuchLargerFont) score = 100;
  else if (isLargerFont) score = 100;
  
  return {
    lineFontSize,
    bodyTextSize,
    sizeRatio,
    isLargerFont,
    isMuchLargerFont,
    isVerySmallFont: false,
    score
  };
}

/**
 * Check if font style is different from body text
 */
function checkFontStyleRule(lineItems: any[], dominantFont: string) {
  const lineFontName = getLineFontName(lineItems);
  
  // Check if font is different from body text font
  const isDifferentFont = lineFontName !== dominantFont;
  
  // Check for specific font style indicators
  const isBoldFont = /bold|heavy|black|semibold|demi/i.test(lineFontName);
  const isItalicFont = /italic|oblique/i.test(lineFontName);
  const isHeadingFont = /heading|title|h[1-6]/i.test(lineFontName);
  
  let score = 0;
  if (isBoldFont || isHeadingFont || isDifferentFont || isItalicFont) {
    score = 100;
  }
  
  return {
    lineFontName,
    dominantFont,
    isDifferentFont,
    isBoldFont,
    isItalicFont,
    isHeadingFont,
    score
  };
}

/**
 * Pattern Rule - Uppercase/Titlecase formatting patterns
 * This stage catches visual formatting patterns
 */
function checkPatternRule(text: string) {
  // Title case pattern (each word starts with capital)
  const isTitleCase = /^[A-Z][a-zA-Z\s]*$/.test(text) && 
                     text.split(' ').length <= 8 &&
                     text.split(' ').every(word => 
                       word.length === 0 || word[0] === word[0].toUpperCase()
                     );
  
  // All caps pattern (for section headers)
  const isAllCaps = /^[A-Z][A-Z\s]{2,30}$/.test(text);
  
  let score = 0;
  
  if (isTitleCase && text.length <= 50) score = 100;
  else if (isAllCaps) score = 100;
  
  return {
    isTitleCase,
    isAllCaps,
    score,
    level: 1,
    // Legacy compatibility
    isAcademicKeyword: false,
    sectionNumber: '',
    sectionText: text,
    patternType: isAllCaps ? 'all-caps' : (isTitleCase ? 'title-case' : 'none')
  };
}

/**
 * Check for vertical spacing isolation
 */
function checkSpacingRule(currentIndex: number, lines: any[][], avgLineSpacing: number) {
  if (lines.length < 2) return { score: 0, isIsolated: false };
  
  const currentY = lines[currentIndex][0]?.transform[5] || 0;
  
  let spacingBefore = 0;
  if (currentIndex > 0) {
    const prevY = lines[currentIndex - 1][0]?.transform[5] || 0;
    spacingBefore = Math.abs(currentY - prevY);
  }
  
  let spacingAfter = 0;
  if (currentIndex < lines.length - 1) {
    const nextY = lines[currentIndex + 1][0]?.transform[5] || 0;
    spacingAfter = Math.abs(currentY - nextY);
  }
  
  const isExtraSpaceBefore = spacingBefore > avgLineSpacing * 1.5;
  const isExtraSpaceAfter = spacingAfter > avgLineSpacing * 1.5;
  const isIsolated = isExtraSpaceBefore || isExtraSpaceAfter;
  
  let score = 0;
  if (isIsolated) score = 100;
  
  return {
    isIsolated,
    isExtraSpaceBefore,
    isExtraSpaceAfter,
    spacingBefore,
    spacingAfter,
    score
  };
}

/**
 * Check if line is very short (potential heading)
 */
function checkShortLineRule(text: string) {
  const words = text.trim().split(/\s+/);
  const wordCount = words.length;
  
  const isVeryShort = wordCount <= 4;
  const isShort = wordCount <= 8;
  const isTooLong = wordCount > 15 || text.length > 100;
  
  let score = 0;
  if (isVeryShort || isShort) score = 100;
  if (isTooLong) score = 0; // No score for long text
  
  return {
    isVeryShort,
    isShort,
    isTooLong,
    wordCount,
    score
  };
}

/**
 * Helper function to check if text contains academic keywords
 */
function checkIfAcademicKeyword(text: string): boolean {
  const academicKeywords = /^(abstract|introduction|intro|literature\s+review|related\s+work|background|prior\s+work|state\s+of\s+the\s+art|methodology|methods|method|approach|framework|model|algorithm|technique|experimental\s+setup|experiment|experiments|experimental\s+design|implementation|system\s+design|architecture|design|data|dataset|datasets|data\s+collection|data\s+preparation|analysis|statistical\s+analysis|data\s+analysis|results|findings|experimental\s+results|outcomes|evaluation|performance|validation|testing|discussion|interpretation|implications|case\s+study|use\s+case|application|applications|limitations|constraints|challenges|conclusion|conclusions|summary|future\s+work|future\s+directions|recommendations|acknowledgments|acknowledgements|thanks|references|bibliography|citations|appendix|appendices|supplementary|supplement)$/i;
  
  return academicKeywords.test(text.trim());
}

/**
 * Textual Pattern Rules - catches semantic heading patterns
 * This stage handles numbered sections + academic words
 */
function checkTextualPatternRule(text: string) {
  let isSection = false;
  let sectionNumber = '';
  let sectionText = '';
  let level = 1;
  let score = 0;
  let patternType = '';
  let hasAcademicKeyword = false;
  
  // 1. Check for numbered sections first
  // Arabic numerals: "1", "1.1", "1.1.1", etc.
  const arabicPattern = /^(\d{1,2}(?:\.\d{1,2})*)\.?\s+(.+)$/;
  const arabicMatch = text.match(arabicPattern);
  
  // Letters with optional sub-numbering: "A", "B.1", "D.2", etc.
  const letterPattern = /^([A-Z])(?:\.(\d{1,2}))?\.?\s+(.+)$/;
  const letterMatch = text.match(letterPattern);
  
  // Roman numerals: "I", "II", "III", "IV", "V", etc.
  const romanPattern = /^([IVX]+)\.?\s+(.+)$/;
  const romanMatch = text.match(romanPattern);
  
  // Sub-lettering: "a)", "b)", "i)", "ii)", etc.
  const subLetterPattern = /^([a-z]|[ivx]+)\)\s+(.+)$/;
  const subLetterMatch = text.match(subLetterPattern);
  
  // Parentheses: "(a)", "(1)", etc.
  const parenthesesPattern = /^\(([A-Za-z0-9]+)\)\s+(.+)$/;
  const parenthesesMatch = text.match(parenthesesPattern);
  
  // Check numbered sections
  if (arabicMatch) {
    sectionNumber = arabicMatch[1];
    sectionText = arabicMatch[2];
    level = sectionNumber.split('.').length;
    patternType = 'numbered-arabic';
    isSection = true;
    
    // VALIDATION 1: Check for special characters after numbers (except dots)
    // Look for patterns like "1-", "2--", "3*", "4#", etc.
    const hasInvalidChars = /\d+\.?\d*\s*[^\w\s]/g.test(text);
    if (hasInvalidChars) {
      isSection = false; // Reject "17 -- Tracked", "2* Results", "3# Methods", etc.
    }
    
    // VALIDATION 2: Section text should not be just numbers
    const isOnlyNumbers = /^\d+(\s+\d+)*$/.test(sectionText.trim());
    if (isOnlyNumbers) {
      isSection = false; // Reject "4 1 3", "2 5 8", "1 2 3 4", etc.
    }
    
    // VALIDATION 3: Section text should have at least one real word (not just numbers/letters)
    const words = sectionText.trim().split(/\s+/);
    const hasRealWord = words.some(word => 
      word.length > 1 && /^[A-Za-z]/.test(word) // Multi-character word starting with letter
    );
    if (!hasRealWord) {
      isSection = false; // Reject "1 A B", "2 X Y Z", etc.
    }
    
    // VALIDATION 4: Check for code/technical patterns
    if (isSection) {
      const hasCodePattern = /@|#|\$|%|\^|&|\*|\+|=|\||\\|\/|<|>|\{|\}|\[|\]|`/.test(sectionText);
      if (hasCodePattern) {
        isSection = false; // Reject "1 @dataclass", "2 #include", etc.
      }
    }
  } else if (letterMatch) {
    const letter = letterMatch[1];
    const subNumber = letterMatch[2];
    sectionText = letterMatch[3];
    
    if (subNumber) {
      sectionNumber = `${letter}.${subNumber}`;
      level = 2; // Letter with sub-number is level 2
    } else {
      sectionNumber = letter;
      level = 1; // Just letter is level 1
    }
    patternType = 'numbered-letter';
    isSection = true;
    
    // VALIDATION 1: Check if there's at least one meaningful word after the letter section
    const words = sectionText.trim().split(/\s+/);
    
    if (words.length > 0) {
      // Look for at least one word that is either:
      // 1. Multi-character (length > 1), OR
      // 2. Single character but different from the section letter
      const hasRealWord = words.some(word => 
        word.length > 1 || // Multi-character word like "Case", "Study", "Introduction"
        (word.length === 1 && word !== letter) // Single char but different from section letter
      );
      
      if (!hasRealWord) {
        isSection = false; // Reject patterns with no meaningful words
      }
    } else {
      isSection = false; // Reject if no words after section letter
    }
    
    // VALIDATION 2: Check for repeated letter patterns like "V V B B"
    if (isSection && words.length >= 2) {
      // Count how many words are single letters
      const singleLetterWords = words.filter(word => word.length === 1 && /^[A-Z]$/i.test(word));
      const totalWords = words.length;
      
      // If more than half the words are single letters, likely a false pattern
      if (singleLetterWords.length > totalWords / 2 && totalWords <= 4) {
        isSection = false; // Reject "V V B B", "A A B C", etc.
      }
    }
    
    // VALIDATION 3: Check for code/technical patterns
    if (isSection) {
      const hasCodePattern = /@|#|\$|%|\^|&|\*|\+|=|\||\\|\/|<|>|\{|\}|\[|\]|`/.test(sectionText);
      if (hasCodePattern) {
        isSection = false; // Reject "A @property", "B #define", etc.
      }
    }
  } else if (romanMatch) {
    sectionNumber = romanMatch[1];
    sectionText = romanMatch[2];
    level = 1;
    patternType = 'numbered-roman';
    isSection = true;
    
    // VALIDATION: Check for code/technical patterns
    const hasCodePattern = /@|#|\$|%|\^|&|\*|\+|=|\||\\|\/|<|>|\{|\}|\[|\]|`/.test(sectionText);
    if (hasCodePattern) {
      isSection = false; // Reject "I @override", etc.
    }
  } else if (subLetterMatch) {
    sectionNumber = subLetterMatch[1];
    sectionText = subLetterMatch[2];
    level = 2;
    patternType = 'numbered-sub';
    isSection = true;
  } else if (parenthesesMatch) {
    sectionNumber = parenthesesMatch[1];
    sectionText = parenthesesMatch[2];
    level = 2;
    patternType = 'numbered-parentheses';
    isSection = true;
  }
  
  // 2. If numbered section found, check if text is academic
  if (isSection) {
    hasAcademicKeyword = checkIfAcademicKeyword(sectionText);
    
    // Validate section numbers
    let isValidNumber = false;
    if (patternType === 'numbered-arabic') {
      const firstNumber = parseInt(sectionNumber.split('.')[0]);
      isValidNumber = firstNumber <= 20;
    } else if (patternType === 'numbered-letter') {
      // Allow A-Z with optional sub-numbers
      const letterPart = sectionNumber.split('.')[0];
      const subNumberPart = sectionNumber.split('.')[1];
      
      isValidNumber = /^[A-Z]$/.test(letterPart) && 
                     (!subNumberPart || (parseInt(subNumberPart) <= 20));
    } else if (patternType === 'numbered-roman') {
      isValidNumber = /^(I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII|XIII|XIV|XV|XVI|XVII|XVIII|XIX|XX)$/.test(sectionNumber);
    } else if (patternType === 'numbered-sub') {
      isValidNumber = /^([a-z]|i|ii|iii|iv|v|vi|vii|viii|ix|x)$/.test(sectionNumber);
    } else if (patternType === 'numbered-parentheses') {
      isValidNumber = /^([A-Za-z]|\d{1,2})$/.test(sectionNumber);
    }
    
    // Check if text looks like heading
    const textLooksLikeHeading = sectionText.length <= 80 && 
                                !sectionText.includes('.') && 
                                !/^[a-z]/.test(sectionText) &&
                                sectionText.split(' ').length <= 10 &&
                                sectionText.trim().length > 0;
    
    if (isValidNumber && textLooksLikeHeading) {
      score = hasAcademicKeyword ? 150 : 100; // Bonus for academic content
    }
  } 
  // 3. If no numbered section, check for pure academic keywords
  else {
    hasAcademicKeyword = checkIfAcademicKeyword(text);
    if (hasAcademicKeyword) {
      // Only allow high-level standalone academic keywords
      const standaloneKeywords = /^(abstract|introduction|background|methodology|methods|results|discussion|conclusion|conclusions|references|bibliography|acknowledgments|acknowledgements|appendix|appendices)$/i;
      
      if (standaloneKeywords.test(text.trim())) {
        patternType = 'academic-keyword';
        sectionText = text;
        score = 100;
      }
      // Other academic keywords (like "analysis", "evaluation", "data") need numbering to be valid
    }
  }
  
  return {
    isSection,
    sectionNumber,
    sectionText,
    patternType,
    level,
    score,
    hasAcademicKeyword,
    // Legacy compatibility
    isAcademicKeyword: hasAcademicKeyword,
    isTitleCase: false,
    isAllCaps: false
  };
}


/**
 * Enhanced section extraction focusing on font size and style changes
 */
export async function extractSectionsFromPDF(file: File) {
  const data = await file.arrayBuffer();
  const pdf = await getDocument({ data }).promise;

  const sections: { 
    title: string; 
    page: number; 
    level: number; 
    confidence: number;
    yPosition: number;
    details: {
      fontSizeRule: any;
      fontStyleRule: any;
      textualPatternRule: any; // NEW: Numbers + Academic words
      patternRule: any;        // NEW: Uppercase/Titlecase only
      spacingRule: any;
      shortLineRule: any;
    };
  }[] = [];
  
  const seen = new Set<string>();

  for (let pageIndex = 0; pageIndex < pdf.numPages; pageIndex++) {
    const page = await pdf.getPage(pageIndex + 1);
    const textContent = await page.getTextContent();
    
    // Group items by line
    const lines = groupItemsByLine(textContent.items);
    
    // Analyze document for body text characteristics
    const bodyTextAnalysis = analyzeDocumentBodyText(lines);
    const avgLineSpacing = calculateAverageLineSpacing(lines);
    
    console.log(`📊 Page ${pageIndex + 1} - Body text font: ${bodyTextAnalysis.dominantFont}, size: ${bodyTextAnalysis.bodyTextSize.toFixed(1)}`);
    
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const lineItems = lines[lineIndex];
      const lineText = combineLineText(lineItems);
      
      if (!lineText || lineText.length < 2) continue;

      const str = lineText.replace(/\s+/g, " ").trim();

      // Apply the reorganized rules
      const fontSizeRule = checkFontSizeRule(lineItems, bodyTextAnalysis.bodyTextSize);
      const fontStyleRule = checkFontStyleRule(lineItems, bodyTextAnalysis.dominantFont);
      const patternRule = checkPatternRule(str);               // NEW: Visual patterns
      const spacingRule = checkSpacingRule(lineIndex, lines, avgLineSpacing);
      const shortLineRule = checkShortLineRule(str);
      const textualPatternRule = checkTextualPatternRule(str); // NEW: Semantic patterns

      // Calculate total confidence
      const confidence =
                      fontSizeRule.score * 0.25 +
                      fontStyleRule.score * 0.10 +
                      textualPatternRule.score * 0.35 +
                      patternRule.score * 0.10 +
                      spacingRule.score * 0.10 +
                      shortLineRule.score * 0.10;
      
      if (fontSizeRule.isVerySmallFont) continue; // Skip very small fonts (footnotes, captions, etc.)
      // Heading candidate criteria
      const isHeadingCandidate = confidence >=70; // Require multiple rules or strong semantic match
      
      if (!isHeadingCandidate) continue;

      const key = `${str}@${pageIndex + 1}`;
      if (seen.has(key)) continue;
      seen.add(key);

      // Get y-position for sorting
      const yPosition = lineItems[0]?.transform[5] || 0;

      // Determine level - prioritize textual pattern rule
      const isSection = textualPatternRule.isSection;
      const finalLevel = isSection ? textualPatternRule.level : 1;

      sections.push({
        title: str,
        page: pageIndex + 1,
        level: finalLevel,
        confidence,
        yPosition,
        details: {
          fontSizeRule,
          fontStyleRule,
          textualPatternRule, // Semantic patterns (numbers + academic)
          patternRule,        // Visual patterns (uppercase/titlecase)
          spacingRule,
          shortLineRule
        }
      });

      // Enhanced logging
      console.log(`✅ [${confidence}pts] "${str}" (page ${pageIndex + 1}, level ${finalLevel})`);
      console.log(`   Font: ${fontStyleRule.lineFontName} (${fontSizeRule.lineFontSize.toFixed(1)}px vs ${bodyTextAnalysis.bodyTextSize.toFixed(1)}px body)`);
      
      if (isSection) {
        console.log(`   📍 Textual Pattern (${textualPatternRule.patternType}): ${textualPatternRule.sectionNumber} -> "${textualPatternRule.sectionText}"`);
      }
      
      if (patternRule.score > 0) {
        console.log(`   🎨 Visual Pattern: ${patternRule.patternType}`);
      }
      
      console.log(`   Rules: Size(${fontSizeRule.score}) Style(${fontStyleRule.score}) Textual(${textualPatternRule.score}) Visual(${patternRule.score}) Spacing(${spacingRule.score}) Short(${shortLineRule.score})`);
    }
  }

  // Sort by appearance order
  sections.sort((a, b) => {
    if (a.page !== b.page) return a.page - b.page;
    return b.yPosition - a.yPosition;
  });

  console.log("📘 Extracted sections:", sections);
  return sections;
}