const fs = require('fs');

const content = fs.readFileSync('views/pages/home.ejs', 'utf8');

// The layout mapping.
// We will find each section by its comment header and wrap it in Flexbox order wrapper.
// Actually, using Flexbox order wrapper is the simplest and least intrusive way!

const flexWrapperStart = `<%
  let layout = [];
  try {
    layout = JSON.parse(settings.home_layout);
  } catch(e) {
    layout = ['hero', 'categories', 'promo1', 'bestsellers', 'trust', 'ad1', 'promo2', 'featured', 'ad2', 'promo3', 'toprated', 'newsletter'];
  }
%>
<div style="display: flex; flex-direction: column;">`;
const flexWrapperEnd = `</div>`;

// Replace the first <!-- Image Hero Banner --> with flexWrapperStart + <!-- Image Hero Banner -->
let newContent = content.replace('<!-- Image Hero Banner -->', flexWrapperStart + '\n\n' + '<!-- Image Hero Banner -->');

// Replace the <%- include('../partials/footer') %> with flexWrapperEnd + <%- include('../partials/footer') %>
newContent = newContent.replace('<%- include(\'../partials/footer\') %>', flexWrapperEnd + '\n\n' + '<%- include(\'../partials/footer\') %>');

// Now, wrap each section.
const sections = {
  'hero': '<!-- Image Hero Banner -->',
  'categories': '<!-- Shop by Category -->',
  'promo1': '<!-- Promo 1 -->',
  'bestsellers': '<!-- Best Sellers -->',
  'trust': '<!-- Trust Badges -->',
  'ad1': '<% if (settings.ad1_image) { %>\\s*<!-- Custom Advertisement 1 -->',
  'promo2': '<!-- Promo 2 -->',
  'featured': '<!-- Featured Products -->',
  'ad2': '<% if (settings.ad2_image) { %>\\s*<!-- Custom Advertisement 2 -->',
  'promo3': '<!-- Promo 3 -->',
  'toprated': '<!-- Top Rated -->',
  'newsletter': '<!-- Newsletter CTA -->'
};

// We will use regex to find each section and wrap it.
// The easiest way is to split by these comments, but they are intertwined.
// Let's do it manually via a smarter regex.

function wrapSection(key, startCommentRegex, nextCommentRegex, isConditional) {
  const r = new RegExp(`(${startCommentRegex}[\\s\\S]*?)(?=${nextCommentRegex})`);
  newContent = newContent.replace(r, (match, p1) => {
    // If it's a conditional block, we need to wrap the whole thing.
    return `<div style="order: <%= layout.indexOf('${key}') > -1 ? layout.indexOf('${key}') : 99 %>; display: <%= settings.show_${key} === 'false' ? 'none' : 'block' %>;">\n` + p1 + `\n</div>\n\n`;
  });
}

wrapSection('hero', '<!-- Image Hero Banner -->', '<!-- Shop by Category -->');
wrapSection('categories', '<!-- Shop by Category -->', '<!-- Promo 1 -->');
wrapSection('promo1', '<!-- Promo 1 -->', '<!-- Best Sellers -->');
wrapSection('bestsellers', '<!-- Best Sellers -->', '<!-- Trust Badges -->');
wrapSection('trust', '<!-- Trust Badges -->', '<% if \\(settings\\.ad1_image\\) { %>\\s*<!-- Custom Advertisement 1 -->');
wrapSection('ad1', '<% if \\(settings\\.ad1_image\\) { %>\\s*<!-- Custom Advertisement 1 -->', '<!-- Promo 2 -->');
wrapSection('promo2', '<!-- Promo 2 -->', '<!-- Featured Products -->');
wrapSection('featured', '<!-- Featured Products -->', '<% if \\(settings\\.ad2_image\\) { %>\\s*<!-- Custom Advertisement 2 -->');
wrapSection('ad2', '<% if \\(settings\\.ad2_image\\) { %>\\s*<!-- Custom Advertisement 2 -->', '<!-- Promo 3 -->');
wrapSection('promo3', '<!-- Promo 3 -->', '<!-- Top Rated -->');
wrapSection('toprated', '<!-- Top Rated -->', '<!-- Newsletter CTA -->');
wrapSection('newsletter', '<!-- Newsletter CTA -->', `</div>\\s*<%- include\\('\\.\\./partials/footer'\\) %>`);

fs.writeFileSync('views/pages/home.ejs', newContent);
console.log('Successfully refactored home.ejs');
