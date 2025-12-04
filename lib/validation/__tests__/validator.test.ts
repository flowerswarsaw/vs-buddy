/**
 * Unit tests for validation utilities
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { validate, sanitizeString } from '../validator';
import { ValidationError } from '@/lib/errors';

describe('validate', () => {
  it('should return success with valid data', () => {
    const schema = z.object({
      name: z.string(),
      age: z.number(),
    });

    const data = { name: 'John', age: 30 };
    const result = validate(schema, data);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(data);
    }
  });

  it('should return error with invalid data', () => {
    const schema = z.object({
      name: z.string(),
      age: z.number(),
    });

    const data = { name: 'John', age: 'thirty' }; // Invalid age
    const result = validate(schema, data);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(ValidationError);
      expect(result.error.message).toContain('age');
    }
  });

  it('should include context in error', () => {
    const schema = z.object({
      name: z.string(),
    });

    const data = { name: 123 };
    const context = { userId: 'user-123', requestId: 'req-456' };
    const result = validate(schema, data, context);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.context.userId).toBe('user-123');
      expect(result.error.context.requestId).toBe('req-456');
    }
  });

  it('should format multiple validation errors', () => {
    const schema = z.object({
      name: z.string(),
      age: z.number(),
      email: z.string().email(),
    });

    const data = { name: 123, age: 'thirty', email: 'invalid' };
    const result = validate(schema, data);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain('name');
      expect(result.error.message).toContain('age');
      expect(result.error.message).toContain('email');
    }
  });
});

describe('sanitizeString', () => {
  it('should remove script tags', () => {
    const input = '<script>alert("xss")</script>Hello';
    const output = sanitizeString(input);
    expect(output).toBe('Hello');
  });

  it('should remove script tags with attributes', () => {
    const input = '<script type="text/javascript">alert("xss")</script>Safe text';
    const output = sanitizeString(input);
    expect(output).toBe('Safe text');
  });

  it('should remove iframe tags', () => {
    const input = '<iframe src="evil.com"></iframe>Safe content';
    const output = sanitizeString(input);
    expect(output).toBe('Safe content');
  });

  it('should remove javascript: protocol', () => {
    const input = '<a href="javascript:alert(\'xss\')">Click</a>';
    const output = sanitizeString(input);
    expect(output).toBe('<a href="">Click</a>');
  });

  it('should remove event handlers with quotes', () => {
    const input = '<div onclick="alert(\'xss\')">Click me</div>';
    const output = sanitizeString(input);
    expect(output).toBe('<div >Click me</div>');
  });

  it('should remove event handlers without quotes', () => {
    const input = '<img onerror=alert(1) src="x">';
    const output = sanitizeString(input);
    expect(output).toBe('<img  src="x">');
  });

  it('should handle empty strings', () => {
    expect(sanitizeString('')).toBe('');
  });

  it('should handle strings without dangerous HTML', () => {
    const input = 'Hello, World!';
    expect(sanitizeString(input)).toBe(input);
  });

  it('should allow safe HTML tags', () => {
    // sanitizeString only removes dangerous tags/attributes, not all HTML
    const input = '<div><span>Safe content</span></div>';
    const output = sanitizeString(input);
    expect(output).toBe('<div><span>Safe content</span></div>');
  });

  it('should handle mixed dangerous and safe content', () => {
    const input = '<div><script>alert(1)</script><p>Safe</p></div>';
    const output = sanitizeString(input);
    expect(output).toBe('<div><p>Safe</p></div>');
  });
});
