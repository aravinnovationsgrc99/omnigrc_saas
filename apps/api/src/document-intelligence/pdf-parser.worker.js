/**
 * Isolated Child Process Worker for Untrusted PDF Extraction
 * Runs in a separate OS process with bounded memory, configurable timeout, and sanitized environment.
 */
const fs = require('fs');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require('pdf-parse');

const MAX_PDF_PAGES = 50;
const MAX_TEXT_LENGTH = 100000;

function normalizeExtractedText(text) {
  if (!text) return '';
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+\n/g, '\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function applyTextBounds(text, maxLength) {
  const limit = maxLength || MAX_TEXT_LENGTH;
  if (text.length > limit) {
    return {
      text: text.substring(0, limit),
      isTruncated: true,
      truncationReason: `Extracted text exceeded max limit of ${limit} characters. Truncated safely.`,
    };
  }
  return { text, isTruncated: false };
}

async function processPdf(payload) {
  const { filePath, bufferBase64, maxPages = MAX_PDF_PAGES, maxTextLength = MAX_TEXT_LENGTH } = payload;

  let buffer;
  if (filePath) {
    buffer = await fs.promises.readFile(filePath);
  } else if (bufferBase64) {
    buffer = Buffer.from(bufferBase64, 'base64');
  } else {
    throw new Error('No input PDF filePath or buffer provided.');
  }

  if (!buffer || buffer.length === 0) {
    return {
      success: true,
      isEmpty: true,
      fullText: '',
      sections: [],
      pageCount: 0,
      isTruncated: false,
    };
  }

  const pageSections = [];
  let isTruncated = false;
  let truncationReason;

  const renderPage = (pageData) => {
    const pageNum = pageData.pageNumber || pageData.pageIndex + 1;
    return pageData
      .getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false })
      .then((textContent) => {
        let lastY;
        let text = '';
        for (const item of textContent.items) {
          if (lastY === item.transform[5] || lastY === undefined) {
            text += item.str;
          } else {
            text += '\n' + item.str;
          }
          lastY = item.transform[5];
        }

        const cleanPageText = normalizeExtractedText(text);
        if (cleanPageText.length > 0) {
          pageSections.push({
            page: pageNum,
            text: cleanPageText,
          });
        }
        return cleanPageText;
      });
  };

  const parsed = await pdfParse(buffer, {
    max: maxPages,
    pagerender: renderPage,
  });

  const totalPages = parsed.numpages || 0;
  if (totalPages > maxPages) {
    isTruncated = true;
    truncationReason = `PDF page count (${totalPages}) exceeds maximum limit of ${maxPages}. Remaining pages skipped.`;
  }

  pageSections.sort((a, b) => (a.page || 0) - (b.page || 0));

  const combinedText = pageSections.map((s) => s.text).join('\n\n');
  const normalizedFullText = normalizeExtractedText(combinedText);

  if (!normalizedFullText || normalizedFullText.length === 0) {
    return {
      success: true,
      isEmpty: true,
      fullText: '',
      sections: [],
      pageCount: totalPages,
      isTruncated: false,
    };
  }

  const { text: boundedText, isTruncated: textTruncated, truncationReason: textReason } = applyTextBounds(
    normalizedFullText,
    maxTextLength,
  );
  if (textTruncated) {
    isTruncated = true;
    truncationReason = textReason;
  }

  return {
    success: true,
    isEmpty: false,
    fullText: boundedText,
    sections: pageSections.length > 0 ? pageSections : [{ page: 1, text: boundedText }],
    pageCount: totalPages,
    isTruncated,
    truncationReason,
  };
}

process.on('message', async (message) => {
  try {
    if (message && message.type === 'PARSE_PDF') {
      const result = await processPdf(message.payload);
      if (process.send) {
        process.send({ type: 'PDF_RESULT', result });
      }
    } else {
      if (process.send) {
        process.send({ type: 'PDF_ERROR', error: 'Unknown message type' });
      }
    }
  } catch (err) {
    const isPassword = err?.name === 'PasswordException' || /password/i.test(err?.message || '');
    if (process.send) {
      process.send({
        type: 'PDF_ERROR',
        error: err?.message || 'Unknown PDF parse error',
        isPassword,
      });
    }
  }
});
