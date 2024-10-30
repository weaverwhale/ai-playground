import { z } from 'zod';
import { load as cheerioLoad } from 'cheerio';
import { Tool } from './Tool';

const DEFAULT_HEADERS = {
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Encoding': 'gzip, deflate',
  'Accept-Language': 'en-US,en;q=0.5',
  'Alt-Used': 'LEAVE-THIS-KEY-SET-BY-TOOL',
  Connection: 'keep-alive',
  // Host: "www.google.com",
  Referer: 'https://www.google.com/',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'cross-site',
  'Upgrade-Insecure-Requests': '1',
  'User-Agent':
    'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/111.0',
};

function createWebBrowser() {
  const paramsSchema = z.object({
    url: z.string(),
  });
  const name = 'web_browser';
  const description =
    'useful for when you need to summarize a webpage. input should be a ONE valid http URL including protocol.';

  const execute = async ({ url }: z.infer<typeof paramsSchema>) => {
    const config = {
      headers: DEFAULT_HEADERS,
    };

    try {
      const htmlResponse = await fetch(url, config);
      const allowedContentTypes = [
        'text/html',
        'application/json',
        'application/xml',
        'application/javascript',
        'text/plain',
      ];
      const contentType = htmlResponse.headers.get('content-type');
      const contentTypeArray = contentType?.split(';');
      if (
        contentTypeArray &&
        contentTypeArray[0] &&
        !allowedContentTypes.includes(contentTypeArray[0])
      ) {
        return `Error in get content of web: returned page was not utf8`;
      }
      const html = await htmlResponse.text();
      const $ = cheerioLoad(html, { scriptingEnabled: true });
      let text = '';
      const rootElement = 'body';

      $(`${rootElement} *`)
        .not('style, script, svg')
        .each((_i: number, elem) => {
          let content = $(elem).clone().children().remove().end().text().trim();
          // Skip if content contains script tags
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
    } catch (error) {
      return `Error in getHtml: ${error}`;
    }
  };

  return new Tool(paramsSchema, name, description, execute);
}

export { createWebBrowser };
