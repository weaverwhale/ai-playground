import { z } from 'zod';
import { load as cheerioLoad } from 'cheerio';
import { Tool } from './Tool';

function createWebBrowser() {
  const paramsSchema = z.object({
    url: z.string().transform((url) => {
      // Remove any leading/trailing whitespace
      url = url.trim();

      // First, ensure the URL starts with http:// or https://
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
      }

      try {
        const parsedUrl = new URL(url);
        let hostname = parsedUrl.hostname;

        // Remove 'www.' if it exists for cleaner hostname checking
        if (hostname.startsWith('www.')) {
          hostname = hostname.substring(4);
        }

        // If hostname doesn't contain a dot (no TLD) or ends with a dot, add .com
        if (!hostname.includes('.') || hostname.endsWith('.')) {
          hostname = hostname.replace(/\.+$/, '') + '.com'; // Remove any trailing dots and add .com

          // Reconstruct the URL with the new hostname
          const newUrl = new URL(url);
          newUrl.hostname = hostname;
          if (parsedUrl.hostname.startsWith('www.')) {
            newUrl.hostname = 'www.' + hostname;
          }
          return newUrl.toString();
        }

        return parsedUrl.toString();
      } catch (error) {
        // If URL parsing fails, try to construct a valid URL
        const cleanedUrl = url
          .replace(/^https?:\/\//, '')
          .replace(/^www\./, '');
        if (!cleanedUrl.includes('.')) {
          return `https://${cleanedUrl}.com`;
        }
        throw new Error(
          `Invalid URL format: ${
            error instanceof Error ? error.message : 'unknown error'
          }`
        );
      }
    }),
  });

  const name = 'web_browser';
  const description =
    'useful for when you need to get live information from a webpage.';

  const execute = async ({ url }: z.infer<typeof paramsSchema>) => {
    // Validate URL
    let validUrl: URL;
    try {
      validUrl = new URL(url);
      if (!validUrl.protocol || !validUrl.hostname) {
        return { finished: false };
      }
    } catch {
      return { finished: false };
    }

    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url.replace(/`/g, ''))}`;

    try {
      const htmlResponse = await fetch(proxyUrl);
      if (!htmlResponse.ok) {
        return { finished: false };
      }

      const html = await htmlResponse.text();
      const $ = cheerioLoad(html, { scriptingEnabled: true });
      let text = '';
      const rootElement = 'body';

      $(`${rootElement} *`)
        .not('style, script, svg')
        .each((_i: number, elem) => {
          let content = $(elem).clone().children().remove().end().text().trim();
          if ($(elem).find('script').length > 0) {
            return;
          }
          const $el = $(elem);
          let href = $el.attr('href');
          if ($el.prop('tagName')?.toLowerCase() === 'a' && href) {
            if (!href.startsWith('http')) {
              try {
                href = new URL(href, url).toString();
              } catch {
                href = '';
              }
            }
            const imgAlt = $el.find('img[alt]').attr('alt')?.trim();
            if (imgAlt) {
              content += ` ${imgAlt}`;
            }
            text += ` [${content}](${href})`;
          } else if (content !== '') {
            text += ` ${content}`;
          }
        });

      return text.trim().replace(/\n+/g, ' ');
    } catch {
      return { finished: false };
    }
  };

  return new Tool(paramsSchema, name, description, execute);
}

export { createWebBrowser };
