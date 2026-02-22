export const platformStyles: Record<string, { color: string; label: string }> = {
  twitter: { color: "bg-sky-400", label: "Twitter" },
  linkedin: { color: "bg-blue-600", label: "LinkedIn" },
  blog: { color: "bg-emerald-500", label: "Blog" },
  reddit: { color: "bg-orange-500", label: "Reddit" },
  email: { color: "bg-gray-500", label: "Email" },
  other: { color: "bg-gray-400", label: "Other" },
};

const PLATFORM_URL_PATTERNS: Record<string, RegExp[]> = {
  twitter: [/(?:twitter\.com|x\.com)/i],
  linkedin: [/linkedin\.com/i],
  reddit: [/(?:reddit\.com|old\.reddit\.com)/i],
  blog: [/(?:medium\.com|substack\.com|dev\.to|hashnode\.dev)/i],
};

export function detectPlatform(url: string): string | null {
  try {
    const hostname = new URL(url).hostname;
    for (const [platform, patterns] of Object.entries(PLATFORM_URL_PATTERNS)) {
      if (patterns.some((p) => p.test(hostname))) return platform;
    }
  } catch {
    // Invalid URL — return null
  }
  return null;
}
