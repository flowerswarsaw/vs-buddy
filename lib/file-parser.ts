import pdf from 'pdf-parse';
import mammoth from 'mammoth';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const SUPPORTED_EXTENSIONS = ['txt', 'pdf', 'docx'] as const;
type SupportedExtension = (typeof SUPPORTED_EXTENSIONS)[number];

export function getFileExtension(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() || '';
}

export function isSupportedFileType(filename: string): boolean {
  const ext = getFileExtension(filename);
  return SUPPORTED_EXTENSIONS.includes(ext as SupportedExtension);
}

export function validateFileSize(size: number): void {
  if (size > MAX_FILE_SIZE) {
    throw new Error(
      `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`
    );
  }
}

export function getSupportedExtensionsString(): string {
  return SUPPORTED_EXTENSIONS.map((ext) => `.${ext}`).join(', ');
}

/**
 * Parse a text file from ArrayBuffer
 */
async function parseTxt(buffer: ArrayBuffer): Promise<string> {
  const decoder = new TextDecoder('utf-8');
  return decoder.decode(buffer);
}

/**
 * Parse a PDF file from ArrayBuffer
 */
async function parsePdf(buffer: ArrayBuffer): Promise<string> {
  const data = await pdf(Buffer.from(buffer));
  return data.text;
}

/**
 * Parse a DOCX file from ArrayBuffer
 */
async function parseDocx(buffer: ArrayBuffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

/**
 * Parse file content based on extension
 */
export async function parseFileContent(
  buffer: ArrayBuffer,
  filename: string
): Promise<string> {
  const ext = getFileExtension(filename);

  if (!isSupportedFileType(filename)) {
    throw new Error(
      `Unsupported file type: .${ext}. Supported types: ${getSupportedExtensionsString()}`
    );
  }

  let text: string;

  switch (ext as SupportedExtension) {
    case 'txt':
      text = await parseTxt(buffer);
      break;
    case 'pdf':
      text = await parsePdf(buffer);
      break;
    case 'docx':
      text = await parseDocx(buffer);
      break;
    default:
      throw new Error(`Unsupported file type: .${ext}`);
  }

  // Clean up and validate extracted text
  text = text.trim();

  if (!text) {
    throw new Error('Could not extract any text from file');
  }

  return text;
}

/**
 * Get title from filename (without extension)
 */
export function getTitleFromFilename(filename: string): string {
  const ext = getFileExtension(filename);
  if (ext) {
    return filename.slice(0, -(ext.length + 1));
  }
  return filename;
}
