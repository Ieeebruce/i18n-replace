import { escapeHtml } from '../../src/processor/process-and-delete-mode';

describe('Utils Functions', () => {
  describe('escapeHtml', () => {
    it('should escape HTML special characters', () => {
      const html = '<div class="test">Hello & World</div>';
      const escaped = escapeHtml(html);
      
      expect(escaped).toBe('&lt;div class=&quot;test&quot;&gt;Hello &amp; World&lt;/div&gt;');
    });

    it('should handle single quotes', () => {
      const html = "<div class='test'>Hello</div>";
      const escaped = escapeHtml(html);
      
      expect(escaped).toBe('&lt;div class=&#39;test&#39;&gt;Hello&lt;/div&gt;');
    });

    it('should handle null and undefined', () => {
      expect(escapeHtml(null as any)).toBe('');
      expect(escapeHtml(undefined as any)).toBe('');
    });

    it('should return empty string for empty input', () => {
      expect(escapeHtml('')).toBe('');
    });

    it('should handle numbers', () => {
      expect(escapeHtml(123 as any)).toBe('123');
    });
  });
});
