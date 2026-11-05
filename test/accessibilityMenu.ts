/**
 * Every customer page has the floating accessibility menu, its small script
 * and the page's translated browser messages. Tests that check a page works
 * without JavaScript, or does not echo request data, look at the rest of the
 * page by removing them first.
 */
export function withoutAccessibilityMenu(html: string): string {
  return html
    .replace(/<details class="a11y-widget[\s\S]*?<\/details>/, '')
    .replace(/<script src="\/client\/a11yMenu\.js" defer><\/script>/, '')
    .replace(
      /<script type="application\/json" id="i18n-messages">[\s\S]*?<\/script>/,
      '',
    );
}
