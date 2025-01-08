import { z } from 'zod';
import { load as cheerioLoad } from 'cheerio';
import { Tool } from './Tool';

function createWebBrowser() {
  const paramsSchema = z.object({
    url: z.string().describe('The URL to browse'),
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

    console.log('Browsing URL:', url);

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
